// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// =============================================================================
// IMilestonePayEscrow — Interface for MilestonePayEscrow
// =============================================================================
//
// STATUS: NOT INDEPENDENTLY AUDITED — matches MilestonePayEscrow.sol
// TARGET CHAIN: Arc Mainnet (chain ID 5042)
// USDC: 0x3600000000000000000000000000000000000000 (6-decimal ERC-20 interface)
//
// This interface is the canonical surface for:
//   - Frontend ABI generation (import into viem/wagmi config)
//   - External contract integrations (e.g. a future v2 wrapper)
//   - Static analysis tooling
//
// All amounts are in USDC ERC-20 units (6 decimals).
// =============================================================================

/// @title IMilestonePayEscrow
/// @notice Interface for the MilestonePay USDC escrow contract on Arc Mainnet.
interface IMilestonePayEscrow {

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotClient();
    error NotProvider();
    error NotResolver();
    error NotParty();
    error InvalidMilestoneStatus();
    error MilestoneExpired();
    error MilestoneNotExpired();
    error ZeroAddress();
    error InvalidArrayLength();
    error ArrayLengthMismatch();
    error ZeroAmount();
    error ExpiryInPast();
    error ZeroDeliverable();
    error MaxMilestonesExceeded();
    error InvalidMaxRevisions();
    error TokenTransferFailed();
    error NothingToWithdraw();
    error DisputeDeadlineNotReached();
    error InvalidDisputeTimeout();

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a new agreement is created.
    event AgreementCreated(
        uint256 indexed agreementId,
        address indexed client,
        address indexed provider,
        address resolver,
        bytes32 termsHash,
        uint8 milestoneCount
    );

    /// @notice Emitted when a milestone is funded by the client.
    event MilestoneFunded(uint256 indexed agreementId, uint8 indexed milestoneIndex, uint256 amount);

    /// @notice Emitted when the provider submits or resubmits a deliverable hash.
    event DeliverableSubmitted(uint256 indexed agreementId, uint8 indexed milestoneIndex, bytes32 deliverableHash);

    /// @notice Emitted when payment is credited to the provider's pending withdrawals.
    /// @dev Also emitted via claimDisputeRefund when disputeDefaultToProvider is true.
    event PaymentReleased(
        uint256 indexed agreementId,
        uint8 indexed milestoneIndex,
        address indexed recipient,
        uint256 amount
    );

    /// @notice Emitted when the client requests changes within the revision limit.
    event ChangesRequested(
        uint256 indexed agreementId,
        uint8 indexed milestoneIndex,
        bytes32 reasonHash,
        uint8 revisionCount
    );

    /// @notice Emitted when a dispute is raised (by either party, or auto-escalated from requestChanges).
    event DisputeRaised(
        uint256 indexed agreementId,
        uint8 indexed milestoneIndex,
        address indexed raisedBy,
        bytes32 reasonHash
    );

    /// @notice Emitted alongside DisputeRaised; records the absolute deadline for resolver action.
    event DisputeDeadlineSet(uint256 indexed agreementId, uint8 indexed milestoneIndex, uint256 disputeDeadline);

    /// @notice Emitted when the resolver settles a dispute.
    event DisputeResolved(
        uint256 indexed agreementId,
        uint8 indexed milestoneIndex,
        bool releaseToProvider,
        uint256 amount
    );

    /// @notice Emitted when a refund is credited to the client's pending withdrawals.
    event RefundClaimed(
        uint256 indexed agreementId,
        uint8 indexed milestoneIndex,
        address indexed client,
        uint256 amount
    );

    /// @notice Emitted when an address withdraws their accumulated USDC credits.
    event Withdrawn(address indexed recipient, uint256 amount);

    // -------------------------------------------------------------------------
    // Types (reproduced for ABI consumers that import only this interface)
    // -------------------------------------------------------------------------

    /// @notice Per-milestone lifecycle status.
    /// @dev Pending (0), Funded (1), Submitted (2), Released (3), Revision (4), Disputed (5), Refunded (6)
    enum MilestoneStatus {
        Pending,
        Funded,
        Submitted,
        Released,
        Revision,
        Disputed,
        Refunded
    }

