<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Role } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'
import { HOME_FOR } from '@/router'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'

/**
 * zkLogin is the sign-in method, not one of several.
 *
 * A Google identity plus a server-held salt deterministically derives the
 * user's Sui address, so signing in and having a wallet are one act — no seed
 * phrase, no wallet install, and no password to reset. The demo accounts below
 * exist only so a reviewer can walk all three roles without three Google
 * accounts; the backend gates them behind ENABLE_DEV_LOGIN and they disappear
 * from this screen entirely when it is off.
 *
 * Note that no role is chosen here any more. The backend resolves the identity
 * to an existing account, binds a pending employee invite, or creates a new
 * patient — joining a hospital or an insurer happens through that
 * organisation's invite, never by picking a role on a login form.
 */

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const showDemoAccounts = ref(false)

/** One entry per role, so the demo list reads as three experiences rather than
 * six near-identical seeded accounts. Admin accounts are preferred: they can
 * exercise everything an employee can, plus the org-management screens. */
const demoByRole = computed(() => {
  const order: Role[] = ['patient', 'hospital', 'insurance', 'tpa']
  return order
    .map((role) => {
      const forRole = auth.demoAccounts.filter((a) => a.role === role)
      return forRole.find((a) => a.employeeRole === 'ADMIN') ?? forRole[0] ?? null
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)
})

const ROLE_BLURBS: Record<Role, { label: string; blurb: string }> = {
  patient: {
    label: 'Patient',
    blurb: 'See your cover, your records, and exactly why each claim was decided the way it was.',
  },
  hospital: {
    label: 'Hospital',
    blurb: 'Author records, raise claims against them, and watch verification resolve live.',
  },
  insurance: {
    label: 'Insurer',
    blurb: 'Work the escalated queue — claims above the TPA’s delegated approval limit.',
  },
  tpa: {
    label: 'TPA',
    blurb: 'Validate claims on the insurer’s behalf and decide the ones within your delegated limit.',
  },
}

onMounted(() => {
  // Silent by design: no demo accounts is a normal state (dev-login off), not
  // an error worth putting in front of someone signing in.
  void auth.loadDemoAccounts()
})

async function goHome(role: Role) {
  const redirect = route.query.redirect as string | undefined
  await router.push(redirect ?? HOME_FOR[role])
}

async function signInWithGoogle() {
  try {
    await goHome(await auth.signInWithZkLogin())
  } catch {
    // The store already holds the message; the template renders it.
  }
}

async function signInAsDemo(email: string) {
  try {
    await goHome(await auth.signInAsDemoAccount(email))
  } catch {
    /* see above */
  }
}
</script>

<template>
  <div class="relative grid min-h-full lg:grid-cols-[1.05fr_1fr]">
    <ThemeToggle class="fixed right-4 top-4 z-10" />

    <!-- ---------------------------------------------------------- narrative -->
    <section class="relative hidden flex-col justify-between overflow-hidden px-12 py-14 lg:flex">
      <div
        class="pointer-events-none absolute inset-0 opacity-[0.55]"
        style="
          background:
            radial-gradient(700px 420px at 20% 10%, rgba(62, 124, 184, 0.18), transparent 62%),
            radial-gradient(600px 400px at 78% 78%, rgba(124, 138, 255, 0.14), transparent 60%);
        "
        aria-hidden="true"
      />

      <div class="relative flex items-center gap-3">
        <img src="@/assets/logo.png" alt="RICE" class="h-9 w-9 shrink-0 rounded-full object-cover" />
        <div>
          <p class="text-sm font-semibold tracking-tight text-mist-100">RICE</p>
          <p class="text-2xs text-mist-500">Reliable Insurance Claim Engine</p>
        </div>
      </div>

      <div class="relative max-w-lg">
        <h1 class="text-[2.6rem] font-semibold leading-[1.1] tracking-tight text-mist-100">
          A medical claim should never be a
          <span class="text-brand-400">black box</span>.
        </h1>
        <p class="mt-5 text-base leading-relaxed text-mist-400">
          RICE puts the patient, the hospital and the insurer on one shared lifecycle. Every
          claim carries a Gonka Truth Score, the reasoning behind it, and a traceable request ID —
          and every settlement leaves an auditable trail on Sui.
        </p>

        <ul class="mt-8 space-y-4">
          <li class="flex gap-3.5">
            <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gonka-500" aria-hidden="true" />
            <div>
              <p class="text-sm font-medium text-mist-200">The score is an input, not a verdict</p>
              <p class="mt-0.5 text-sm leading-relaxed text-mist-500">
                A low or high-value claim goes to a human, with the model's reasoning shown beside
                the policy rule that routed it there.
              </p>
            </div>
          </li>
          <li class="flex gap-3.5">
            <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sui-500" aria-hidden="true" />
            <div>
              <p class="text-sm font-medium text-mist-200">Settlement without a gas balance</p>
              <p class="mt-0.5 text-sm leading-relaxed text-mist-500">
                Payouts settle in USDC through sponsored Sui transactions — the payer signs, the
                sponsor pays the gas.
              </p>
            </div>
          </li>
          <li class="flex gap-3.5">
            <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-mist-400" aria-hidden="true" />
            <div>
              <p class="text-sm font-medium text-mist-200">One lifecycle, three vantage points</p>
              <p class="mt-0.5 text-sm leading-relaxed text-mist-500">
                The same claim, the same timeline — with each party seeing exactly what they should.
              </p>
            </div>
          </li>
        </ul>
      </div>

      <p class="relative text-2xs leading-relaxed text-mist-500">
        MUBA Hacks 2026 · Gonka (AI for Society) · Sui Track 01 (Payments &amp; Stablecoins) ·
        Sui Track 02 (AI × Sui)
      </p>
    </section>

    <!-- ------------------------------------------------------------- sign in -->
    <section class="flex items-center justify-center px-5 py-12 sm:px-10">
      <div class="w-full max-w-md">
        <div class="mb-8 flex items-center gap-3 lg:hidden">
          <img src="@/assets/logo.png" alt="RICE" class="h-9 w-9 shrink-0 rounded-full object-cover" />
          <div>
            <p class="text-sm font-semibold tracking-tight text-mist-100">RICE</p>
            <p class="text-2xs text-mist-500">Reliable Insurance Claim Engine</p>
          </div>
        </div>

        <h2 class="text-xl font-semibold tracking-tight text-mist-100">Sign in</h2>
        <p class="mt-1.5 text-sm leading-relaxed text-mist-500">
          zkLogin uses your Google identity to derive a Sui address — no seed phrase, no wallet
          install.
        </p>

        <!-- ------------------------------------------------- zkLogin (default) -->
        <button
          type="button"
          class="btn mt-7 w-full gap-3 border border-ink-600 bg-white py-2.5 text-ink-950 hover:bg-white/90 disabled:opacity-50"
          :disabled="auth.signingIn || !auth.zkLoginAvailable"
          @click="signInWithGoogle"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/>
            <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51Z"/>
          </svg>
          {{ auth.signingIn ? 'Deriving your zkLogin address…' : 'Continue with Google' }}
        </button>

        <p v-if="!auth.zkLoginAvailable" class="mt-2.5 text-2xs leading-relaxed text-amber-300/90">
          zkLogin is unavailable in this build: no Google OAuth client id is configured. Set
          <code class="font-mono">VITE_GOOGLE_CLIENT_ID</code> to the same client id the backend
          uses, or continue with a demo account below.
        </p>

        <p v-if="auth.error" class="mt-3 text-sm leading-relaxed text-rose-300">{{ auth.error }}</p>

        <p class="mt-3 text-2xs leading-relaxed text-mist-500">
          Your Sui address is derived from your Google identity and a salt held by RICE — there
          is no seed phrase to lose and no password to reset. Signing in again with the same Google
          account is the whole of account recovery.
        </p>

        <!-- --------------------------------------------------- demo accounts -->
        <div v-if="demoByRole.length" class="mt-7 border-t border-ink-800 pt-5">
          <button
            type="button"
            class="flex w-full items-center justify-between text-left"
            :aria-expanded="showDemoAccounts"
            @click="showDemoAccounts = !showDemoAccounts"
          >
            <span class="label">Or use a demo account</span>
            <span class="text-2xs text-mist-500">{{ showDemoAccounts ? 'Hide' : 'Show' }}</span>
          </button>

          <div v-if="showDemoAccounts" class="mt-3 space-y-2">
            <button
              v-for="account in demoByRole"
              :key="account.email"
              type="button"
              class="w-full rounded-xl border border-ink-700 p-3.5 text-left transition-colors hover:border-ink-600 hover:bg-ink-850/60 disabled:opacity-50"
              :disabled="auth.signingIn"
              @click="signInAsDemo(account.email)"
            >
              <p class="text-sm font-medium text-mist-100">{{ ROLE_BLURBS[account.role].label }}</p>
              <p class="mt-0.5 font-mono text-2xs text-mist-400">{{ account.email }}</p>
              <p class="mt-1 text-xs leading-relaxed text-mist-500">
                {{ ROLE_BLURBS[account.role].blurb }}
              </p>
            </button>

            <p class="pt-1 text-2xs leading-relaxed text-mist-500">
              Seeded accounts with no real Google identity behind them. The backend only accepts
              these while <code class="font-mono">ENABLE_DEV_LOGIN</code> is on, and must never
              expose them in a real deployment.
            </p>
          </div>
        </div>

        <p class="mt-6 text-2xs leading-relaxed text-mist-500">
          Testnet build — Sui settlement runs against testnet with sponsored gas, and the bank
          payout leg is simulated. No real funds move.
        </p>
      </div>
    </section>
  </div>
</template>
