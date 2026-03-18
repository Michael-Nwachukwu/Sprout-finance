import deployments from '../../../deployments/polkadot-testnet.json'
import FXOracleABI from './abis/FXOracle.json'
import InvoiceNFTABI from './abis/InvoiceNFT.json'
import LendingPoolABI from './abis/LendingPool.json'
import CreditScoreRegistryABI from './abis/CreditScoreRegistry.json'

export const CONTRACTS = {
  FXOracle: {
    address: deployments.contracts.FXOracle as `0x${string}`,
    abi: FXOracleABI,
  },
  InvoiceNFT: {
    address: deployments.contracts.InvoiceNFT as `0x${string}`,
    abi: InvoiceNFTABI,
  },
  LendingPool: {
    address: deployments.contracts.LendingPool as `0x${string}`,
    abi: LendingPoolABI,
  },
  CreditScoreRegistry: {
    address: deployments.contracts.CreditScoreRegistry as `0x${string}`,
    abi: CreditScoreRegistryABI,
  },
  USDC: {
    address: deployments.contracts.USDC as `0x${string}`,
  },
} as const

export const CHAIN_ID = Number(deployments.chainId)

export { FXOracleABI, InvoiceNFTABI, LendingPoolABI, CreditScoreRegistryABI }