    /// @notice An escrow agreement between one client, one provider, and one resolver.
    struct Agreement {
        address client;
        address provider;
        address resolver;
        bytes32 termsHash;
        uint8 milestoneCount;
        bool active;
        uint256 disputeTimeout;
        bool disputeDefaultToProvider;
    }

    /// @notice A single milestone within an agreement.
    struct Milestone {
        uint256 amount;           // USDC, 6 decimals
        uint256 expiry;           // unix timestamp; claimRefund allowed after this
        MilestoneStatus status;
        bytes32 deliverableHash;  // set by provider on submitDeliverable
        bytes32 reasonHash;       // set by client on requestChanges / raiseDispute
        uint8 revisionCount;      // increments on each requestChanges below limit
        uint8 maxRevisions;       // immutable after creation; 1–5; default 3
        uint256 disputeDeadline;  // set when status transitions to Disputed
    }

    // -------------------------------------------------------------------------
    // State variables (read-only accessors)
    // -------------------------------------------------------------------------

    /// @notice The immutable USDC ERC-20 address this contract escrows.
    function usdc() external view returns (address);

    /// @notice Monotonically increasing counter; the next agreement will use this value.
    function agreementCounter() external view returns (uint256);

    /// @notice Returns the Agreement struct for a given agreementId.
    function agreements(uint256 agreementId)
        external
        view
        returns (
            address client,
            address provider,
            address resolver,
            bytes32 termsHash,
            uint8 milestoneCount,
            bool active,
            uint256 disputeTimeout,
            bool disputeDefaultToProvider
        );

    /// @notice Returns the Milestone struct for a given (agreementId, milestoneIndex).
    function milestones(uint256 agreementId, uint8 milestoneIndex)
        external
        view
        returns (
            uint256 amount,
            uint256 expiry,
            MilestoneStatus status,
            bytes32 deliverableHash,
            bytes32 reasonHash,
            uint8 revisionCount,
            uint8 maxRevisions,
            uint256 disputeDeadline
        );

    /// @notice Claimable USDC balance for an address (accumulated credits not yet withdrawn).
    function pendingWithdrawals(address account) external view returns (uint256);

    // -------------------------------------------------------------------------
    // Agreement creation
    // -------------------------------------------------------------------------

    /// @notice Creates a new multi-milestone escrow agreement. Caller becomes the client.
    /// @param provider Service provider address.
    /// @param resolver Pre-agreed neutral dispute resolver address.
    ///                 Must not equal client or provider.
    /// @param termsHash SHA-256 (or keccak256) hash of the offchain agreement document.
    ///                  Both parties must verify this hash before the client calls this function.
    /// @param amounts Milestone amounts in USDC ERC-20 units (6 decimals). Length 1–5.
    /// @param expiries Milestone expiry unix timestamps. Must be in the future. Same length as amounts.
    /// @param maxRevisions Max revision rounds per milestone (1–5; pass 0 to default to 3).
    ///                     Immutable after creation. Same length as amounts.
    /// @param disputeTimeout Seconds after a dispute is raised before claimDisputeRefund is callable.
    ///                       Pass 0 to default to 30 days. Valid range: 1 day to 90 days.
    /// @param disputeDefaultToProvider Timeout payout direction agreed at creation.
    ///                                 true = provider receives funds if resolver is unresponsive.
    ///                                 false = client is refunded if resolver is unresponsive.
    /// @return agreementId The newly created agreement identifier (starts at 1).
    function createAgreement(
        address provider,
        address resolver,
        bytes32 termsHash,
        uint256[] calldata amounts,
        uint256[] calldata expiries,
        uint8[] calldata maxRevisions,
        uint256 disputeTimeout,
        bool disputeDefaultToProvider
    ) external returns (uint256 agreementId);

    // -------------------------------------------------------------------------
    // Milestone lifecycle
    // -------------------------------------------------------------------------

