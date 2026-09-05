import type { Role, User } from '@/lib/types'
import { ApiError } from '../client'
import { http, setToken } from '../http'
import type { WireAccount, WireDevAccount, WireMe, WireSession } from '../wire'
import { cache, invalidatePayments } from './_resolve'

/**
 * Sign-in against the real backend.
 *
 *   POST /api/identity/login        — zkLogin (Google), the default and only
 *                                     production sign-in path
 *   POST /api/identity/dev-login    — seeded demo accounts, dev builds only
 *   GET  /api/identity/dev-accounts — what those demo accounts are
 *   GET  /api/identity/me           — session rehydration on reload
 *
 * **zkLogin is the default.** There is no password anywhere in this
 * architecture: a Google identity plus a server-held salt deterministically
 * derives the user's Sui address, so signing in and having a wallet are the
 * same act. Account recovery is just signing in with the same Google account
 * again — there is no forgot-password flow to build, and no seed phrase for a
 * patient to lose.
 *
 * The demo-account path exists so a reviewer can walk all three roles without
 * three Google accounts. The backend gates it behind `ENABLE_DEV_LOGIN` and
 * returns 404 when it is off, so this module treats its absence as normal.
 */

const SESSION_KEY = 'wayfare.session'
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

export interface Session {
  user: User
  token: string
  expiresAt: string
  zkLogin: {
    provider: 'google'
    subjectHash: string
    suiAddress: string
    ephemeralKeyExpiryEpoch: number
  }
}

/* ------------------------------------------------------------ persistence */

function persist(session: Session | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* Private-mode browsers simply lose session persistence; sign-in still works. */
  }
  setToken(session?.token ?? null)
  // A cached hospital name must never survive into an insurer's session.
  cache.reset()
  invalidatePayments()
}

function readPersisted(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    if (!parsed?.user?.role || !parsed.token) return null
    return parsed
  } catch {
    return null
  }
}

/* ---------------------------------------------------------------- mapping */

export function roleFor(actorType: WireSession['identity']['actorType']): Role {
  switch (actorType) {
    case 'USER':
      return 'patient'
    case 'HOSPITAL':
      return 'hospital'
    case 'INSURANCE':
      return 'insurance'
    case 'TPA':
      return 'tpa'
  }
}

/** `displayName` is `string | null` on the wire — null until a name is known
 * (a brand-new account whose Google profile carried none, or an org-invited
 * employee before their first login binds one). `User.name` itself is
 * non-nullable, so this is also what backfills it. */
function nameFor(account: Pick<WireAccount, 'displayName' | 'email'>): string {
  if (account.displayName) return account.displayName
  if (account.email) return account.email.split('@')[0]!
  return 'RICE user'
}

