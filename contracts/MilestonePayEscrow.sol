// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// =============================================================================
// MilestonePayEscrow — USDC escrow for fixed-price freelance milestones on Arc
// =============================================================================
//
// STATUS: NOT INDEPENDENTLY AUDITED
// This contract has not been reviewed by an independent third-party auditor.
// It MUST NOT be deployed to mainnet holding real funds until a professional
// security audit has been completed and all Critical and High findings resolved.
//
// TARGET CHAIN: Arc Mainnet (chain ID 5042)
// USDC: 0x3600000000000000000000000000000000000000 (6-decimal ERC-20 interface)
//
// TRUST MODEL:
//   - client   : creates agreement, funds milestones, approves or disputes
//   - provider  : submits deliverable hashes onchain
//   - resolver  : pre-agreed neutral address that decides disputed milestones
//   - No owner / admin / upgrade key exists. No address can seize user funds.
//   - All USDC flows use the ERC-20 interface (6 decimals).
//     Native USDC (18-decimal gas view) is never used in escrow arithmetic.
//
// PAYMENT MODEL: Pull-over-push.
//   Funds are credited to pendingWithdrawals[address]; recipients call withdraw().
//   This prevents a blocklisted address from permanently locking a milestone.
//
// DECIMAL HANDLING:
//   All amounts stored and compared in this contract are in USDC ERC-20 units
//   (6 decimals). The 18-decimal native view is exclusively for gas payment and
//   is never read or written here.
//
// =============================================================================

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MilestonePayEscrow is ReentrancyGuard {
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
    event AgreementCreated(
        uint256 indexed agreementId,
        address indexed client,
        address indexed provider,
        address resolver,
        bytes32 termsHash,
        uint8 milestoneCount
    );
    event MilestoneFunded(uint256 indexed agreementId, uint8 indexed milestoneIndex, uint256 amount);
    event DeliverableSubmitted(uint256 indexed agreementId, uint8 indexed milestoneIndex, bytes32 deliverableHash);
    event PaymentReleased(uint256 indexed agreementId, uint8 indexed milestoneIndex, address indexed recipient, uint256 amount);
    event ChangesRequested(uint256 indexed agreementId, uint8 indexed milestoneIndex, bytes32 reasonHash, uint8 revisionCount);
    event DisputeRaised(uint256 indexed agreementId, uint8 indexed milestoneIndex, address indexed raisedBy, bytes32 reasonHash);
    event DisputeDeadlineSet(uint256 indexed agreementId, uint8 indexed milestoneIndex, uint256 disputeDeadline);
    event DisputeResolved(uint256 indexed agreementId, uint8 indexed milestoneIndex, bool releaseToProvider, uint256 amount);
    event RefundClaimed(uint256 indexed agreementId, uint8 indexed milestoneIndex, address indexed client, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------
    enum MilestoneStatus {
        Pending,
        Funded,
        Submitted,
        Released,
        Revision,
        Disputed,
        Refunded
    }

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

    struct Milestone {
        uint256 amount;
        uint256 expiry;
        MilestoneStatus status;
        bytes32 deliverableHash;
        bytes32 reasonHash;
        uint8 revisionCount;
        uint8 maxRevisions;
        uint256 disputeDeadline;
    }

    IERC20 public immutable usdc;

    uint256 public agreementCounter = 1;

    mapping(uint256 agreementId => Agreement agreement) public agreements;
    mapping(uint256 agreementId => mapping(uint8 milestoneIndex => Milestone milestone)) public milestones;
    mapping(address => uint256) public pendingWithdrawals;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @notice Creates the escrow contract with an immutable USDC ERC-20 token address.
    /// @param usdc_ The USDC token contract address.
    constructor(address usdc_) {
        if (usdc_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
    }

    // -------------------------------------------------------------------------
    // External functions
    // -------------------------------------------------------------------------

    /// @notice Creates a new multi-milestone escrow agreement.
    /// @param provider The service provider address.
    /// @param resolver The neutral resolver address for disputes.
    /// @param termsHash Hash of the off-chain agreement terms.
    /// @param amounts Milestone amounts in USDC smallest units (6 decimals).
    /// @param expiries Milestone expiry timestamps.
    /// @param maxRevisions Maximum revision rounds per milestone (1-5, or 0 to default to 3).
    /// @param disputeTimeout Timeout in seconds used to set dispute deadlines (0 defaults to 30 days; otherwise 1-90 days).
    /// @param disputeDefaultToProvider True to release disputed funds to the provider by default when dispute timeout elapses; false to refund the client.
    /// @return agreementId The newly created agreement identifier.
    function createAgreement(
        address provider,
        address resolver,
        bytes32 termsHash,
        uint256[] calldata amounts,
        uint256[] calldata expiries,
        uint8[] calldata maxRevisions,
        uint256 disputeTimeout,
        bool disputeDefaultToProvider
    ) external returns (uint256 agreementId) {
        if (provider == address(0) || resolver == address(0)) revert ZeroAddress();
        if (resolver == msg.sender || resolver == provider) revert NotParty();

        uint256 length = amounts.length;
        if (length == 0) revert InvalidArrayLength();
        if (length > 5) revert MaxMilestonesExceeded();
        if (expiries.length != length || maxRevisions.length != length) revert ArrayLengthMismatch();

        if (disputeTimeout == 0) {
            disputeTimeout = 30 days;
        } else if (disputeTimeout < 1 days || disputeTimeout > 90 days) {
            revert InvalidDisputeTimeout();
        }

        agreementId = agreementCounter;
        agreementCounter++;

        agreements[agreementId] = Agreement({
            client: msg.sender,
            provider: provider,
            resolver: resolver,
            termsHash: termsHash,
            milestoneCount: uint8(length),
            active: true,
            disputeTimeout: disputeTimeout,
            disputeDefaultToProvider: disputeDefaultToProvider
        });

        for (uint8 i = 0; i < length; i++) {
            if (amounts[i] == 0) revert ZeroAmount();
            if (expiries[i] <= block.timestamp) revert ExpiryInPast();

            uint8 revisions = maxRevisions[i];
            if (revisions == 0) {
                revisions = 3;
            }
            if (revisions < 1 || revisions > 5) revert InvalidMaxRevisions();

            milestones[agreementId][i] = Milestone({
                amount: amounts[i],
                expiry: expiries[i],
                status: MilestoneStatus.Pending,
                deliverableHash: bytes32(0),
                reasonHash: bytes32(0),
                revisionCount: 0,
                maxRevisions: revisions,
                disputeDeadline: 0
            });
        }

        emit AgreementCreated(agreementId, msg.sender, provider, resolver, termsHash, uint8(length));
    }

    /// @notice Funds a pending milestone by transferring USDC from the client into escrow.
    /// @param agreementId The agreement identifier.
    /// @param milestoneIndex The milestone index.
    function fund(uint256 agreementId, uint8 milestoneIndex) external nonReentrant {
        Agreement storage agreement = agreements[agreementId];
        if (msg.sender != agreement.client) revert NotClient();
        if (milestoneIndex >= agreement.milestoneCount) revert InvalidArrayLength();

        Milestone storage milestone = milestones[agreementId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Pending) revert InvalidMilestoneStatus();

        milestone.status = MilestoneStatus.Funded;
        bool ok = usdc.transferFrom(msg.sender, address(this), milestone.amount);
        if (!ok) revert TokenTransferFailed();

        emit MilestoneFunded(agreementId, milestoneIndex, milestone.amount);
    }

    /// @notice Submits or resubmits a milestone deliverable before expiry.
    /// @param agreementId The agreement identifier.
    /// @param milestoneIndex The milestone index.
    /// @param deliverableHash Hash of off-chain deliverable content/URI.
    function submitDeliverable(uint256 agreementId, uint8 milestoneIndex, bytes32 deliverableHash) external {
        Agreement storage agreement = agreements[agreementId];
        if (msg.sender != agreement.provider) revert NotProvider();
        if (milestoneIndex >= agreement.milestoneCount) revert InvalidArrayLength();

        Milestone storage milestone = milestones[agreementId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Funded && milestone.status != MilestoneStatus.Revision) {
            revert InvalidMilestoneStatus();
        }
        if (block.timestamp >= milestone.expiry) revert MilestoneExpired();
        if (deliverableHash == bytes32(0)) revert ZeroDeliverable();

        milestone.deliverableHash = deliverableHash;
        milestone.status = MilestoneStatus.Submitted;

        emit DeliverableSubmitted(agreementId, milestoneIndex, deliverableHash);
    }

    /// @notice Approves a submitted deliverable and credits escrowed USDC to the provider's pending withdrawal balance.
    /// @param agreementId The agreement identifier.
    /// @param milestoneIndex The milestone index.
    function approveRelease(uint256 agreementId, uint8 milestoneIndex) external {
        Agreement storage agreement = agreements[agreementId];
        if (msg.sender != agreement.client) revert NotClient();
        if (milestoneIndex >= agreement.milestoneCount) revert InvalidArrayLength();

        Milestone storage milestone = milestones[agreementId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Submitted) revert InvalidMilestoneStatus();

        milestone.status = MilestoneStatus.Released;
        pendingWithdrawals[agreement.provider] += milestone.amount;

        bool allTerminal = true;
        for (uint8 i = 0; i < agreement.milestoneCount; i++) {
            MilestoneStatus s = milestones[agreementId][i].status;
            if (s != MilestoneStatus.Released && s != MilestoneStatus.Refunded) {
                allTerminal = false;
                break;
            }
        }
        if (allTerminal) {
            agreement.active = false;
        }

        emit PaymentReleased(agreementId, milestoneIndex, agreement.provider, milestone.amount);
    }

    /// @notice Requests changes on a submitted milestone or auto-escalates to dispute at max revisions and sets a dispute deadline.
    /// @param agreementId The agreement identifier.
    /// @param milestoneIndex The milestone index.
    /// @param reasonHash Hash of the client's off-chain reason.
    function requestChanges(uint256 agreementId, uint8 milestoneIndex, bytes32 reasonHash) external {
        Agreement storage agreement = agreements[agreementId];
        if (msg.sender != agreement.client) revert NotClient();
        if (milestoneIndex >= agreement.milestoneCount) revert InvalidArrayLength();

        Milestone storage milestone = milestones[agreementId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Submitted) revert InvalidMilestoneStatus();

        milestone.reasonHash = reasonHash;

        if (milestone.revisionCount < milestone.maxRevisions) {
            milestone.revisionCount++;
            milestone.status = MilestoneStatus.Revision;
            emit ChangesRequested(agreementId, milestoneIndex, reasonHash, milestone.revisionCount);
        } else {
            milestone.status = MilestoneStatus.Disputed;
            milestone.disputeDeadline = block.timestamp + agreement.disputeTimeout;
            emit DisputeRaised(agreementId, milestoneIndex, msg.sender, reasonHash);
            emit DisputeDeadlineSet(agreementId, milestoneIndex, milestone.disputeDeadline);
        }
    }

    /// @notice Raises a dispute on a funded, submitted, or revision milestone and sets a dispute deadline.
    /// @param agreementId The agreement identifier.
    /// @param milestoneIndex The milestone index.
    /// @param reasonHash Hash of the dispute reason.
    function raiseDispute(uint256 agreementId, uint8 milestoneIndex, bytes32 reasonHash) external {
        Agreement storage agreement = agreements[agreementId];
        if (msg.sender != agreement.client && msg.sender != agreement.provider) revert NotParty();
        if (milestoneIndex >= agreement.milestoneCount) revert InvalidArrayLength();

        Milestone storage milestone = milestones[agreementId][milestoneIndex];
        if (
            milestone.status != MilestoneStatus.Funded
                && milestone.status != MilestoneStatus.Submitted
                && milestone.status != MilestoneStatus.Revision
        ) {
            revert InvalidMilestoneStatus();
        }

        milestone.reasonHash = reasonHash;
        milestone.status = MilestoneStatus.Disputed;
        milestone.disputeDeadline = block.timestamp + agreement.disputeTimeout;

        emit DisputeRaised(agreementId, milestoneIndex, msg.sender, reasonHash);
        emit DisputeDeadlineSet(agreementId, milestoneIndex, milestone.disputeDeadline);
    }

    /// @notice Resolves a disputed milestone by crediting funds to provider or client pending withdrawals.
    /// @param agreementId The agreement identifier.
    /// @param milestoneIndex The milestone index.
    /// @param releaseToProvider True to credit provider, false to credit client.
    function resolveDispute(uint256 agreementId, uint8 milestoneIndex, bool releaseToProvider) external {
        Agreement storage agreement = agreements[agreementId];
        if (msg.sender != agreement.resolver) revert NotResolver();
        if (milestoneIndex >= agreement.milestoneCount) revert InvalidArrayLength();

        Milestone storage milestone = milestones[agreementId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Disputed) revert InvalidMilestoneStatus();

        if (releaseToProvider) {
            milestone.status = MilestoneStatus.Released;
            pendingWithdrawals[agreement.provider] += milestone.amount;
            emit PaymentReleased(agreementId, milestoneIndex, agreement.provider, milestone.amount);
        } else {
            milestone.status = MilestoneStatus.Refunded;
            pendingWithdrawals[agreement.client] += milestone.amount;
            emit RefundClaimed(agreementId, milestoneIndex, agreement.client, milestone.amount);
        }

        bool allTerminal = true;
        for (uint8 i = 0; i < agreement.milestoneCount; i++) {
            MilestoneStatus s = milestones[agreementId][i].status;
            if (s != MilestoneStatus.Released && s != MilestoneStatus.Refunded) {
                allTerminal = false;
                break;
            }
        }
        if (allTerminal) {
            agreement.active = false;
        }

        emit DisputeResolved(agreementId, milestoneIndex, releaseToProvider, milestone.amount);
    }

    /// @notice Claims refund for a funded milestone whose provider has not yet submitted by expiry by crediting the client's pending withdrawal balance.
    /// @dev Only allowed in Funded status. Once the provider has submitted, use raiseDispute instead.
    /// @param agreementId The agreement identifier.
    /// @param milestoneIndex The milestone index.
    function claimRefund(uint256 agreementId, uint8 milestoneIndex) external {
        Agreement storage agreement = agreements[agreementId];
        if (msg.sender != agreement.client) revert NotClient();
        if (milestoneIndex >= agreement.milestoneCount) revert InvalidArrayLength();

        Milestone storage milestone = milestones[agreementId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Funded) {
            revert InvalidMilestoneStatus();
        }
        if (block.timestamp < milestone.expiry) revert MilestoneNotExpired();

        milestone.status = MilestoneStatus.Refunded;
        pendingWithdrawals[agreement.client] += milestone.amount;

        bool allTerminal = true;
        for (uint8 i = 0; i < agreement.milestoneCount; i++) {
            MilestoneStatus s = milestones[agreementId][i].status;
            if (s != MilestoneStatus.Released && s != MilestoneStatus.Refunded) {
                allTerminal = false;
                break;
            }
        }
        if (allTerminal) {
            agreement.active = false;
        }

        emit RefundClaimed(agreementId, milestoneIndex, agreement.client, milestone.amount);
    }

    /// @notice Claims a timed-out disputed milestone and credits funds per agreement dispute default policy.
    /// @dev Callable by either party after disputeDeadline. Payout destination is determined by disputeDefaultToProvider,
    ///      not by who calls — so neither side can grief-lock the other by refusing to initiate.
    ///      If disputeDefaultToProvider is true, credits provider and marks Released; otherwise credits client and marks Refunded.
    /// @param agreementId The agreement identifier.
    /// @param milestoneIndex The milestone index.
    function claimDisputeRefund(uint256 agreementId, uint8 milestoneIndex) external {
        Agreement storage agreement = agreements[agreementId];
        if (msg.sender != agreement.client && msg.sender != agreement.provider) revert NotParty();
        if (milestoneIndex >= agreement.milestoneCount) revert InvalidArrayLength();

        Milestone storage milestone = milestones[agreementId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Disputed) revert InvalidMilestoneStatus();
        if (milestone.disputeDeadline == 0) revert InvalidMilestoneStatus();
        if (block.timestamp < milestone.disputeDeadline) revert DisputeDeadlineNotReached();

        if (agreement.disputeDefaultToProvider) {
            milestone.status = MilestoneStatus.Released;
            pendingWithdrawals[agreement.provider] += milestone.amount;
            emit PaymentReleased(agreementId, milestoneIndex, agreement.provider, milestone.amount);
        } else {
            milestone.status = MilestoneStatus.Refunded;
            pendingWithdrawals[agreement.client] += milestone.amount;
            emit RefundClaimed(agreementId, milestoneIndex, agreement.client, milestone.amount);
        }

        bool allTerminal = true;
        for (uint8 i = 0; i < agreement.milestoneCount; i++) {
            MilestoneStatus s = milestones[agreementId][i].status;
            if (s != MilestoneStatus.Released && s != MilestoneStatus.Refunded) {
                allTerminal = false;
                break;
            }
        }
        if (allTerminal) {
            agreement.active = false;
        }
    }

    /// @notice Withdraws caller's accumulated USDC credits.
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pendingWithdrawals[msg.sender] = 0;
        bool ok = usdc.transfer(msg.sender, amount);
        if (!ok) revert TokenTransferFailed();

        emit Withdrawn(msg.sender, amount);
    }
}
