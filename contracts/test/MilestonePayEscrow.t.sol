// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MilestonePayEscrow} from "../MilestonePayEscrow.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

contract MilestonePayEscrowTest is Test {
    // -------------------------------------------------------------------------
    // Fixtures
    // -------------------------------------------------------------------------
    MilestonePayEscrow internal escrow;
    MockERC20 internal usdc;

    address internal client   = makeAddr("client");
    address internal provider = makeAddr("provider");
    address internal resolver = makeAddr("resolver");
    address internal stranger = makeAddr("stranger");

    // Convenience defaults
    uint256 internal constant AMOUNT       = 1_000e6;   // 1 000 USDC (6 dp)
    uint256 internal constant FUTURE       = 30 days;   // added to block.timestamp in setUp
    bytes32 internal constant TERMS        = keccak256("terms");
    bytes32 internal constant DELIVERABLE  = keccak256("deliverable");
    bytes32 internal constant REASON       = keccak256("reason");
    uint8   internal constant MAX_REV      = 1;         // low limit makes auto-escalation easy to test

    function setUp() public {
        // Deploy mock USDC (6 decimals) and the escrow
        usdc   = new MockERC20("Mock USDC", "mUSDC", 6);
        escrow = new MilestonePayEscrow(address(usdc));

        // Seed client with USDC and pre-approve the escrow for all tests
        usdc.mint(client, 10_000_000e6);
        vm.prank(client);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /// Returns (agreementId) for a single-milestone agreement already created.
    function _createAgreement(uint8 maxRev) internal returns (uint256 agreementId) {
        uint256[] memory amounts      = new uint256[](1);
        uint256[] memory expiries     = new uint256[](1);
        uint8[]   memory maxRevisions = new uint8[](1);

        amounts[0]      = AMOUNT;
        expiries[0]     = block.timestamp + FUTURE;
        maxRevisions[0] = maxRev;

        vm.prank(client);
        agreementId = escrow.createAgreement(provider, resolver, TERMS, amounts, expiries, maxRevisions, 30 days, false);
    }

    /// Creates and fully funds milestone 0 of a fresh agreement.
    function _createAndFund(uint8 maxRev) internal returns (uint256 agreementId) {
        agreementId = _createAgreement(maxRev);
        vm.prank(client);
        escrow.fund(agreementId, 0);
    }

    /// Creates, funds, and submits deliverable for milestone 0.
    function _createFundAndSubmit(uint8 maxRev) internal returns (uint256 agreementId) {
        agreementId = _createAndFund(maxRev);
        vm.prank(provider);
        escrow.submitDeliverable(agreementId, 0, DELIVERABLE);
    }

    // =========================================================================
    // Deployment / initialization
    // =========================================================================

    function test_Constructor_SetsUsdc() public view {
        assertEq(address(escrow.usdc()), address(usdc));
    }

    function test_Constructor_AgreementCounterStartsAt1() public view {
        assertEq(escrow.agreementCounter(), 1);
    }

    function test_Constructor_RevertsOnZeroAddress() public {
        vm.expectRevert(MilestonePayEscrow.ZeroAddress.selector);
        new MilestonePayEscrow(address(0));
    }

    // =========================================================================
    // createAgreement — happy path
    // =========================================================================

    function test_CreateAgreement_EmitsAgreementCreated() public {
        uint256[] memory amounts      = new uint256[](1);
        uint256[] memory expiries     = new uint256[](1);
        uint8[]   memory maxRevisions = new uint8[](1);
        amounts[0]      = AMOUNT;
        expiries[0]     = block.timestamp + FUTURE;
        maxRevisions[0] = 3;

        vm.prank(client);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit MilestonePayEscrow.AgreementCreated(1, client, provider, resolver, TERMS, 1);
        escrow.createAgreement(provider, resolver, TERMS, amounts, expiries, maxRevisions, 30 days, false);
    }

    function test_CreateAgreement_StoresAgreementData() public {
        uint256 id = _createAgreement(3);

        (
            address storedClient,
            address storedProvider,
            address storedResolver,
            bytes32 storedTerms,
            uint8 milestoneCount,
            bool active,
            uint256 disputeTimeout,
        ) = escrow.agreements(id);

        assertEq(storedClient,   client);
        assertEq(storedProvider, provider);
        assertEq(storedResolver, resolver);
        assertEq(storedTerms,    TERMS);
        assertEq(milestoneCount, 1);
        assertTrue(active);
        assertEq(disputeTimeout, 30 days);
    }

    function test_CreateAgreement_IncrementesCounter() public {
        _createAgreement(3);
        assertEq(escrow.agreementCounter(), 2);
        _createAgreement(3);
        assertEq(escrow.agreementCounter(), 3);
    }

    function test_CreateAgreement_DefaultsDisputeTimeout() public {
        uint256[] memory amounts      = new uint256[](1);
        uint256[] memory expiries     = new uint256[](1);
        uint8[]   memory maxRevisions = new uint8[](1);
        amounts[0]      = AMOUNT;
        expiries[0]     = block.timestamp + FUTURE;
        maxRevisions[0] = 3;

        vm.prank(client);
        uint256 id = escrow.createAgreement(provider, resolver, TERMS, amounts, expiries, maxRevisions, 0, false);

        (, , , , , , uint256 dt,) = escrow.agreements(id);
        assertEq(dt, 30 days);
    }

    function test_CreateAgreement_DefaultsMaxRevisions() public {
        uint256[] memory amounts      = new uint256[](1);
        uint256[] memory expiries     = new uint256[](1);
        uint8[]   memory maxRevisions = new uint8[](1);
        amounts[0]      = AMOUNT;
        expiries[0]     = block.timestamp + FUTURE;
        maxRevisions[0] = 0; // should default to 3

        vm.prank(client);
        uint256 id = escrow.createAgreement(provider, resolver, TERMS, amounts, expiries, maxRevisions, 30 days, false);

        (,,,,,,uint8 maxRev,) = _getMilestone(id, 0);
        assertEq(maxRev, 3);
    }

    function test_CreateAgreement_MultiMilestone() public {
        uint256[] memory amounts      = new uint256[](3);
        uint256[] memory expiries     = new uint256[](3);
        uint8[]   memory maxRevisions = new uint8[](3);
        for (uint256 i = 0; i < 3; i++) {
            amounts[i]      = AMOUNT * (i + 1);
            expiries[i]     = block.timestamp + FUTURE;
            maxRevisions[i] = 3;
        }

        vm.prank(client);
        uint256 id = escrow.createAgreement(provider, resolver, TERMS, amounts, expiries, maxRevisions, 30 days, false);

        (, , , , uint8 mc, , ,) = escrow.agreements(id);
        assertEq(mc, 3);
    }

    // =========================================================================
    // createAgreement — revert paths
    // =========================================================================

    function test_Revert_CreateAgreement_MismatchedArrayLengths() public {
        uint256[] memory amounts      = new uint256[](2);
        uint256[] memory expiries     = new uint256[](1); // mismatch
        uint8[]   memory maxRevisions = new uint8[](2);
        amounts[0] = AMOUNT; amounts[1] = AMOUNT;
        expiries[0] = block.timestamp + FUTURE;
        maxRevisions[0] = 3; maxRevisions[1] = 3;

        vm.prank(client);
        vm.expectRevert(MilestonePayEscrow.ArrayLengthMismatch.selector);
        escrow.createAgreement(provider, resolver, TERMS, amounts, expiries, maxRevisions, 30 days, false);
    }

    function test_Revert_CreateAgreement_MaxMilestonesExceeded() public {
        uint256[] memory amounts      = new uint256[](6);
        uint256[] memory expiries     = new uint256[](6);
        uint8[]   memory maxRevisions = new uint8[](6);
        for (uint256 i = 0; i < 6; i++) {
            amounts[i]      = AMOUNT;
            expiries[i]     = block.timestamp + FUTURE;
            maxRevisions[i] = 3;
        }

        vm.prank(client);
        vm.expectRevert(MilestonePayEscrow.MaxMilestonesExceeded.selector);
        escrow.createAgreement(provider, resolver, TERMS, amounts, expiries, maxRevisions, 30 days, false);
    }

    function test_Revert_CreateAgreement_ResolverEqualsClient() public {
        uint256[] memory amounts      = new uint256[](1);
        uint256[] memory expiries     = new uint256[](1);
        uint8[]   memory maxRevisions = new uint8[](1);
        amounts[0]      = AMOUNT;
        expiries[0]     = block.timestamp + FUTURE;
        maxRevisions[0] = 3;

        // resolver == client (msg.sender) triggers NotParty
        vm.prank(client);
        vm.expectRevert(MilestonePayEscrow.NotParty.selector);
        escrow.createAgreement(provider, client, TERMS, amounts, expiries, maxRevisions, 30 days, false);
    }

    function test_Revert_CreateAgreement_ZeroAmount() public {
        uint256[] memory amounts      = new uint256[](1);
        uint256[] memory expiries     = new uint256[](1);
        uint8[]   memory maxRevisions = new uint8[](1);
        amounts[0]      = 0; // zero
        expiries[0]     = block.timestamp + FUTURE;
        maxRevisions[0] = 3;

        vm.prank(client);
        vm.expectRevert(MilestonePayEscrow.ZeroAmount.selector);
        escrow.createAgreement(provider, resolver, TERMS, amounts, expiries, maxRevisions, 30 days, false);
    }

    function test_Revert_CreateAgreement_ExpiryInPast() public {
        uint256[] memory amounts      = new uint256[](1);
        uint256[] memory expiries     = new uint256[](1);
        uint8[]   memory maxRevisions = new uint8[](1);
        amounts[0]      = AMOUNT;
        expiries[0]     = block.timestamp; // not in the future
        maxRevisions[0] = 3;

        vm.prank(client);
        vm.expectRevert(MilestonePayEscrow.ExpiryInPast.selector);
        escrow.createAgreement(provider, resolver, TERMS, amounts, expiries, maxRevisions, 30 days, false);
    }

    // =========================================================================
    // fund — happy path
    // =========================================================================

    function test_Fund_EmitsMilestoneFunded() public {
        uint256 id = _createAgreement(3);

        vm.prank(client);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit MilestonePayEscrow.MilestoneFunded(id, 0, AMOUNT);
        escrow.fund(id, 0);
    }

    function test_Fund_TransfersUsdcToEscrow() public {
        uint256 before = usdc.balanceOf(address(escrow));
        _createAndFund(3);
        assertEq(usdc.balanceOf(address(escrow)), before + AMOUNT);
    }

    function test_Fund_SetsMilestoneStatusFunded() public {
        uint256 id = _createAndFund(3);
        (uint256 amt,,MilestonePayEscrow.MilestoneStatus status,,,,, ) = _getMilestone(id, 0);
        assertEq(amt, AMOUNT);
        assertEq(uint8(status), uint8(MilestonePayEscrow.MilestoneStatus.Funded));
    }

    // =========================================================================
    // fund — revert paths
    // =========================================================================

    function test_Revert_Fund_NotClient() public {
        uint256 id = _createAgreement(3);

        vm.prank(stranger);
        vm.expectRevert(MilestonePayEscrow.NotClient.selector);
        escrow.fund(id, 0);
    }

    function test_Revert_Fund_InvalidMilestoneStatus_AlreadyFunded() public {
        uint256 id = _createAndFund(3);

        vm.prank(client);
        vm.expectRevert(MilestonePayEscrow.InvalidMilestoneStatus.selector);
        escrow.fund(id, 0); // already Funded → not Pending
    }

    // =========================================================================
    // submitDeliverable — happy path
    // =========================================================================

    function test_SubmitDeliverable_EmitsDeliverableSubmitted() public {
        uint256 id = _createAndFund(3);

        vm.prank(provider);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit MilestonePayEscrow.DeliverableSubmitted(id, 0, DELIVERABLE);
        escrow.submitDeliverable(id, 0, DELIVERABLE);
    }

    function test_SubmitDeliverable_SetsMilestoneStatusSubmitted() public {
        uint256 id = _createFundAndSubmit(3);
        (,, MilestonePayEscrow.MilestoneStatus status,,,,, ) = _getMilestone(id, 0);
        assertEq(uint8(status), uint8(MilestonePayEscrow.MilestoneStatus.Submitted));
    }

    function test_SubmitDeliverable_StoresHash() public {
        uint256 id = _createFundAndSubmit(3);
        (,,, bytes32 dHash,,,, ) = _getMilestone(id, 0);
        assertEq(dHash, DELIVERABLE);
    }

    // =========================================================================
    // submitDeliverable — revert paths
    // =========================================================================

    function test_Revert_SubmitDeliverable_NotProvider() public {
        uint256 id = _createAndFund(3);

        vm.prank(stranger);
        vm.expectRevert(MilestonePayEscrow.NotProvider.selector);
        escrow.submitDeliverable(id, 0, DELIVERABLE);
    }

    function test_Revert_SubmitDeliverable_AfterExpiry() public {
        uint256 id = _createAndFund(3);

        vm.warp(block.timestamp + FUTURE + 1); // past expiry

        vm.prank(provider);
        vm.expectRevert(MilestonePayEscrow.MilestoneExpired.selector);
        escrow.submitDeliverable(id, 0, DELIVERABLE);
    }

    function test_Revert_SubmitDeliverable_ZeroDeliverable() public {
        uint256 id = _createAndFund(3);

        vm.prank(provider);
        vm.expectRevert(MilestonePayEscrow.ZeroDeliverable.selector);
        escrow.submitDeliverable(id, 0, bytes32(0));
    }

    // =========================================================================
    // approveRelease — happy path
    // =========================================================================

    function test_ApproveRelease_CreditsProviderPendingWithdrawal() public {
        uint256 id = _createFundAndSubmit(3);

        vm.prank(client);
        escrow.approveRelease(id, 0);

        assertEq(escrow.pendingWithdrawals(provider), AMOUNT);
    }

    function test_ApproveRelease_EmitsPaymentReleased() public {
        uint256 id = _createFundAndSubmit(3);

        vm.prank(client);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit MilestonePayEscrow.PaymentReleased(id, 0, provider, AMOUNT);
        escrow.approveRelease(id, 0);
    }

    function test_ApproveRelease_SetsMilestoneStatusReleased() public {
        uint256 id = _createFundAndSubmit(3);
        vm.prank(client);
        escrow.approveRelease(id, 0);

        (,, MilestonePayEscrow.MilestoneStatus status,,,,, ) = _getMilestone(id, 0);
        assertEq(uint8(status), uint8(MilestonePayEscrow.MilestoneStatus.Released));
    }

    // =========================================================================
    // approveRelease — revert paths
    // =========================================================================

    function test_Revert_ApproveRelease_InvalidMilestoneStatus_NotSubmitted() public {
        uint256 id = _createAndFund(3); // still Funded, not Submitted

        vm.prank(client);
        vm.expectRevert(MilestonePayEscrow.InvalidMilestoneStatus.selector);
        escrow.approveRelease(id, 0);
    }

    // =========================================================================
    // withdraw — happy path
    // =========================================================================

    function test_Withdraw_ProviderReceivesUsdc() public {
        uint256 id = _createFundAndSubmit(3);
        vm.prank(client);
        escrow.approveRelease(id, 0);

        uint256 before = usdc.balanceOf(provider);
        vm.prank(provider);
        escrow.withdraw();

        assertEq(usdc.balanceOf(provider), before + AMOUNT);
    }

    function test_Withdraw_EmitsWithdrawn() public {
        uint256 id = _createFundAndSubmit(3);
        vm.prank(client);
        escrow.approveRelease(id, 0);

        vm.prank(provider);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit MilestonePayEscrow.Withdrawn(provider, AMOUNT);
        escrow.withdraw();
    }

    function test_Withdraw_ZeroesPendingWithdrawal() public {
        uint256 id = _createFundAndSubmit(3);
        vm.prank(client);
        escrow.approveRelease(id, 0);

        vm.prank(provider);
        escrow.withdraw();

        assertEq(escrow.pendingWithdrawals(provider), 0);
    }

    // =========================================================================
    // withdraw — revert paths
    // =========================================================================

    function test_Revert_Withdraw_NothingToWithdraw() public {
        vm.prank(provider);
        vm.expectRevert(MilestonePayEscrow.NothingToWithdraw.selector);
        escrow.withdraw();
    }

    // =========================================================================
    // requestChanges — below revisionLimit → Revision
    // =========================================================================

    function test_RequestChanges_BelowLimit_SetsRevisionStatus() public {
        uint256 id = _createFundAndSubmit(3);

        vm.prank(client);
        escrow.requestChanges(id, 0, REASON);

        (,, MilestonePayEscrow.MilestoneStatus status,, bytes32 rHash, uint8 revCount,,) = _getMilestone(id, 0);
        assertEq(uint8(status),  uint8(MilestonePayEscrow.MilestoneStatus.Revision));
        assertEq(rHash,    REASON);
        assertEq(revCount, 1);
    }

    function test_RequestChanges_BelowLimit_EmitsChangesRequested() public {
        uint256 id = _createFundAndSubmit(3);

        vm.prank(client);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit MilestonePayEscrow.ChangesRequested(id, 0, REASON, 1);
        escrow.requestChanges(id, 0, REASON);
    }

    function test_RequestChanges_BelowLimit_IncrementRevisionCount() public {
        // max revisions = 3, do two rounds and confirm count increments
        uint256 id = _createAndFund(3);

        for (uint8 r = 1; r <= 2; r++) {
            vm.prank(provider);
            escrow.submitDeliverable(id, 0, DELIVERABLE);
            vm.prank(client);
            escrow.requestChanges(id, 0, REASON);
            (,,,,,uint8 cnt,,) = _getMilestone(id, 0);
            assertEq(cnt, r);
        }
    }

    // =========================================================================
    // requestChanges — at revisionLimit → auto-escalate to Disputed
    // =========================================================================

    function test_RequestChanges_AtLimit_SetsDisputedStatus() public {
        // maxRevisions = 1: first requestChanges uses the revision, second escalates
        uint256 id = _createFundAndSubmit(MAX_REV); // MAX_REV = 1

        vm.prank(client);
        escrow.requestChanges(id, 0, REASON); // revisionCount becomes 1 == maxRevisions(1): no, we need to exhaust

        // Now resubmit and request again — revisionCount == maxRevisions on second call
        vm.prank(provider);
        escrow.submitDeliverable(id, 0, DELIVERABLE);
        vm.prank(client);
        escrow.requestChanges(id, 0, REASON); // now revisionCount(1) >= maxRevisions(1) → escalate

        (,, MilestonePayEscrow.MilestoneStatus status,,,,, uint256 dd) = _getMilestone(id, 0);
        assertEq(uint8(status), uint8(MilestonePayEscrow.MilestoneStatus.Disputed));
        assertGt(dd, block.timestamp);
    }

    function test_RequestChanges_AtLimit_EmitsDisputeRaisedAndDeadlineSet() public {
        uint256 id = _createFundAndSubmit(MAX_REV);

        // Exhaust the one revision
        vm.prank(client);
        escrow.requestChanges(id, 0, REASON);
        vm.prank(provider);
        escrow.submitDeliverable(id, 0, DELIVERABLE);

        // On next requestChanges, revision count == maxRevisions → escalate
        uint256 expectedDeadline = block.timestamp + 30 days;
        vm.prank(client);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit MilestonePayEscrow.DisputeRaised(id, 0, client, REASON);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit MilestonePayEscrow.DisputeDeadlineSet(id, 0, expectedDeadline);
        escrow.requestChanges(id, 0, REASON);
    }

    // =========================================================================
    // requestChanges — revert paths
    // =========================================================================

    function test_Revert_RequestChanges_InvalidMilestoneStatus_NotSubmitted() public {
        uint256 id = _createAndFund(3); // Funded, not Submitted

        vm.prank(client);
        vm.expectRevert(MilestonePayEscrow.InvalidMilestoneStatus.selector);
        escrow.requestChanges(id, 0, REASON);
    }

    // =========================================================================
    // raiseDispute — happy path
    // =========================================================================

    function test_RaiseDispute_SetsDisputedStatus() public {
        uint256 id = _createFundAndSubmit(3);

        vm.prank(client);
        escrow.raiseDispute(id, 0, REASON);

        (,, MilestonePayEscrow.MilestoneStatus status,,,,, uint256 dd) = _getMilestone(id, 0);
        assertEq(uint8(status), uint8(MilestonePayEscrow.MilestoneStatus.Disputed));
        assertGt(dd, 0);
    }

    function test_RaiseDispute_EmitsDisputeRaisedAndDeadlineSet() public {
        uint256 id = _createFundAndSubmit(3);
        uint256 expectedDeadline = block.timestamp + 30 days;

        vm.prank(provider);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit MilestonePayEscrow.DisputeRaised(id, 0, provider, REASON);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit MilestonePayEscrow.DisputeDeadlineSet(id, 0, expectedDeadline);
        escrow.raiseDispute(id, 0, REASON);
    }

    function test_RaiseDispute_ProviderCanRaiseOnFundedMilestone() public {
        uint256 id = _createAndFund(3); // Funded, not Submitted

        vm.prank(provider);
        escrow.raiseDispute(id, 0, REASON);

        (,, MilestonePayEscrow.MilestoneStatus status,,,,, ) = _getMilestone(id, 0);
        assertEq(uint8(status), uint8(MilestonePayEscrow.MilestoneStatus.Disputed));
    }

    // =========================================================================
    // raiseDispute — revert paths
    // =========================================================================

    function test_Revert_RaiseDispute_NotParty() public {
        uint256 id = _createFundAndSubmit(3);

        vm.prank(stranger);
        vm.expectRevert(MilestonePayEscrow.NotParty.selector);
        escrow.raiseDispute(id, 0, REASON);
    }

    function test_Revert_RaiseDispute_InvalidStatus_Released() public {
        uint256 id = _createFundAndSubmit(3);

        // Approve to put into Released (terminal)
        vm.prank(client);
        escrow.approveRelease(id, 0);

        vm.prank(client);
        vm.expectRevert(MilestonePayEscrow.InvalidMilestoneStatus.selector);
        escrow.raiseDispute(id, 0, REASON);
    }

    // =========================================================================
    // resolveDispute — happy path
    // =========================================================================

    function test_ResolveDispute_ToProvider_CreditsProviderAndEmits() public {
        uint256 id = _createFundAndSubmit(3);
        vm.prank(client);
        escrow.raiseDispute(id, 0, REASON);

        vm.prank(resolver);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit MilestonePayEscrow.PaymentReleased(id, 0, provider, AMOUNT);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit MilestonePayEscrow.DisputeResolved(id, 0, true, AMOUNT);
        escrow.resolveDispute(id, 0, true);

        assertEq(escrow.pendingWithdrawals(provider), AMOUNT);
        assertEq(escrow.pendingWithdrawals(client),   0);
    }

    function test_ResolveDispute_ToClient_CreditsClientAndEmits() public {
        uint256 id = _createFundAndSubmit(3);
        vm.prank(client);
        escrow.raiseDispute(id, 0, REASON);

        vm.prank(resolver);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit MilestonePayEscrow.RefundClaimed(id, 0, client, AMOUNT);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit MilestonePayEscrow.DisputeResolved(id, 0, false, AMOUNT);
        escrow.resolveDispute(id, 0, false);

        assertEq(escrow.pendingWithdrawals(client),   AMOUNT);
        assertEq(escrow.pendingWithdrawals(provider), 0);
    }

    // =========================================================================
    // resolveDispute — revert paths
    // =========================================================================

    function test_Revert_ResolveDispute_NotResolver() public {
        uint256 id = _createFundAndSubmit(3);
        vm.prank(client);
        escrow.raiseDispute(id, 0, REASON);

        vm.prank(stranger);
        vm.expectRevert(MilestonePayEscrow.NotResolver.selector);
        escrow.resolveDispute(id, 0, true);
    }

    // =========================================================================
    // claimRefund — happy path
    // =========================================================================

    function test_ClaimRefund_AfterExpiry_CreditsClientAndEmits() public {
        uint256 id = _createAndFund(3);

        vm.warp(block.timestamp + FUTURE + 1); // past expiry

        vm.prank(client);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit MilestonePayEscrow.RefundClaimed(id, 0, client, AMOUNT);
        escrow.claimRefund(id, 0);

        assertEq(escrow.pendingWithdrawals(client), AMOUNT);
    }

    function test_ClaimRefund_SetsRefundedStatus() public {
        uint256 id = _createAndFund(3);
        vm.warp(block.timestamp + FUTURE + 1);
        vm.prank(client);
        escrow.claimRefund(id, 0);

        (,, MilestonePayEscrow.MilestoneStatus status,,,,, ) = _getMilestone(id, 0);
        assertEq(uint8(status), uint8(MilestonePayEscrow.MilestoneStatus.Refunded));
    }

    // =========================================================================
    // claimRefund — revert paths
    // =========================================================================

    function test_Revert_ClaimRefund_BeforeExpiry() public {
        uint256 id = _createAndFund(3);

        vm.prank(client);
        vm.expectRevert(MilestonePayEscrow.MilestoneNotExpired.selector);
        escrow.claimRefund(id, 0);
    }

    function test_Revert_ClaimRefund_StatusSubmitted() public {
        uint256 id = _createFundAndSubmit(3); // status = Submitted, not Funded

        vm.warp(block.timestamp + FUTURE + 1);

        vm.prank(client);
        vm.expectRevert(MilestonePayEscrow.InvalidMilestoneStatus.selector);
        escrow.claimRefund(id, 0);
    }

    // =========================================================================
    // claimDisputeRefund — happy paths
    // =========================================================================

    function test_ClaimDisputeRefund_DefaultToProvider_CreditsProvider() public {
        // Create agreement with disputeDefaultToProvider = true
        uint256[] memory amounts      = new uint256[](1);
        uint256[] memory expiries     = new uint256[](1);
        uint8[]   memory maxRevisions = new uint8[](1);
        amounts[0]      = AMOUNT;
        expiries[0]     = block.timestamp + FUTURE;
        maxRevisions[0] = 3;

        vm.prank(client);
        uint256 id = escrow.createAgreement(provider, resolver, TERMS, amounts, expiries, maxRevisions, 30 days, true);

        vm.prank(client);
        escrow.fund(id, 0);
        vm.prank(provider);
        escrow.submitDeliverable(id, 0, DELIVERABLE);
        vm.prank(client);
        escrow.raiseDispute(id, 0, REASON);

        // Warp past disputeDeadline (30 days from now)
        vm.warp(block.timestamp + 30 days + 1);

        vm.prank(provider); // provider calls
        escrow.claimDisputeRefund(id, 0);

        assertEq(escrow.pendingWithdrawals(provider), AMOUNT);
        assertEq(escrow.pendingWithdrawals(client),   0);
    }

    function test_ClaimDisputeRefund_DefaultToClient_CreditsClient() public {
        // Create agreement with disputeDefaultToProvider = false (client gets refund by default)
        uint256 id = _createFundAndSubmit(3);
        vm.prank(client);
        escrow.raiseDispute(id, 0, REASON);

        vm.warp(block.timestamp + 30 days + 1);

        vm.prank(client); // client calls
        escrow.claimDisputeRefund(id, 0);

        assertEq(escrow.pendingWithdrawals(client),   AMOUNT);
        assertEq(escrow.pendingWithdrawals(provider), 0);
    }

    // =========================================================================
    // claimDisputeRefund — revert paths
    // =========================================================================

    function test_Revert_ClaimDisputeRefund_BeforeDeadline() public {
        uint256 id = _createFundAndSubmit(3);
        vm.prank(client);
        escrow.raiseDispute(id, 0, REASON);

        // Do NOT warp — still before disputeDeadline
        vm.prank(client);
        vm.expectRevert(MilestonePayEscrow.DisputeDeadlineNotReached.selector);
        escrow.claimDisputeRefund(id, 0);
    }

    function test_Revert_ClaimDisputeRefund_NotDisputed() public {
        uint256 id = _createAndFund(3); // Funded, not Disputed

        vm.prank(client);
        vm.expectRevert(MilestonePayEscrow.InvalidMilestoneStatus.selector);
        escrow.claimDisputeRefund(id, 0);
    }

    function test_Revert_ClaimDisputeRefund_NotParty() public {
        uint256 id = _createFundAndSubmit(3);
        vm.prank(client);
        escrow.raiseDispute(id, 0, REASON);
        vm.warp(block.timestamp + 30 days + 1);

        vm.prank(stranger);
        vm.expectRevert(MilestonePayEscrow.NotParty.selector);
        escrow.claimDisputeRefund(id, 0);
    }

    // =========================================================================
    // all-milestones-terminal sets agreement.active = false
    // =========================================================================

    function test_AllMilestonesTerminal_SetsAgreementInactive() public {
        uint256 id = _createFundAndSubmit(3);
        vm.prank(client);
        escrow.approveRelease(id, 0);

        // Only 1 milestone, releasing it should deactivate the agreement
        (, , , , , bool active, ,) = escrow.agreements(id);
        assertFalse(active);
    }

    function test_AllMilestonesTerminal_MultiMilestone() public {
        uint256[] memory amounts      = new uint256[](2);
        uint256[] memory expiries     = new uint256[](2);
        uint8[]   memory maxRevisions = new uint8[](2);
        amounts[0] = AMOUNT; amounts[1] = AMOUNT;
        expiries[0] = block.timestamp + FUTURE;
        expiries[1] = block.timestamp + FUTURE;
        maxRevisions[0] = 3; maxRevisions[1] = 3;

        vm.prank(client);
        uint256 id = escrow.createAgreement(provider, resolver, TERMS, amounts, expiries, maxRevisions, 30 days, false);

        // Fund + submit + approve milestone 0
        vm.prank(client);  escrow.fund(id, 0);
        vm.prank(provider); escrow.submitDeliverable(id, 0, DELIVERABLE);
        vm.prank(client);  escrow.approveRelease(id, 0);
        // Agreement still active (milestone 1 is Pending)
        (, , , , , bool stillActive, ,) = escrow.agreements(id);
        assertTrue(stillActive);

        // Fund + submit + approve milestone 1
        vm.prank(client);  escrow.fund(id, 1);
        vm.prank(provider); escrow.submitDeliverable(id, 1, DELIVERABLE);
        vm.prank(client);  escrow.approveRelease(id, 1);
        // Now both Released → inactive
        (, , , , , bool nowInactive, ,) = escrow.agreements(id);
        assertFalse(nowInactive);
    }

    // =========================================================================
    // Full happy-path end-to-end: fund → submit → approve → withdraw
    // =========================================================================

    function test_FullHappyPath_FundSubmitApproveWithdraw() public {
        uint256 id = _createFundAndSubmit(3);

        // Approve
        vm.prank(client);
        escrow.approveRelease(id, 0);
        assertEq(escrow.pendingWithdrawals(provider), AMOUNT);

        // Withdraw
        uint256 balBefore = usdc.balanceOf(provider);
        vm.prank(provider);
        escrow.withdraw();
        assertEq(usdc.balanceOf(provider),            balBefore + AMOUNT);
        assertEq(escrow.pendingWithdrawals(provider), 0);
    }

    // =========================================================================
    // Fuzz: amounts through full happy path
    // =========================================================================

    function testFuzz_FullHappyPath_Amount(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000e6);

        uint256[] memory amounts      = new uint256[](1);
        uint256[] memory expiries     = new uint256[](1);
        uint8[]   memory maxRevisions = new uint8[](1);
        amounts[0]      = amount;
        expiries[0]     = block.timestamp + FUTURE;
        maxRevisions[0] = 3;

        // Seed client with enough
        usdc.mint(client, amount);

        vm.prank(client);
        uint256 id = escrow.createAgreement(provider, resolver, TERMS, amounts, expiries, maxRevisions, 30 days, false);

        vm.prank(client);
        escrow.fund(id, 0);

        vm.prank(provider);
        escrow.submitDeliverable(id, 0, DELIVERABLE);

        vm.prank(client);
        escrow.approveRelease(id, 0);

        assertEq(escrow.pendingWithdrawals(provider), amount);

        vm.prank(provider);
        escrow.withdraw();

        assertEq(escrow.pendingWithdrawals(provider), 0);
    }

    // =========================================================================
    // Fuzz: disputeTimeout stored correctly
    // =========================================================================

    function testFuzz_DisputeTimeout_StoredCorrectly(uint256 timeout) public {
        // Valid range: 1 day to 90 days (or 0 to default to 30 days)
        timeout = bound(timeout, 1 days, 90 days);

        uint256[] memory amounts      = new uint256[](1);
        uint256[] memory expiries     = new uint256[](1);
        uint8[]   memory maxRevisions = new uint8[](1);
        amounts[0]      = AMOUNT;
        expiries[0]     = block.timestamp + FUTURE;
        maxRevisions[0] = 3;

        vm.prank(client);
        uint256 id = escrow.createAgreement(provider, resolver, TERMS, amounts, expiries, maxRevisions, timeout, false);

        (, , , , , , uint256 storedTimeout,) = escrow.agreements(id);
        assertEq(storedTimeout, timeout);
    }

    // =========================================================================
    // Internal helper: decode a Milestone from the public mapping
    // =========================================================================

    function _getMilestone(uint256 agreementId, uint8 milestoneIndex)
        internal
        view
        returns (
            uint256 amount,
            uint256 expiry,
            MilestonePayEscrow.MilestoneStatus status,
            bytes32 deliverableHash,
            bytes32 reasonHash,
            uint8 revisionCount,
            uint8 maxRevisions,
            uint256 disputeDeadline
        )
    {
        return escrow.milestones(agreementId, milestoneIndex);
    }
}
