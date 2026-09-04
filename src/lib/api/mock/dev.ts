import type { FundTreasuryResult } from '../live/dev'
import { respond } from '../client'

/**
 * Mock mode has no real chain, so there's no on-chain treasury balance to run
 * short in the first place — `_store.ts`'s `settleOnChain` always succeeds.
 * This just simulates a believable transaction digest so the dev-tools UI has
 * something real to show.
 */
export async function fundTreasury(_amountSui: number): Promise<FundTreasuryResult> {
  return respond(
    { digest: `mock-fund-treasury-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` },
    300,
    700,
  )
}
