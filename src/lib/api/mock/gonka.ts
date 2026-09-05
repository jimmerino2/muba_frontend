import type { WireGonkaModels } from '../wire'
import { respond } from '../client'
import { TRUTH_MODEL } from '@/lib/mock-data/verification'

/** A fixed list standing in for a real Gonka Router account's models — there
 * is no live router behind the mock layer to list them from. Deliberately
 * more than a live account would actually have, so the claim page's
 * model-comparison checkboxes have enough choices to demo without an API key. */
const MOCK_MODELS = [
  TRUTH_MODEL,
  'gonka/med-claims-verifier-v1',
  'deepseek-ai/DeepSeek-V4-Flash-0731',
  'MiniMaxAI/MiniMax-M2.7',
  'meta-llama/Llama-4-Maverick-17B',
  'Qwen/Qwen3-235B-A22B',
  'mistralai/Mixtral-8x22B-Instruct',
  'google/gemma-3-27b-it',
]

export async function listModels(): Promise<WireGonkaModels> {
  return respond({ models: MOCK_MODELS, default: TRUTH_MODEL })
}
