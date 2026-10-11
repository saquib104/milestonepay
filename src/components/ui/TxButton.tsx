/**
 * Transaction-aware button that cycles through:
 * not-connected → wrong-chain → idle → wallet-pending → confirming → success → error
 * Uses real wagmi state; never simulates progress.
 */
import { CheckCircle2, AlertCircle, ArrowRightLeft } from 'lucide-react'
import { Button } from './Button'
import { useChainGuard } from '../../hooks/useChainGuard'
import { useAccount } from 'wagmi'

interface TxButtonProps {
  label: string
  onClick: () => void
  isPending: boolean
  isConfirming: boolean
  isSuccess: boolean
  error?: unknown
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function TxButton({
  label,
  onClick,
  isPending,
  isConfirming,
  isSuccess,
  error,
  disabled = false,
  size = 'lg',
  className = '',
}: TxButtonProps) {
  const { isConnected } = useAccount()
  const { isWrongChain, isSwitching, switchToArc } = useChainGuard()

  if (!isConnected) {
    return (
      <Button variant="secondary" size={size} disabled className={className}>
        Connect wallet to continue
      </Button>
    )
  }

  if (isWrongChain) {
    return (
      <Button
        variant="outline"
        size={size}
        loading={isSwitching}
        onClick={switchToArc}
        className={className}
      >
        <ArrowRightLeft className="size-3.5" />
        Switch to Arc Mainnet
      </Button>
    )
  }

  if (isSuccess) {
    return (
      <Button variant="secondary" size={size} disabled className={className}>
        <CheckCircle2 className="size-3.5 text-[--success]" />
        Confirmed
      </Button>
    )
  }

  if (error) {
    return (
      <Button variant="danger" size={size} onClick={onClick} className={className}>
        <AlertCircle className="size-3.5" />
        Retry
      </Button>
    )
  }

  if (isPending) {
    return (
      <Button variant="primary" size={size} loading disabled className={className}>
        Confirm in wallet…
      </Button>
    )
  }

  if (isConfirming) {
    return (
      <Button variant="primary" size={size} loading disabled className={className}>
        Confirming on Arc…
      </Button>
    )
  }

  return (
    <Button variant="primary" size={size} onClick={onClick} disabled={disabled} className={className}>
      {label}
    </Button>
  )
}