function initialsFor(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

async function toSession(wire: WireSession, isDemo = false): Promise<Session> {
  const role = roleFor(wire.identity.actorType)

  // The org's *name* isn't on the login response — only its id — so it is
  // fetched once here rather than left blank in the shell's header. Uses the
  // token we just received, since nothing is persisted yet.
  let orgName: string | undefined
  if (wire.identity.organizationId) {
    try {
      const me = await http<WireMe>('/api/identity/me', { token: wire.token })
      orgName = me?.organization?.name
    } catch {
      /* A failed name lookup must not block an otherwise successful sign-in. */
    }
  }

  const user: User = {
    id: wire.account.id,
    name: nameFor(wire.account),
    email: wire.account.email ?? '',
    role,
    avatarInitials: initialsFor(wire.account.displayName),
    isDemo,
    ...(role === 'patient' ? { patientId: wire.account.id } : {}),
    ...(wire.identity.organizationId
      ? {
          orgId: wire.identity.organizationId,
          orgName: orgName ?? 'Your organisation',
          jobTitle: wire.identity.employeeRole === 'ADMIN' ? 'Administrator' : 'Officer',
        }
      : {}),
  }

  return {
    user,
    token: wire.token,
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    zkLogin: {
      provider: 'google',
      // Derived from the account id rather than the real Google `sub`: the
      // subject itself is a stable personal identifier and has no business
      // being in localStorage or on screen.
      subjectHash: `zk_${wire.account.id.slice(0, 12)}`,
      suiAddress: wire.identity.suiWalletAddress ?? '',
      ephemeralKeyExpiryEpoch: 0,
    },
  }
}

/* --------------------------------------------------------- zkLogin (Google) */

let googleScriptPromise: Promise<void> | null = null

/** Loads Google Identity Services once, on demand — no third-party script on
 * every page load, only when someone actually reaches for sign-in. */
function loadGoogleIdentityServices(): Promise<void> {
  if (googleScriptPromise) return googleScriptPromise

  googleScriptPromise = new Promise<void>((resolve, reject) => {
    if ((window as any).google?.accounts?.id) return resolve()

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () =>
      reject(
        new ApiError(
          0,
          'Could not load Google Identity Services. Check the network connection and any content blocker.',
          'GOOGLE_SCRIPT_UNAVAILABLE',
        ),
      )
    document.head.appendChild(script)
  })

  return googleScriptPromise
}

/** True when a Google OAuth client id is configured. The login screen uses this
 * to explain *why* the zkLogin button is unavailable, rather than showing a
 * button that fails when pressed. */
export function isZkLoginConfigured(): boolean {
  return Boolean(GOOGLE_CLIENT_ID)
}

/**
 * Prompts for a Google account and returns the resulting ID token.
 *
 * Uses GIS's `prompt()` rather than a rendered button so the app keeps its own
 * button styling. The credential that comes back is the Google ID token — the
 * exact JWT the backend's zkLogin flow verifies and derives a salt (and hence a
 * Sui address) from.
 */
function requestGoogleIdToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const google = (window as any).google?.accounts?.id
    if (!google) {
      return reject(new ApiError(0, 'Google Identity Services did not initialise.', 'GOOGLE_SCRIPT_UNAVAILABLE'))
    }

    let settled = false

    google.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response: { credential?: string }) => {
        if (settled) return
        settled = true
        if (response?.credential) resolve(response.credential)
        else reject(new ApiError(401, 'Google did not return an identity token.', 'UNAUTHENTICATED'))
      },
      // The backend derives the Sui address from the JWT; nothing about the
      // session depends on Google's own cookie state persisting.
      auto_select: false,
      cancel_on_tap_outside: true,
    })

    google.prompt((notification: { isNotDisplayed?: () => boolean; isSkippedMoment?: () => boolean }) => {
      if (settled) return
      // One Tap is suppressed in plenty of ordinary situations (an incognito
      // window, a previously dismissed prompt, a browser blocking third-party
      // cookies). Saying so beats an indefinite spinner.
      if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
        settled = true
        reject(
          new ApiError(
            0,
            'Google sign-in was dismissed or blocked by the browser. Allow third-party cookies for accounts.google.com, or use a demo account below.',
            'GOOGLE_PROMPT_DISMISSED',
          ),
        )
      }
    })
  })
}

/**
 * The default sign-in path: Google identity in, WayFare session (and a derived
 * Sui address) out.
 *
 * The role is not chosen here — it comes back from the backend, which resolves
 * the identity to an existing account, binds a pending employee invite, or
 * creates a new `USER`. A patient signing in for the first time simply becomes
 * a patient; joining an organisation happens through that organisation's
 * invite, never by picking a role on a login screen.
 */
export async function signInWithZkLogin(): Promise<Session> {
  if (!GOOGLE_CLIENT_ID) {
    throw new ApiError(
      0,
      'zkLogin is not configured: set VITE_GOOGLE_CLIENT_ID to the same Google OAuth client id the backend uses.',
      'ZKLOGIN_NOT_CONFIGURED',
    )
  }

  await loadGoogleIdentityServices()
  const jwt = await requestGoogleIdToken()

  const wire = await http<WireSession>('/api/identity/login', {
    method: 'POST',
    body: { jwt },
    auth: false,
  })

  const session = await toSession(wire, false)
  persist(session)
  return session
}

