import { http } from '../http'
import type { WireGonkaModels } from '../wire'

/**
 * `GET /api/gonka/models` — lets a caller (the claim-verification form) offer
 * a real choice of model instead of a hardcoded guess. Public, no auth.
 */
export async function listModels(): Promise<WireGonkaModels> {
  return http<WireGonkaModels>('/api/gonka/models', { auth: false })
}
