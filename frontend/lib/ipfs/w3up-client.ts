// Server-only w3up client singleton for real IPFS uploads via web3.storage
// Requires WEB3_STORAGE_KEY and WEB3_STORAGE_PROOF in .env.local

import * as Client from '@web3-storage/w3up-client'
import { Signer } from '@ucanto/principal/ed25519'
import { StoreMemory } from '@web3-storage/w3up-client/stores/memory'
import * as Proof from '@web3-storage/w3up-client/proof'

let clientPromise: Promise<Client.Client> | null = null

export function getW3upClient(): Promise<Client.Client> {
  if (clientPromise) return clientPromise

  clientPromise = (async () => {
    const key = process.env.WEB3_STORAGE_KEY
    const proof = process.env.WEB3_STORAGE_PROOF

    if (!key || !proof) {
      throw new Error('WEB3_STORAGE_KEY and WEB3_STORAGE_PROOF must be set in .env.local')
    }

    const principal = Signer.parse(key)
    const store = new StoreMemory()
    const client = await Client.create({ principal, store })

    const proofDelegation = await Proof.parse(proof)
    const space = await client.addSpace(proofDelegation)
    await client.setCurrentSpace(space.did())

    console.log('[w3up] Client initialized, space:', space.did())
    return client
  })()

  // Reset on failure so next call retries
  clientPromise.catch(() => {
    clientPromise = null
  })

  return clientPromise
}
