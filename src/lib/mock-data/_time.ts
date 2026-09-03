/**
 * Every seeded timestamp is expressed relative to app-load time so the demo
 * always looks freshly active, no matter when it is run.
 */

const BOOT = Date.now()

/** ISO timestamp `days` days (and optionally `hours`/`minutes`) before app load. */
export function ago(days: number, hours = 0, minutes = 0): string {
  const ms = BOOT - ((days * 24 + hours) * 60 + minutes) * 60_000
  return new Date(ms).toISOString()
}

/** ISO timestamp `days` days after app load — used for policy expiry dates. */
export function ahead(days: number): string {
  return new Date(BOOT + days * 24 * 60 * 60_000).toISOString()
}

export function now(): string {
  return new Date().toISOString()
}
