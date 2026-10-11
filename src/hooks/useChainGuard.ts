import { useAccount, useSwitchChain } from 'wagmi'
import { TARGET_CHAIN_ID } from '../config'

/**
 * Returns the current chain state and a function to switch to Arc Mainnet.
 * Use isWrongChain to gate write actions; switchToArc to prompt the user.
 */
export function useChainGuard() {
  const { chainId, isConnected } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()

  const isWrongChain = isConnected && chainId !== TARGET_CHAIN_ID

  function switchToArc() {
    switchChain({ chainId: TARGET_CHAIN_ID })
  }

  return { isWrongChain, isSwitching, switchToArc, currentChainId: chainId }
}
