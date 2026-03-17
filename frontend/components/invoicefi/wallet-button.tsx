'use client'

import { Wallet, ChevronDown, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { truncateAddress } from '@/lib/invoicefi/utils'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { polkadotTestnet } from '@/lib/wagmi-config'

export function WalletButton() {
  const { address, isConnected, chain } = useAccount()
  const { connect, isPending } = useConnect()
  const { disconnect } = useDisconnect()

  const isWrongNetwork = isConnected && chain?.id !== polkadotTestnet.id

  if (!isConnected) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => connect({ connector: injected() })}
        disabled={isPending}
        className="flex items-center gap-2 h-9"
      >
        <Wallet className="w-4 h-4" />
        <span className="text-sm font-medium">
          {isPending ? 'Connecting...' : 'Connect Wallet'}
        </span>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`flex items-center gap-2 h-9 ${isWrongNetwork ? 'border-destructive text-destructive' : ''}`}
        >
          <Wallet className="w-4 h-4" />
          <span className="text-sm font-medium">
            {isWrongNetwork ? 'Wrong Network' : truncateAddress(address ?? '')}
          </span>
          <ChevronDown className="w-3 h-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isWrongNetwork && (
          <DropdownMenuItem
            onClick={() => connect({ connector: injected(), chainId: polkadotTestnet.id })}
            className="text-destructive"
          >
            Switch to Polkadot Hub Testnet
          </DropdownMenuItem>
        )}
        {!isWrongNetwork && (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            {chain?.name}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => disconnect()} className="text-destructive">
          <LogOut className="w-3 h-3 mr-2" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
