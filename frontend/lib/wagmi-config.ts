import { createConfig, http } from 'wagmi'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'

// Polkadot Hub Testnet — Polkadot EVM testnet (pallet_revive)
// pallet_revive does not support EIP-1559; force legacy gas pricing
export const polkadotTestnet = defineChain({
  id: 420420417,
  name: 'Polkadot Hub Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Paseo',
    symbol: 'PAS',
  },
  rpcUrls: {
    default: {
      http: ['https://eth-rpc-testnet.polkadot.io/'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Polkadot Hub Testnet Explorer',
      url: 'https://assethub-westend.subscan.io',
    },
  },
  testnet: true,
  fees: {
    // Force legacy transactions — return gasPrice instead of EIP-1559 fields
    async estimateFeesPerGas({ client }) {
      const gasPrice = await client.request({ method: 'eth_gasPrice' })
      return {
        gasPrice: BigInt(gasPrice as string),
      }
    },
  },
})

/** @deprecated Use polkadotTestnet instead */
export const westendHub = polkadotTestnet

export const wagmiConfig = createConfig({
  chains: [polkadotTestnet],
  connectors: [
    injected(), // MetaMask
  ],
  transports: {
    [polkadotTestnet.id]: http(),
  },
})