/* ---------------------------------------------------------- demo accounts */

export interface DemoAccount {
  email: string
  displayName: string
  role: Role
  employeeRole: 'ADMIN' | 'EMPLOYEE' | null
}

/**
 * The seeded accounts, if the backend has dev-login enabled. Returns an empty
 * list when it doesn't — a 404 there is the documented "this route does not
 * exist" answer, not a failure worth surfacing.
 */
export async function listDemoAccounts(): Promise<DemoAccount[]> {
  try {
    const accounts = await http<WireDevAccount[]>('/api/identity/dev-accounts')
    return (accounts ?? [])
      .filter((a): a is WireDevAccount & { email: string } => Boolean(a.email) && a.status === 'ACTIVE')
      .map((a) => ({
        email: a.email,
        displayName: a.displayName,
        role: roleFor(a.actorType),
        employeeRole: a.employeeRole,
      }))
  } catch {
    return []
  }
}

/** Signs in as a seeded demo account. Dev builds only — see the module note. */
export async function signInAsDemoAccount(email: string): Promise<Session> {
  const wire = await http<WireSession>('/api/identity/dev-login', {
    method: 'POST',
    body: { email },
    auth: false,
  })
  const session = await toSession(wire, true)
  persist(session)
  return session
}

/* ---------------------------------------------------------------- session */

export async function logout(): Promise<{ success: true }> {
  // Sessions are stateless bearer tokens with no server-side revocation
  // endpoint, so signing out is genuinely a client-side discard. Said plainly
  // rather than faking a round trip.
  persist(null)
  return { success: true }
}

/** `GET /api/identity/me` — re-reads the account so a role or status change
 * made by an org admin takes effect on the next page load, not on token
 * expiry. */
export async function me(): Promise<Session> {
  const current = readPersisted()
  if (!current) throw new ApiError(401, 'Not authenticated.', 'UNAUTHENTICATED')

  const fresh = await http<WireMe>('/api/identity/me')
  if (!fresh?.account) throw new ApiError(401, 'Session is no longer valid.', 'UNAUTHENTICATED')

  const refreshed: Session = {
    ...current,
    user: {
      ...current.user,
      name: nameFor(fresh.account),
      email: fresh.account.email ?? current.user.email,
      avatarInitials: initialsFor(fresh.account.displayName),
      role: roleFor(fresh.account.actorType),
      ...(fresh.organization ? { orgId: fresh.organization.id, orgName: fresh.organization.name } : {}),
    },
    zkLogin: {
      ...current.zkLogin,
      suiAddress: fresh.effectiveWalletAddress ?? current.zkLogin.suiAddress,
    },
  }
  persist(refreshed)
  return refreshed
}

export async function refresh(): Promise<Session> {
  return me()
}

/** Synchronous read used during router setup, before any await is possible. */
export function peekSession(): Session | null {
  const session = readPersisted()
  // Rehydrate the transport's token on a cold page load, before any request
  // is made — otherwise the first fetch after a refresh goes out unauthenticated.
  setToken(session?.token ?? null)
  return session
}

/**
 * The role-based sign-in the login screen has always called.
 *
 * Kept so nothing upstream had to change, but it is now a *demo* path, not the
 * default one: it picks the first seeded account for the requested role and
 * signs in as it. It fails loudly when dev-login is off, which is correct — in
 * a real deployment the only way in is zkLogin.
 */
export async function login(role: Role): Promise<Session> {
  const accounts = await listDemoAccounts()
  const match = accounts.find((a) => a.role === role && a.employeeRole !== 'EMPLOYEE') ?? accounts.find((a) => a.role === role)

  if (!match) {
    throw new ApiError(
      404,
      `No demo account is available for the ${role} role. Sign in with Google (zkLogin) instead, or run "npm run seed" in the backend.`,
      'RESOURCE_NOT_FOUND',
    )
  }
  return signInAsDemoAccount(match.email)
}

/** Dev-only role switch, so reviewers can walk all three experiences. */
export async function switchRole(role: Role): Promise<Session> {
  return login(role)
}
