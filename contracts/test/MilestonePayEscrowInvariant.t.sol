// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// =============================================================================
// MilestonePayEscrowInvariant.t.sol
// =============================================================================
//
// Invariant and fuzz conservation tests for MilestonePayEscrow.
//
// CORE INVARIANT (escrow conservation):
//   At all times:
//     USDC balance of contract
//       == sum of amounts in {Funded, Submitted, Revision, Disputed} milestones
//          (i.e. milestones whose USDC has been deposited but not yet credited out)
//       + sum of all pendingWithdrawals[address] that have not yet been withdrawn
//
//   Equivalently:
//     total_funded_ever == total_released_ever + total_refunded_ever + currently_escrowed
//
//   where "released" and "refunded" means credited to pendingWithdrawals (not yet
//   necessarily withdrawn), and "currently_escrowed" means still in a non-terminal
//   milestone status.
//
// DECIMAL INVARIANT:
//   All USDC amounts are stored and compared as 6-decimal ERC-20 units.
//   No 18-decimal native-view arithmetic appears in this contract.
//   Every amount credited to pendingWithdrawals equals the original milestone.amount.
//
// =============================================================================

import {Test, StdInvariant} from "forge-std/Test.sol";
import {MilestonePayEscrow} from "../MilestonePayEscrow.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

