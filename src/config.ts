/**
 * wagmi configuration — MilestonePay
 * Production target: Arc Mainnet (chain ID 5042) only.
 *
 * Arc chain definition source:
 *   viem 2.57.3 ships `arc` as a built-in chain (verified 2026-10-11).
 *   Official Arc docs: https://docs.arc.io/arc/references/connect-to-arc
 *   Chain ID 5042 | RPC https://rpc.mainnet.arc.io | Explorer https://explorer.arc.io
 *   Native currency: USDC, 18 decimals (gas view only — escrow math uses 6-decimal ERC-20)
 *
 * Arc Testnet (chain ID 5042002) is explicitly excluded from this config per product spec.
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc } from 'viem/chains'
import { injected, walletConnect } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Re-export the built-in arc chain so components can reference it without
// importing from viem/chains directly (avoids a second import path).
export { arc as arcMainnet }

// Pre-register Arc Mainnet RPC URL for trace event labelling.
registerChain(arc.id, arc.rpcUrls.default.http[0])

// WalletConnect project ID — set VITE_WALLETCONNECT_PROJECT_ID in .env.
// Without this, only injected wallets (MetaMask, Rabby, etc.) are available.
// Get a project ID at https://cloud.walletconnect.com
const wcProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined

const connectors = wcProjectId
  ? [injected(), walletConnect({ projectId: wcProjectId })]
  : [injected()]

export const config = createConfig({
  // mainnet is included ONLY for ConnectKit ENS resolution.
  // It is never shown to users as a network option.
  chains: [arc, mainnet],
  connectors,
  transports: {
    [arc.id]:     http(arc.rpcUrls.default.http[0]),
    [mainnet.id]: http(),
  },
})

/** The one and only supported chain ID for this app. */
export const TARGET_CHAIN_ID = arc.id
