import type { WireGonkaModels } from '../wire'
import { respond } from '../client'
import { TRUTH_MODEL } from '@/lib/mock-data/verification'

/** A short, fixed list standing in for a real Gonka Router account's models —
 * there is no live router behind the mock layer to list them from. */
const MOCK_MODELS = [TRUTH_MODEL, 'gonka/med-claims-verifier-v1', 'deepseek-ai/DeepSeek-V4-Flash-0731']

export async function listModels(): Promise<WireGonkaModels> {
  return respond({ models: MOCK_MODELS, default: TRUTH_MODEL })
}