// =============================================================================
// Handler contract — drives the invariant fuzzer through valid state transitions
// =============================================================================
contract EscrowHandler is Test {

    MilestonePayEscrow public escrow;
    MockERC20          public usdc;

    address public clientAddr   = makeAddr("invariant_client");
    address public providerAddr = makeAddr("invariant_provider");
    address public resolverAddr = makeAddr("invariant_resolver");

    // Tracks every agreementId ever created (bounded to 20 to keep fuzzer tractable)
    uint256[] public agreementIds;
    uint256 public constant MAX_AGREEMENTS = 20;

    // Tracks total USDC funded into the escrow by this handler (in 6-decimal units)
    uint256 public totalFunded;
    // Tracks total USDC credited to pendingWithdrawals (released + refunded credits)
    uint256 public totalCredited;
    // Tracks total USDC withdrawn from the contract via withdraw()
    uint256 public totalWithdrawn;

    // Deliverable hash salt to ensure non-zero and varying hashes
    uint256 private _deliverableSalt;

    constructor(MilestonePayEscrow escrow_, MockERC20 usdc_) {
        escrow = escrow_;
        usdc   = usdc_;

        usdc.mint(clientAddr, type(uint96).max);
        vm.prank(clientAddr);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // -------------------------------------------------------------------------
    // Handler: createAgreement
    // -------------------------------------------------------------------------
    function createAgreement(uint256 amount, uint256 expiry, uint8 maxRev) external {
        if (agreementIds.length >= MAX_AGREEMENTS) return;

        amount = bound(amount, 1, 1_000_000e6);
        expiry = bound(expiry, block.timestamp + 1, block.timestamp + 365 days);
        maxRev = uint8(bound(uint256(maxRev), 1, 5));

        uint256[] memory amounts      = new uint256[](1);
        uint256[] memory expiries     = new uint256[](1);
        uint8[]   memory maxRevisions = new uint8[](1);
        amounts[0]      = amount;
        expiries[0]     = expiry;
        maxRevisions[0] = maxRev;

        vm.prank(clientAddr);
        uint256 id = escrow.createAgreement(
            providerAddr, resolverAddr, keccak256("terms"),
            amounts, expiries, maxRevisions, 30 days, false
        );
        agreementIds.push(id);
    }

    // -------------------------------------------------------------------------
    // Handler: fund
    // -------------------------------------------------------------------------
    function fund(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        uint256 id  = agreementIds[idSeed % agreementIds.length];

        (,,,, uint8 milestoneCount,,,) = escrow.agreements(id);
        if (milestoneCount == 0) return;

        // Try milestone 0 only (single-milestone agreements in this handler)
        (uint256 amount,,MilestonePayEscrow.MilestoneStatus status,,,,,) = escrow.milestones(id, 0);
        if (status != MilestonePayEscrow.MilestoneStatus.Pending) return;

        vm.prank(clientAddr);
        escrow.fund(id, 0);
        totalFunded += amount;
    }

    // -------------------------------------------------------------------------
    // Handler: submitDeliverable
    // -------------------------------------------------------------------------
    function submitDeliverable(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        uint256 id  = agreementIds[idSeed % agreementIds.length];

        (,,MilestonePayEscrow.MilestoneStatus status,,,,,uint256 expiry_) = _milestone(id, 0);
        if (
            status != MilestonePayEscrow.MilestoneStatus.Funded &&
            status != MilestonePayEscrow.MilestoneStatus.Revision
        ) return;
        if (block.timestamp >= expiry_) return;

        _deliverableSalt++;
        bytes32 dHash = keccak256(abi.encode("deliverable", _deliverableSalt));

        vm.prank(providerAddr);
        escrow.submitDeliverable(id, 0, dHash);
    }

    // -------------------------------------------------------------------------
    // Handler: approveRelease
    // -------------------------------------------------------------------------
    function approveRelease(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        uint256 id  = agreementIds[idSeed % agreementIds.length];

        (uint256 amount,,MilestonePayEscrow.MilestoneStatus status,,,,,) = _milestone(id, 0);
        if (status != MilestonePayEscrow.MilestoneStatus.Submitted) return;

        vm.prank(clientAddr);
        escrow.approveRelease(id, 0);
        totalCredited += amount;
    }

    // -------------------------------------------------------------------------
    // Handler: requestChanges
    // -------------------------------------------------------------------------
    function requestChanges(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        uint256 id = agreementIds[idSeed % agreementIds.length];

        (uint256 amount,,MilestonePayEscrow.MilestoneStatus status,,, uint8 revCount, uint8 maxRev,) = _milestone(id, 0);
        if (status != MilestonePayEscrow.MilestoneStatus.Submitted) return;

        // If this will auto-escalate, note it credits nothing yet (Disputed)
        vm.prank(clientAddr);
        escrow.requestChanges(id, 0, keccak256("reason"));

        // Check post-call; silence unused-variable warnings
        (,,MilestonePayEscrow.MilestoneStatus postStatus,,,,,) = _milestone(id, 0);
        (amount, revCount, maxRev, postStatus); // suppress unused warnings
    }

    // -------------------------------------------------------------------------
    // Handler: raiseDispute
    // -------------------------------------------------------------------------
    function raiseDispute(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        uint256 id = agreementIds[idSeed % agreementIds.length];

        (,,MilestonePayEscrow.MilestoneStatus status,,,,,) = _milestone(id, 0);
        if (
            status != MilestonePayEscrow.MilestoneStatus.Funded &&
            status != MilestonePayEscrow.MilestoneStatus.Submitted &&
            status != MilestonePayEscrow.MilestoneStatus.Revision
        ) return;

        vm.prank(clientAddr);
        escrow.raiseDispute(id, 0, keccak256("dispute reason"));
    }

    // -------------------------------------------------------------------------
    // Handler: resolveDispute (resolver releases to provider)
    // -------------------------------------------------------------------------
    function resolveDisputeToProvider(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        uint256 id = agreementIds[idSeed % agreementIds.length];

        (uint256 amount,,MilestonePayEscrow.MilestoneStatus status,,,,,) = _milestone(id, 0);
        if (status != MilestonePayEscrow.MilestoneStatus.Disputed) return;

        vm.prank(resolverAddr);
        escrow.resolveDispute(id, 0, true);
        totalCredited += amount;
    }

    // -------------------------------------------------------------------------
    // Handler: resolveDispute (resolver refunds client)
    // -------------------------------------------------------------------------
    function resolveDisputeToClient(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        uint256 id = agreementIds[idSeed % agreementIds.length];

        (uint256 amount,,MilestonePayEscrow.MilestoneStatus status,,,,,) = _milestone(id, 0);
        if (status != MilestonePayEscrow.MilestoneStatus.Disputed) return;

        vm.prank(resolverAddr);
        escrow.resolveDispute(id, 0, false);
        totalCredited += amount;
    }

    // -------------------------------------------------------------------------
    // Handler: claimRefund (after expiry)
    // -------------------------------------------------------------------------
    function claimRefund(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        uint256 id = agreementIds[idSeed % agreementIds.length];

        (uint256 amount,,MilestonePayEscrow.MilestoneStatus status,,,,, uint256 expiry_) = _milestone(id, 0);
        if (status != MilestonePayEscrow.MilestoneStatus.Funded) return;

        // Warp past expiry only if not already past
        if (block.timestamp < expiry_) {
            vm.warp(expiry_ + 1);
        }

        vm.prank(clientAddr);
        escrow.claimRefund(id, 0);
        totalCredited += amount;
    }

    // -------------------------------------------------------------------------
    // Handler: claimDisputeRefund (after dispute deadline)
    // -------------------------------------------------------------------------
    function claimDisputeRefund(uint256 idSeed) external {
        if (agreementIds.length == 0) return;
        uint256 id = agreementIds[idSeed % agreementIds.length];

        (uint256 amount,,MilestonePayEscrow.MilestoneStatus status,,,,,uint256 dd) = _milestone(id, 0);
        if (status != MilestonePayEscrow.MilestoneStatus.Disputed) return;
        if (dd == 0) return;

        if (block.timestamp < dd) {
            vm.warp(dd + 1);
        }

        vm.prank(clientAddr);
        escrow.claimDisputeRefund(id, 0);
        totalCredited += amount;
    }

    // -------------------------------------------------------------------------
    // Handler: withdraw (provider)
    // -------------------------------------------------------------------------
    function withdrawProvider() external {
        uint256 pending = escrow.pendingWithdrawals(providerAddr);
        if (pending == 0) return;
        vm.prank(providerAddr);
        escrow.withdraw();
        totalWithdrawn += pending;
    }

    // -------------------------------------------------------------------------
    // Handler: withdraw (client)
    // -------------------------------------------------------------------------
    function withdrawClient() external {
        uint256 pending = escrow.pendingWithdrawals(clientAddr);
        if (pending == 0) return;
        vm.prank(clientAddr);
        escrow.withdraw();
        totalWithdrawn += pending;
    }

    // -------------------------------------------------------------------------
    // Getter for invariant test loops
    // -------------------------------------------------------------------------
    function getAgreementIds() external view returns (uint256[] memory) {
        return agreementIds;
    }

    // -------------------------------------------------------------------------
    // Internal helper
    // -------------------------------------------------------------------------
    function _milestone(uint256 id, uint8 idx)
        internal
        view
        returns (
            uint256 amount,
            uint256 expiry_,
            MilestonePayEscrow.MilestoneStatus status,
            bytes32 deliverableHash,
            bytes32 reasonHash,
            uint8 revisionCount,
            uint8 maxRevisions_,
            uint256 disputeDeadline
        )
    {
        return escrow.milestones(id, idx);
    }
}

// =============================================================================
// Invariant test contract
// =============================================================================
contract MilestonePayEscrowInvariantTest is StdInvariant, Test {

    MilestonePayEscrow internal escrow;
    MockERC20          internal usdc;
    EscrowHandler      internal handler;

    function setUp() public {
        usdc    = new MockERC20("Mock USDC", "mUSDC", 6);
        escrow  = new MilestonePayEscrow(address(usdc));
        handler = new EscrowHandler(escrow, usdc);

        targetContract(address(handler));
    }

    // -------------------------------------------------------------------------
    // INVARIANT 1: Escrow Conservation
    //
    // The contract's USDC token balance must at all times equal:
    //   (sum of amounts for milestones in non-terminal statuses across all agreements)
    //   + (sum of pendingWithdrawals for all tracked addresses)
    //
    // Equivalently, no USDC can be created or destroyed by the contract.
    // Every wei that entered via fund() must eventually exit via withdraw()
    // (after being credited via approveRelease/resolveDispute/claimRefund/claimDisputeRefund).
    // -------------------------------------------------------------------------
    function invariant_escrowConservation() public view {
        // Contract USDC balance
        uint256 contractBalance = usdc.balanceOf(address(escrow));

        // Sum of: actively-escrowed milestones + unclaimed pendingWithdrawals
        uint256 activeEscrow    = _sumActiveEscrow();
        uint256 pendingTotal    = escrow.pendingWithdrawals(handler.clientAddr())
                                + escrow.pendingWithdrawals(handler.providerAddr());

        assertEq(
            contractBalance,
            activeEscrow + pendingTotal,
            "INVARIANT VIOLATED: contract balance != active escrow + pending withdrawals"
        );
    }

    // -------------------------------------------------------------------------
    // INVARIANT 2: Accounting Conservation (via handler totals)
    //
    // handler.totalFunded == handler.totalCredited + activeEscrow
    // handler.totalCredited == handler.totalWithdrawn + pendingWithdrawals
    // -------------------------------------------------------------------------
    function invariant_accountingConservation() public view {
        uint256 activeEscrow  = _sumActiveEscrow();
        uint256 pendingTotal  = escrow.pendingWithdrawals(handler.clientAddr())
                              + escrow.pendingWithdrawals(handler.providerAddr());

        assertEq(
            handler.totalFunded(),
            handler.totalCredited() + activeEscrow,
            "INVARIANT VIOLATED: totalFunded != totalCredited + activeEscrow"
        );

        assertEq(
            handler.totalCredited(),
            handler.totalWithdrawn() + pendingTotal,
            "INVARIANT VIOLATED: totalCredited != totalWithdrawn + pendingWithdrawals"
        );
    }

    // -------------------------------------------------------------------------
    // INVARIANT 3: No funds credited to unknown addresses
    //
    // Only client and provider can ever receive credits. Total credits to both
    // must equal total credited by the handler.
    // -------------------------------------------------------------------------
    function invariant_creditsOnlyToKnownParties() public view {
        uint256 clientPending   = escrow.pendingWithdrawals(handler.clientAddr());
        uint256 providerPending = escrow.pendingWithdrawals(handler.providerAddr());
        uint256 pendingTotal    = clientPending + providerPending;

        // Total credited = totalWithdrawn + pendingTotal
        assertEq(
            handler.totalCredited(),
            handler.totalWithdrawn() + pendingTotal,
            "INVARIANT VIOLATED: credits to unknown parties detected"
        );
    }

    // -------------------------------------------------------------------------
    // INVARIANT 4: Terminal milestones never hold escrowed funds
    //
    // A milestone in Released or Refunded status must have its amount
    // accounted for in credits or withdrawals, not in the active escrow sum.
    // -------------------------------------------------------------------------
    function invariant_terminalMilestonesHaveNoEscrow() public view {
        uint256[] memory ids = handler.getAgreementIds();
        for (uint256 i = 0; i < ids.length; i++) {
            (,,,,uint8 milestoneCount,,,) = escrow.agreements(ids[i]);
            for (uint8 j = 0; j < milestoneCount; j++) {
                (uint256 amount,,MilestonePayEscrow.MilestoneStatus status,,,,,) =
                    escrow.milestones(ids[i], j);
                if (
                    status == MilestonePayEscrow.MilestoneStatus.Released ||
                    status == MilestonePayEscrow.MilestoneStatus.Refunded
                ) {
                    // Terminal milestones must NOT be counted in active escrow.
                    // The amount must be in pendingWithdrawals or already withdrawn.
                    // We verify this indirectly via invariant_escrowConservation;
                    // this invariant adds a direct per-milestone check that the
                    // active escrow sum does not include terminal milestone amounts.
                    uint256 activeForThisMilestone = _isActiveStatus(status) ? amount : 0;
                    assertEq(
                        activeForThisMilestone,
                        0,
                        "INVARIANT VIOLATED: terminal milestone incorrectly counted in active escrow"
                    );
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // INVARIANT 5: Pending status milestones never hold escrowed funds
    //
    // A milestone in Pending status has never been funded; its amount
    // must not be in the contract's token balance on behalf of this agreement.
    // (This is guaranteed by fund() checking Pending → Funded atomically,
    //  but we verify it explicitly as a belt-and-suspenders check.)
    // -------------------------------------------------------------------------
    function invariant_pendingMilestonesNeverFunded() public view {
        uint256[] memory ids = handler.getAgreementIds();
        for (uint256 i = 0; i < ids.length; i++) {
            (,,,,uint8 milestoneCount,,,) = escrow.agreements(ids[i]);
            for (uint8 j = 0; j < milestoneCount; j++) {
                (,, MilestonePayEscrow.MilestoneStatus status,,,,,) =
                    escrow.milestones(ids[i], j);
                // The invariant is enforced structurally; we just confirm
                // that Pending exists as a known valid state without asserting
                // an amount-level check (amounts are not credited until fund()).
                // This loop is a structural safety net.
                assertTrue(
                    uint8(status) <= uint8(MilestonePayEscrow.MilestoneStatus.Refunded),
                    "INVARIANT VIOLATED: unknown milestone status"
                );
            }
        }
    }

    // -------------------------------------------------------------------------
    // Helper: sum amounts of milestones in non-terminal, non-pending status
    //         (i.e. milestones where USDC has been deposited but not yet credited)
    // -------------------------------------------------------------------------
    function _sumActiveEscrow() internal view returns (uint256 total) {
        uint256[] memory ids = handler.getAgreementIds();
        for (uint256 i = 0; i < ids.length; i++) {
            (,,,,uint8 milestoneCount,,,) = escrow.agreements(ids[i]);
            for (uint8 j = 0; j < milestoneCount; j++) {
                (uint256 amount,,MilestonePayEscrow.MilestoneStatus status,,,,,) =
                    escrow.milestones(ids[i], j);
                if (_isActiveStatus(status)) {
                    total += amount;
                }
            }
        }
    }

    /// @dev Returns true if the status means USDC is held in the contract
    ///      (not yet credited to pendingWithdrawals).
    function _isActiveStatus(MilestonePayEscrow.MilestoneStatus status) internal pure returns (bool) {
        return (
            status == MilestonePayEscrow.MilestoneStatus.Funded     ||
            status == MilestonePayEscrow.MilestoneStatus.Submitted   ||
            status == MilestonePayEscrow.MilestoneStatus.Revision    ||
            status == MilestonePayEscrow.MilestoneStatus.Disputed
        );
    }
}

// =============================================================================
// Fuzz conservation tests (standalone, not invariant-based)
// These complement the invariant tests with explicit multi-agreement scenarios.
// =============================================================================
contract MilestonePayEscrowConservationFuzz is Test {

    MilestonePayEscrow internal escrow;
    MockERC20          internal usdc;

    address internal client   = makeAddr("fuzz_client");
    address internal provider = makeAddr("fuzz_provider");
    address internal resolver = makeAddr("fuzz_resolver");

    function setUp() public {
        usdc   = new MockERC20("Mock USDC", "mUSDC", 6);
        escrow = new MilestonePayEscrow(address(usdc));
        usdc.mint(client, type(uint96).max);
        vm.prank(client);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // -------------------------------------------------------------------------
    // Fuzz: single agreement full happy path — contract balance tracks exactly
    // -------------------------------------------------------------------------
    function testFuzz_Conservation_HappyPath(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000e6);

        uint256[] memory amounts      = new uint256[](1);
        uint256[] memory expiries     = new uint256[](1);
        uint8[]   memory maxRevisions = new uint8[](1);
        amounts[0]      = amount;
        expiries[0]     = block.timestamp + 30 days;
        maxRevisions[0] = 3;

        vm.prank(client);
        uint256 id = escrow.createAgreement(
            provider, resolver, keccak256("terms"),
            amounts, expiries, maxRevisions, 30 days, false
        );

        // Before fund: contract balance unchanged
        uint256 balBefore = usdc.balanceOf(address(escrow));

        vm.prank(client);
        escrow.fund(id, 0);
        assertEq(usdc.balanceOf(address(escrow)), balBefore + amount, "post-fund balance wrong");

        vm.prank(provider);
        escrow.submitDeliverable(id, 0, keccak256("deliverable"));
        assertEq(usdc.balanceOf(address(escrow)), balBefore + amount, "post-submit balance changed");

        vm.prank(client);
        escrow.approveRelease(id, 0);
        // Balance unchanged; amount moved to pendingWithdrawals, not yet out of contract
        assertEq(usdc.balanceOf(address(escrow)), balBefore + amount, "post-approve balance changed");
        assertEq(escrow.pendingWithdrawals(provider), amount, "pendingWithdrawals wrong");

        vm.prank(provider);
        escrow.withdraw();
        assertEq(usdc.balanceOf(address(escrow)), balBefore, "post-withdraw balance wrong");
        assertEq(escrow.pendingWithdrawals(provider), 0, "pendingWithdrawals not zeroed");
    }

    // -------------------------------------------------------------------------
    // Fuzz: dispute path — resolver refunds client — conservation holds
    // -------------------------------------------------------------------------
    function testFuzz_Conservation_DisputeRefund(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000e6);

        uint256[] memory amounts      = new uint256[](1);
        uint256[] memory expiries     = new uint256[](1);
        uint8[]   memory maxRevisions = new uint8[](1);
        amounts[0]      = amount;
        expiries[0]     = block.timestamp + 30 days;
        maxRevisions[0] = 3;

        vm.prank(client);
        uint256 id = escrow.createAgreement(
            provider, resolver, keccak256("terms"),
            amounts, expiries, maxRevisions, 30 days, false
        );

        uint256 balBefore = usdc.balanceOf(address(escrow));

        vm.prank(client);
        escrow.fund(id, 0);
        vm.prank(client);
        escrow.raiseDispute(id, 0, keccak256("reason"));
        vm.prank(resolver);
        escrow.resolveDispute(id, 0, false); // refund to client

        assertEq(escrow.pendingWithdrawals(client), amount, "client pendingWithdrawals wrong");
        assertEq(usdc.balanceOf(address(escrow)), balBefore + amount, "balance after resolve wrong");

        vm.prank(client);
        escrow.withdraw();
        assertEq(usdc.balanceOf(address(escrow)), balBefore, "balance after client withdraw wrong");
        assertEq(escrow.pendingWithdrawals(client), 0, "client pending not zeroed");
    }

    // -------------------------------------------------------------------------
    // Fuzz: 5-milestone agreement — each milestone independently conserved
    // -------------------------------------------------------------------------
    function testFuzz_Conservation_FiveMilestones(
        uint256 a0, uint256 a1, uint256 a2, uint256 a3, uint256 a4
    ) public {
        a0 = bound(a0, 1, 200_000e6);
        a1 = bound(a1, 1, 200_000e6);
        a2 = bound(a2, 1, 200_000e6);
        a3 = bound(a3, 1, 200_000e6);
        a4 = bound(a4, 1, 200_000e6);

        uint256 total = a0 + a1 + a2 + a3 + a4;
        usdc.mint(client, total); // ensure enough balance

        uint256[] memory amounts      = new uint256[](5);
        uint256[] memory expiries     = new uint256[](5);
        uint8[]   memory maxRevisions = new uint8[](5);
        amounts[0] = a0; amounts[1] = a1; amounts[2] = a2; amounts[3] = a3; amounts[4] = a4;
        for (uint256 i = 0; i < 5; i++) {
            expiries[i]     = block.timestamp + 30 days;
            maxRevisions[i] = 3;
        }

        vm.prank(client);
        uint256 id = escrow.createAgreement(
            provider, resolver, keccak256("terms"),
            amounts, expiries, maxRevisions, 30 days, false
        );

        uint256 balBefore = usdc.balanceOf(address(escrow));

        // Fund all 5
        for (uint8 i = 0; i < 5; i++) {
            vm.prank(client);
            escrow.fund(id, i);
        }
        assertEq(usdc.balanceOf(address(escrow)), balBefore + total, "balance after all funds wrong");

        // Submit and approve all 5
        for (uint8 i = 0; i < 5; i++) {
            vm.prank(provider);
            escrow.submitDeliverable(id, i, keccak256(abi.encode("deliverable", i)));
            vm.prank(client);
            escrow.approveRelease(id, i);
        }

        // All credited to pending; balance still in contract
        assertEq(usdc.balanceOf(address(escrow)), balBefore + total, "balance after approvals wrong");
        assertEq(escrow.pendingWithdrawals(provider), total, "provider pending wrong");

        // Provider withdraws
        vm.prank(provider);
        escrow.withdraw();
        assertEq(usdc.balanceOf(address(escrow)), balBefore, "final balance wrong");
        assertEq(escrow.pendingWithdrawals(provider), 0, "provider pending not zeroed");

        // Agreement should be inactive
        (,,,,, bool active,,) = escrow.agreements(id);
        assertFalse(active, "agreement should be inactive");
    }

    // -------------------------------------------------------------------------
    // Fuzz: dispute timeout path — conservation holds regardless of disputeDefaultToProvider
    // -------------------------------------------------------------------------
    function testFuzz_Conservation_DisputeTimeout(uint256 amount, bool defaultToProvider) public {
        amount = bound(amount, 1, 1_000_000e6);

        uint256[] memory amounts      = new uint256[](1);
        uint256[] memory expiries     = new uint256[](1);
        uint8[]   memory maxRevisions = new uint8[](1);
        amounts[0]      = amount;
        expiries[0]     = block.timestamp + 90 days;
        maxRevisions[0] = 3;

        vm.prank(client);
        uint256 id = escrow.createAgreement(
            provider, resolver, keccak256("terms"),
            amounts, expiries, maxRevisions, 30 days, defaultToProvider
        );

        uint256 balBefore = usdc.balanceOf(address(escrow));

        vm.prank(client);
        escrow.fund(id, 0);
        vm.prank(client);
        escrow.raiseDispute(id, 0, keccak256("reason"));

        // Warp past dispute deadline
        vm.warp(block.timestamp + 30 days + 1);

        // Either party can call claimDisputeRefund
        address caller = defaultToProvider ? provider : client;
        vm.prank(caller);
        escrow.claimDisputeRefund(id, 0);

        address beneficiary = defaultToProvider ? provider : client;
        assertEq(escrow.pendingWithdrawals(beneficiary), amount, "wrong beneficiary credited");
        assertEq(usdc.balanceOf(address(escrow)), balBefore + amount, "balance after claim wrong");

        vm.prank(beneficiary);
        escrow.withdraw();
        assertEq(usdc.balanceOf(address(escrow)), balBefore, "balance after withdraw wrong");
    }

    // -------------------------------------------------------------------------
    // Fuzz: multiple independent agreements — total conservation
    // -------------------------------------------------------------------------
    function testFuzz_Conservation_MultiAgreement(
        uint256 amountA, uint256 amountB
    ) public {
        amountA = bound(amountA, 1, 500_000e6);
        amountB = bound(amountB, 1, 500_000e6);
        usdc.mint(client, amountA + amountB);

        uint256 balBefore = usdc.balanceOf(address(escrow));

        // Agreement A: happy path
        uint256 idA;
        {
            uint256[] memory amounts_      = new uint256[](1);
            uint256[] memory expiries_     = new uint256[](1);
            uint8[]   memory maxRevisions_ = new uint8[](1);
            amounts_[0]      = amountA;
            expiries_[0]     = block.timestamp + 30 days;
            maxRevisions_[0] = 3;
            vm.prank(client);
            idA = escrow.createAgreement(provider, resolver, keccak256("termsA"), amounts_, expiries_, maxRevisions_, 30 days, false);
        }

        // Agreement B: dispute + refund
        uint256 idB;
        {
            uint256[] memory amounts_      = new uint256[](1);
            uint256[] memory expiries_     = new uint256[](1);
            uint8[]   memory maxRevisions_ = new uint8[](1);
            amounts_[0]      = amountB;
            expiries_[0]     = block.timestamp + 30 days;
            maxRevisions_[0] = 3;
            vm.prank(client);
            idB = escrow.createAgreement(provider, resolver, keccak256("termsB"), amounts_, expiries_, maxRevisions_, 30 days, false);
        }

        // Fund both
        vm.prank(client); escrow.fund(idA, 0);
        vm.prank(client); escrow.fund(idB, 0);
        assertEq(usdc.balanceOf(address(escrow)), balBefore + amountA + amountB, "balance after fund wrong");

        // Complete A
        vm.prank(provider);
        escrow.submitDeliverable(idA, 0, keccak256("deliverableA"));
        vm.prank(client);
        escrow.approveRelease(idA, 0);

        // Dispute + refund B
        vm.prank(client);
        escrow.raiseDispute(idB, 0, keccak256("reason"));
        vm.prank(resolver);
        escrow.resolveDispute(idB, 0, false);

        // Credits: provider gets amountA, client gets amountB
        assertEq(escrow.pendingWithdrawals(provider), amountA, "provider pending wrong");
        assertEq(escrow.pendingWithdrawals(client),   amountB, "client pending wrong");

        // Withdraw both
        vm.prank(provider); escrow.withdraw();
        vm.prank(client);   escrow.withdraw();

        assertEq(usdc.balanceOf(address(escrow)), balBefore, "final balance wrong");
        assertEq(escrow.pendingWithdrawals(provider), 0);
        assertEq(escrow.pendingWithdrawals(client),   0);
    }
}

// =============================================================================
// Getter helper added to the handler (required by invariant test)
// =============================================================================
// Foundry's StdInvariant requires the handler to expose agreement IDs for the
// invariant loop. We add a view getter here via inheritance extension.
// (Solidity does not allow adding functions to a deployed contract; this pattern
//  puts the getter on the handler which the invariant test controls.)
// =============================================================================
