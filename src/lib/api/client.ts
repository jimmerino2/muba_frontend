import type { ListQuery, Paginated } from '@/lib/types'

/**
 * The seam between the UI and the backend.
 *
 * Everything in /lib/api resolves from the in-memory mock store, but does so
 * asynchronously, behind a latency simulation, returning the same envelopes the
 * real API will return. Swapping to `/backend` means replacing the bodies of the
 * functions in these files with `http(...)` calls — no component changes.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const notFound = (resource: string, id: string): ApiError =>
  new ApiError(404, `${resource} "${id}" was not found.`, 'RESOURCE_NOT_FOUND')

export const badRequest = (message: string): ApiError =>
  new ApiError(400, message, 'INVALID_REQUEST')

export const conflict = (message: string): ApiError => new ApiError(409, message, 'STATE_CONFLICT')

/** Artificial network latency, so loading states are built now rather than retrofitted. */
export function latency(min = 150, max = 400): Promise<void> {
  const ms = min + Math.random() * (max - min)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Responses are deep-cloned on the way out so a component can never accidentally
 * mutate the store by holding a reference — exactly as a real HTTP boundary behaves.
 */
export function detach<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T)
}

export async function respond<T>(value: T, min?: number, max?: number): Promise<T> {
  await latency(min, max)
  return detach(value)
}

/** Wraps an array in the standard pagination envelope. */
export async function respondList<T>(
  items: T[],
  query: ListQuery = {},
  min?: number,
  max?: number,
): Promise<Paginated<T>> {
  await latency(min, max)
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.max(1, query.pageSize ?? 50)
  const start = (page - 1) * pageSize
  return {
    data: detach(items.slice(start, start + pageSize)),
    meta: {
      page,
      pageSize,
      total: items.length,
      totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    },
  }
}

/** Case-insensitive match of a free-text query across the given fields. */
export function matchesQuery(query: string | undefined, ...fields: (string | null | undefined)[]) {
  if (!query || !query.trim()) return true
  const needle = query.trim().toLowerCase()
  return fields.some((field) => (field ?? '').toLowerCase().includes(needle))
}

/** Newest-first sort helper for ISO timestamp fields. */
export function byNewest<T>(pick: (item: T) => string) {
  return (a: T, b: T) => Date.parse(pick(b)) - Date.parse(pick(a))
}
