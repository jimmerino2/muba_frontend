import { API_MODE } from './http'
import * as live from './live/auth'
import * as mock from './mock/auth'
import { ApiError } from './client'

/**
 * Sign-in — the dispatch point between the live backend and the mock layer.
 *
 * **zkLogin is the default.** `signInWithZkLogin()` is the real path: a Google
 * identity goes to `POST /api/identity/login`, the backend verifies it, derives
 * the user's salt and hence their Sui address, and returns a session. There is
 * no password anywhere in this architecture, so there is no forgot-password
 * flow — recovery is signing in with the same Google account again.
 *
 * `login(role)` and `switchRole(role)` are the *demo* paths, kept so reviewers
 * can walk all three roles without three Google accounts. They resolve to the
 * backend's seeded accounts via its dev-login route, which it gates behind
 * `ENABLE_DEV_LOGIN` and must never expose in a real deployment.
 */
const impl = API_MODE === 'mock' ? (mock as unknown as typeof live) : live

export type { Session } from './live/auth'
export type { DemoAccount } from './live/auth'

export const { login, logout, refresh, me, peekSession, switchRole } = impl

/** The default sign-in path. See the module note. */
export const signInWithZkLogin: typeof live.signInWithZkLogin =
  API_MODE === 'mock'
    ? async () => {
        throw new ApiError(
          0,
          'zkLogin needs the live backend. Unset VITE_API_MODE=mock, or continue with a demo account.',
          'ZKLOGIN_NOT_AVAILABLE',
        )
      }
    : live.signInWithZkLogin

/** Whether a Google OAuth client id is configured, so the login screen can
 * explain an unavailable zkLogin button rather than offer one that fails. */
export const isZkLoginConfigured: typeof live.isZkLoginConfigured =
  API_MODE === 'mock' ? () => false : live.isZkLoginConfigured

/** The seeded demo accounts, or an empty list when dev-login is disabled. */
export const listDemoAccounts: typeof live.listDemoAccounts =
  API_MODE === 'mock' ? async () => [] : live.listDemoAccounts

export const signInAsDemoAccount: typeof live.signInAsDemoAccount =
  API_MODE === 'mock'
    ? async (email: string) => {
        // The mock layer has no accounts, only roles — map the seeded demo
        // addresses onto the role each one stands for.
        const role = email.includes('hospital')
          ? 'hospital'
          : email.includes('insurance')
            ? 'insurance'
            : email.includes('tpa')
              ? 'tpa'
              : 'patient'
        return mock.login(role) as unknown as live.Session
      }
    : live.signInAsDemoAccount
