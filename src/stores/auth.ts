import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Role, User } from '@/lib/types'
import * as authApi from '@/lib/api/auth'
import type { DemoAccount, Session } from '@/lib/api/auth'

/**
 * Session state. `role` drives both the route guards and the shell, so the
 * three experiences stay cleanly separated even though they share components.
 *
 * The role is no longer *chosen* at sign-in — it comes back from the backend,
 * which resolves the zkLogin identity to an existing account, binds a pending
 * employee invite, or creates a new patient. Picking a role on a login form was
 * a property of the mock build; joining an organisation happens through that
 * organisation's invite.
 */
export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(authApi.peekSession())
  const signingIn = ref(false)
  const error = ref<string | null>(null)
  const demoAccounts = ref<DemoAccount[]>([])

  const user = computed<User | null>(() => session.value?.user ?? null)
  const role = computed<Role | null>(() => session.value?.user.role ?? null)
  const isAuthenticated = computed(() => session.value !== null)
  const suiAddress = computed(() => session.value?.zkLogin.suiAddress ?? null)

  /** The org id list views scope by. The backend scopes server-side from the
   * bearer token regardless — this is for client-side filtering and display. */
  const orgId = computed(() => session.value?.user.orgId ?? null)
  const patientId = computed(() => session.value?.user.patientId ?? null)

  /** "Hospital" vs "TPA" copy, without forking the whole role. */
  const orgLabel = computed(() => (session.value?.user.orgType === 'tpa' ? 'TPA' : 'Hospital'))

  /** Whether the zkLogin button can work at all — a missing Google client id is
   * a configuration gap worth naming, not a button that fails when pressed. */
  const zkLoginAvailable = computed(() => authApi.isZkLoginConfigured())

  async function withSignIn<T extends Session>(run: () => Promise<T>): Promise<Role> {
    signingIn.value = true
    error.value = null
    try {
      session.value = await run()
      return session.value.user.role
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Sign-in failed.'
      throw e
    } finally {
      signingIn.value = false
    }
  }

  /** The default path: Google identity in, WayFare session and derived Sui
   * address out. */
  async function signInWithZkLogin(): Promise<Role> {
    return withSignIn(() => authApi.signInWithZkLogin())
  }

  /** Demo path — signs in as one of the backend's seeded accounts. */
  async function signInAsDemoAccount(email: string): Promise<Role> {
    return withSignIn(() => authApi.signInAsDemoAccount(email))
  }

  /** Demo path, by role rather than by account. Kept for the role-switcher. */
  async function signIn(nextRole: Role): Promise<Role> {
    return withSignIn(() => authApi.login(nextRole))
  }

  /** Loads the seeded accounts the backend will accept, if it has any. Silent
   * on failure: no demo accounts is a normal state, not an error. */
  async function loadDemoAccounts(): Promise<void> {
    demoAccounts.value = await authApi.listDemoAccounts()
  }

  async function switchRole(nextRole: Role): Promise<Role> {
    session.value = await authApi.switchRole(nextRole)
    return nextRole
  }

  async function signOut(): Promise<void> {
    await authApi.logout()
    session.value = null
  }

  return {
    session,
    user,
    role,
    orgId,
    patientId,
    orgLabel,
    suiAddress,
    isAuthenticated,
    signingIn,
    error,
    demoAccounts,
    zkLoginAvailable,
    signIn,
    signInWithZkLogin,
    signInAsDemoAccount,
    loadDemoAccounts,
    switchRole,
    signOut,
  }
})
