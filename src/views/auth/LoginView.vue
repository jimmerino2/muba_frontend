<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Role } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'
import { HOME_FOR } from '@/router'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const selected = ref<Role>('patient')

const ROLES: { key: Role; label: string; who: string; blurb: string }[] = [
  {
    key: 'patient',
    label: 'Patient',
    who: 'Nurul Aisyah binti Rahman',
    blurb: 'See your cover, your records, and exactly why each claim was decided the way it was.',
  },
  {
    key: 'hospital',
    label: 'Hospital / TPA',
    who: 'Dr. Farah Iskandar · Gleneagles KL',
    blurb: 'Author records, raise claims against them, and watch verification resolve live.',
  },
  {
    key: 'insurance',
    label: 'Insurer',
    who: 'Adrian Yeoh · Great Eastern Takaful',
    blurb: 'Work the review queue with the Truth Score and its reasoning in front of you.',
  },
]

async function signIn() {
  const role = await auth.signIn(selected.value)
  const redirect = route.query.redirect as string | undefined
  await router.push(redirect ?? HOME_FOR[role])
}
</script>

<template>
  <div class="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
    <!-- ---------------------------------------------------------- narrative -->
    <section class="relative hidden flex-col justify-between overflow-hidden px-12 py-14 lg:flex">
      <div
        class="pointer-events-none absolute inset-0 opacity-[0.55]"
        style="
          background:
            radial-gradient(700px 420px at 20% 10%, rgba(34, 201, 166, 0.16), transparent 62%),
            radial-gradient(600px 400px at 78% 78%, rgba(124, 138, 255, 0.14), transparent 60%);
        "
        aria-hidden="true"
      />

      <div class="relative flex items-center gap-3">
        <span
          class="grid h-9 w-9 place-items-center rounded-lg bg-gonka-500 text-lg font-bold text-ink-950"
          aria-hidden="true"
        >W</span>
        <div>
          <p class="text-sm font-semibold tracking-tight text-mist-100">WayFare</p>
          <p class="text-2xs text-mist-500">Claims coordination layer</p>
        </div>
      </div>

      <div class="relative max-w-lg">
        <h1 class="text-[2.6rem] font-semibold leading-[1.1] tracking-tight text-mist-100">
          A medical claim should never be a
          <span class="text-gonka-400">black box</span>.
        </h1>
        <p class="mt-5 text-base leading-relaxed text-mist-400">
          WayFare puts the patient, the hospital and the insurer on one shared lifecycle. Every
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
          <span
            class="grid h-9 w-9 place-items-center rounded-lg bg-gonka-500 text-lg font-bold text-ink-950"
            aria-hidden="true"
          >W</span>
          <div>
            <p class="text-sm font-semibold tracking-tight text-mist-100">WayFare</p>
            <p class="text-2xs text-mist-500">Claims coordination layer</p>
          </div>
        </div>

        <h2 class="text-xl font-semibold tracking-tight text-mist-100">Sign in</h2>
        <p class="mt-1.5 text-sm leading-relaxed text-mist-500">
          zkLogin uses your Google identity to derive a Sui address — no seed phrase, no wallet
          install.
        </p>

        <fieldset class="mt-7">
          <legend class="label mb-3">Continue as</legend>
          <div class="space-y-2">
            <label
              v-for="role in ROLES"
              :key="role.key"
              class="flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors"
              :class="
                selected === role.key
                  ? 'border-gonka-600/50 bg-gonka-500/[0.07]'
                  : 'border-ink-700 hover:border-ink-600 hover:bg-ink-850/60'
              "
            >
              <input
                v-model="selected"
                type="radio"
                name="role"
                :value="role.key"
                class="mt-1 h-3.5 w-3.5 shrink-0 accent-[#22C9A6]"
              />
              <div class="min-w-0">
                <p class="text-sm font-medium text-mist-100">{{ role.label }}</p>
                <p class="mt-0.5 text-xs text-mist-400">{{ role.who }}</p>
                <p class="mt-1 text-xs leading-relaxed text-mist-500">{{ role.blurb }}</p>
              </div>
            </label>
          </div>
        </fieldset>

        <button
          type="button"
          class="btn mt-6 w-full gap-3 border border-ink-600 bg-mist-100 py-2.5 text-ink-950 hover:bg-white"
          :disabled="auth.signingIn"
          @click="signIn"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/>
            <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51Z"/>
          </svg>
          {{ auth.signingIn ? 'Deriving zkLogin address…' : 'Sign in with Google' }}
        </button>

        <p v-if="auth.error" class="mt-3 text-sm text-rose-300">{{ auth.error }}</p>

        <p class="mt-4 text-2xs leading-relaxed text-mist-500">
          Prototype build — zkLogin, the Gonka Router and Sui settlement are all mocked. No real
          Google account is contacted, and no real funds move. You can switch roles at any time from
          the sidebar.
        </p>
      </div>
    </section>
  </div>
</template>
