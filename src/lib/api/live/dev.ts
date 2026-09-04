import { http } from '../http'

/**
 * Dev tools — not part of the domain API `API.md` documents. Mirrors the
 * backend's `ENABLE_DEV_TOOLS` gate: `POST /api/sui/treasury/fund` tops up
 * the shared on-chain settlement Treasury with real (worthless) testnet SUI.
 *
 * This exists because `claims::payout()` reads the actual on-chain Treasury
 * balance — an approved claim with an underfunded treasury doesn't fail, it
 * just sits at "payment pending" forever (see `Published.toml` / the Sui
 * feature notes in `muba_backend/CLAUDE.md`). Only an INSURANCE-org caller
 * may call it; the backend 404s this route entirely outside dev.
 */
export interface FundTreasuryResult {
  digest: string
}

export async function fundTreasury(amountSui: number): Promise<FundTreasuryResult> {
  return http<FundTreasuryResult>('/api/sui/treasury/fund', {
    method: 'POST',
    body: { amountSui },
  })
}
