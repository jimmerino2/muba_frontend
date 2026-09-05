import type { Role, User } from '@/lib/types'
import { findUserByRole } from '@/lib/mock-data/users'
import { ApiError, respond } from '../client'

/**
 * Mirrors:
 *   POST /api/auth/login
 *   POST /api/auth/logout
 *   POST /api/auth/refresh
 *   GET  /api/auth/me
 *
 * zkLogin is mocked end to end: "Sign in with Google" resolves straight to a
 * seeded session rather than running a real OAuth round trip.
 */

const SESSION_KEY = 'wayfare.session'

export interface Session {
  user: User
  token: string
  expiresAt: string
  /** Mirrors the zkLogin ephemeral identity the real flow would produce. */
  zkLogin: {
    provider: 'google'
    subjectHash: string
    suiAddress: string
    ephemeralKeyExpiryEpoch: number
  }
}

const ADDRESSES: Record<Role, string> = {
  patient: '0x7a2f9c81b04e6d35a19f80c2e4b7d6a538f1029c4e8b7a06d3f95c1e284b7d60',
  hospital: '0xb14e83c9d720a6f5183e94c02d7b6a41f508c39e2b71d06a4f83c5e9107b2d84',
  insurance: '0x3f81b6d2c47e905a1b8d3f602c9e47a5b1d08f36c2a94e7b0d5f81a3c6e29b04',
  tpa: '0xd905f2ec96c1a7803d8e6e5f42a37b0c9d4e5f01a2b3c4d5e6f708192a3b4c50',
}

function mintSession(role: Role): Session {
  // Mock mode has no real zkLogin behind it at all — every session here is
  // inherently a demo one, so the role switcher stays freely usable.
  const user: User = { ...findUserByRole(role), isDemo: true }
  return {
    user,
    token: `mock.jwt.${role}.${Date.now().toString(36)}`,
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    zkLogin: {
      provider: 'google',
      subjectHash: `zk_${role}_${btoa(user.email).replace(/=+$/, '').slice(0, 18)}`,
      suiAddress: ADDRESSES[role],
      ephemeralKeyExpiryEpoch: 744,
    },
  }
}

function persist(session: Session | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* Private-mode browsers simply lose session persistence; sign-in still works. */
  }
}

function readPersisted(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    if (!parsed?.user?.role) return null
    return parsed
  } catch {
    return null
  }
}

/** POST /api/auth/login — the mocked zkLogin (Google) exchange. */
export async function login(role: Role): Promise<Session> {
  const session = mintSession(role)
  persist(session)
  // Slightly longer than a data read: the real flow performs an OAuth round trip.
  return respond(session, 500, 900)
}

/** POST /api/auth/logout */
export async function logout(): Promise<{ success: true }> {
  persist(null)
  return respond({ success: true } as const, 100, 200)
}

/** POST /api/auth/refresh */
export async function refresh(): Promise<Session> {
  const current = readPersisted()
  if (!current) throw new ApiError(401, 'No active session to refresh.', 'UNAUTHENTICATED')
  const next = mintSession(current.user.role)
  persist(next)
  return respond(next, 120, 250)
}

/** GET /api/auth/me */
export async function me(): Promise<Session> {
  const current = readPersisted()
  if (!current) throw new ApiError(401, 'Not authenticated.', 'UNAUTHENTICATED')
  return respond(current, 120, 260)
}

/** Synchronous read used during router setup, before any await is possible. */
export function peekSession(): Session | null {
  return readPersisted()
}

/**
 * Dev-only role switch. Reviewers can walk all three experiences without three
 * Google accounts — the real build would gate this behind an env flag.
 */
export async function switchRole(role: Role): Promise<Session> {
  const session = mintSession(role)
  persist(session)
  return respond(session, 200, 380)
}
