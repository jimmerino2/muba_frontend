import { API_MODE } from './http'
import * as live from './live/gonka'
import * as mock from './mock/gonka'

/** Gonka Router model listing — dispatch between the live backend and the
 * mock fixtures. See `blockchain.ts` for the note on why both exist. */
const impl = API_MODE === 'mock' ? mock : live

export const { listModels } = impl
