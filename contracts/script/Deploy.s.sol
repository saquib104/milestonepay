// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// =============================================================================
// Deploy.s.sol — Foundry deployment script for MilestonePayEscrow
// =============================================================================
//
// STATUS: NOT INDEPENDENTLY AUDITED — do not broadcast on mainnet until audit complete.
//
// TARGET CHAIN: Arc Mainnet (chain ID 5042)
//   RPC:      https://rpc.mainnet.arc.io
//   Explorer: https://explorer.arc.io
//
// USDC ADDRESS (Arc Mainnet, verified from docs.arc.io/arc/references/contract-addresses):
//   0x3600000000000000000000000000000000000000
//   6-decimal ERC-20 interface. Confirm this address from official docs before deploy.
//
// USAGE (dry-run simulation — no broadcast, no gas spent):
//   forge script contracts/script/Deploy.s.sol \
//     --rpc-url https://rpc.mainnet.arc.io \
//     --account deployer \
//     --simulate
//
// USAGE (broadcast — requires all pre-deploy gates to have passed):
//   forge script contracts/script/Deploy.s.sol \
//     --rpc-url https://rpc.mainnet.arc.io \
//     --account deployer \
//     --broadcast \
//     --verify \
//     --etherscan-api-key $EXPLORER_API_KEY
//
// PRE-DEPLOY GATES (all must pass before --broadcast):
//   [ ] Independent professional audit complete; all Critical and High findings resolved.
//   [ ] forge test --coverage shows 100% branch coverage on state machine transitions.
//   [ ] Integration tests pass on arc-anvil --network arc fork.
//   [ ] Second reviewer confirms USDC address and chain ID in this script.
//   [ ] Legal review of terms-hash anchoring approach completed.
//
// KEY MANAGEMENT:
//   NEVER pass --private-key on the command line. Use `cast wallet import deployer`
//   to create an encrypted keystore entry, then pass --account deployer.
//   The deployer address is not stored in this script.
//
// POST-DEPLOY STEPS:
//   1. Record the deployed contract address in AGENTS.md.
//   2. Run Verify.s.sol to confirm constructor state.
//   3. Add VITE_CONTRACT_ADDRESS=<deployed address> to .env.
//   4. Rebuild and redeploy the frontend.
//
// =============================================================================

import {Script, console} from "forge-std/Script.sol";
import {MilestonePayEscrow} from "../MilestonePayEscrow.sol";

contract DeployMilestonePayEscrow is Script {

    // -------------------------------------------------------------------------
    // Constants — Arc Mainnet
    // -------------------------------------------------------------------------

    /// @dev Arc Mainnet chain ID. Verified from docs.arc.io/arc/references/connect-to-arc.
    uint256 public constant ARC_MAINNET_CHAIN_ID = 5042;

    /// @dev USDC ERC-20 address on Arc Mainnet.
    ///      Source: docs.arc.io/arc/references/contract-addresses
    ///      Decimals: 6 (ERC-20 interface). Do NOT use 18-decimal native view for escrow.
    ///      VERIFY THIS ADDRESS FROM OFFICIAL DOCS BEFORE BROADCASTING.
    address public constant ARC_MAINNET_USDC = 0x3600000000000000000000000000000000000000;

    // -------------------------------------------------------------------------
    // Run
    // -------------------------------------------------------------------------

    function run() external returns (MilestonePayEscrow escrow) {
        // Refuse to broadcast on an unexpected chain — protects against accidental
        // testnet or wrong-network deploys.
        // NOTE: This check is enforced during simulation. In --broadcast mode,
        // forge passes the actual chain ID; if it does not match, the script aborts.
        if (block.chainid != ARC_MAINNET_CHAIN_ID) {
            console.log("Chain ID: %d (expected %d)", block.chainid, ARC_MAINNET_CHAIN_ID);
            revert("Deploy.s.sol: wrong chain. This script targets Arc Mainnet (5042) only");
        }

        // Confirm USDC has code at the expected address.
        // This is a safety check; it does not replace verifying the address from docs.
        uint256 usdcCodeSize;
        address usdc_ = ARC_MAINNET_USDC;
        assembly {
            usdcCodeSize := extcodesize(usdc_)
        }
        if (usdcCodeSize == 0) {
            revert("Deploy.s.sol: no code at USDC address. Verify ARC_MAINNET_USDC constant");
        }

        console.log("=== MilestonePayEscrow Deployment ===");
        console.log("Chain ID:        %d", block.chainid);
        console.log("USDC address:    %s", ARC_MAINNET_USDC);
        console.log("Deployer:        %s", msg.sender);
        console.log("Block:           %d", block.number);
        console.log("Timestamp:       %d", block.timestamp);

        vm.startBroadcast();

        escrow = new MilestonePayEscrow(ARC_MAINNET_USDC);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("Contract address: %s", address(escrow));
        console.log("USDC (immutable): %s", address(escrow.usdc()));
        console.log("Counter start:    %d", escrow.agreementCounter());
        console.log("");
        console.log("Next steps:");
        console.log("  1. Record address in AGENTS.md");
        console.log("  2. Run Verify.s.sol to confirm constructor state");
        console.log("  3. Set VITE_CONTRACT_ADDRESS in .env and rebuild frontend");
    }
}