    /// @notice Funds a Pending milestone by transferring USDC from the client into escrow.
    /// @dev Caller must have approved the contract for at least milestone.amount USDC.
    ///      Uses nonReentrant; updates status before external call (CEI).
    /// @param agreementId Agreement identifier.
    /// @param milestoneIndex Index within the agreement's milestone array.
    function fund(uint256 agreementId, uint8 milestoneIndex) external;

    /// @notice Submits or resubmits a deliverable hash for a Funded or Revision milestone.
    /// @dev Must be called before milestone.expiry. deliverableHash must be non-zero.
    /// @param agreementId Agreement identifier.
    /// @param milestoneIndex Milestone index.
    /// @param deliverableHash keccak256 (or SHA-256 packed as bytes32) of the offchain deliverable URI.
    function submitDeliverable(uint256 agreementId, uint8 milestoneIndex, bytes32 deliverableHash) external;

    /// @notice Approves a submitted deliverable, crediting the provider's pendingWithdrawals.
    /// @dev Status must be Submitted. Checks-effects: status set to Released before credit.
    ///      If all milestones are terminal, sets agreement.active = false.
    /// @param agreementId Agreement identifier.
    /// @param milestoneIndex Milestone index.
    function approveRelease(uint256 agreementId, uint8 milestoneIndex) external;

    /// @notice Requests changes on a submitted milestone, or auto-escalates to dispute at revision limit.
    /// @dev If revisionCount < maxRevisions: status → Revision, revisionCount++.
    ///      If revisionCount >= maxRevisions: status → Disputed, disputeDeadline set, DisputeRaised emitted.
    /// @param agreementId Agreement identifier.
    /// @param milestoneIndex Milestone index.
    /// @param reasonHash Hash of the offchain reason document or message.
    function requestChanges(uint256 agreementId, uint8 milestoneIndex, bytes32 reasonHash) external;

    /// @notice Raises a dispute on a Funded, Submitted, or Revision milestone.
    /// @dev Sets disputeDeadline = block.timestamp + agreement.disputeTimeout.
    ///      Callable by client or provider.
    /// @param agreementId Agreement identifier.
    /// @param milestoneIndex Milestone index.
    /// @param reasonHash Hash of the offchain dispute reason.
    function raiseDispute(uint256 agreementId, uint8 milestoneIndex, bytes32 reasonHash) external;

    /// @notice Settles a Disputed milestone. Callable only by the named resolver.
    /// @dev Credits provider or client pendingWithdrawals per releaseToProvider.
    ///      If all milestones are terminal after this call, agreement.active = false.
    /// @param agreementId Agreement identifier.
    /// @param milestoneIndex Milestone index.
    /// @param releaseToProvider True to release to provider; false to refund client.
    function resolveDispute(uint256 agreementId, uint8 milestoneIndex, bool releaseToProvider) external;

    /// @notice Claims a refund for a Funded milestone whose provider did not submit before expiry.
    /// @dev Only allowed from Funded status. Once the provider has submitted, use raiseDispute.
    ///      block.timestamp must be >= milestone.expiry.
    /// @param agreementId Agreement identifier.
    /// @param milestoneIndex Milestone index.
    function claimRefund(uint256 agreementId, uint8 milestoneIndex) external;

    /// @notice Settles a Disputed milestone after the dispute deadline has passed.
    /// @dev Callable by either party (client or provider). Outcome is determined by
    ///      agreement.disputeDefaultToProvider, not by who calls — preventing grief-lock.
    ///      disputeDefaultToProvider=true → provider receives funds (Released).
    ///      disputeDefaultToProvider=false → client receives refund (Refunded).
    /// @param agreementId Agreement identifier.
    /// @param milestoneIndex Milestone index.
    function claimDisputeRefund(uint256 agreementId, uint8 milestoneIndex) external;

    // -------------------------------------------------------------------------
    // Withdrawal
    // -------------------------------------------------------------------------

    /// @notice Withdraws the caller's accumulated USDC credits from pendingWithdrawals.
    /// @dev Uses nonReentrant. Zeroes balance before transfer (CEI).
    ///      Reverts with NothingToWithdraw if balance is zero.
    function withdraw() external;
}
