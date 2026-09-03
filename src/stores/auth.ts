import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Role, User } from '@/lib/types'
import * as authApi from '@/lib/api/auth'
import type { Session } from '@/lib/api/auth'

/**
 * Mock session state. `role` drives both the route guards and the shell, so the
 * three experiences stay cleanly separated even though they share components.
 */
export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(authApi.peekSession())
  const signingIn = ref(false)
  const error = ref<string | null>(null)

  const user = computed<User | null>(() => session.value?.user ?? null)
  const role = computed<Role | null>(() => session.value?.user.role ?? null)
  const isAuthenticated = computed(() => session.value !== null)
  const suiAddress = computed(() => session.value?.zkLogin.suiAddress ?? null)

  /** The org id every API call is scoped by — a stand-in for the bearer token subject. */
  const orgId = computed(() => session.value?.user.orgId ?? null)
  const patientId = computed(() => session.value?.user.patientId ?? null)

  /** "Hospital" vs "TPA" copy, without forking the whole role. */
  const orgLabel = computed(() => (session.value?.user.orgType === 'tpa' ? 'TPA' : 'Hospital'))

  async function signIn(nextRole: Role): Promise<Role> {
    signingIn.value = true
    error.value = null
    try {
      session.value = await authApi.login(nextRole)
      return nextRole
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Sign-in failed.'
      throw e
    } finally {
      signingIn.value = false
    }
  }

  /** Dev-only role switch so reviewers can walk all three roles in one session. */
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
    signIn,
    switchRole,
    signOut,
  }
})
