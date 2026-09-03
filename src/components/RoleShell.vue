<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import type { Role } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'
import { HOME_FOR } from '@/router'
import { useAsync } from '@/lib/useAsync'
import * as blockchainApi from '@/lib/api/blockchain'
import { truncateId } from '@/lib/format'
import CopyChip from '@/components/ui/CopyChip.vue'

/** Sidebar + header chrome, parameterised by role. All three roles share it. */
const props = defineProps<{ role: Role }>()

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const routeLabel = computed(() => (route.meta.title as string | undefined) ?? 'WayFare')

/**
 * Active-nav test. `RouterLink`'s own active-class cannot be used here: it would
 * compete with the inactive colour utilities at equal CSS specificity, so the
 * winner would depend on stylesheet order rather than the current route.
 */
const isActive = (to: string) => route.path === to || route.path.startsWith(`${to}/`)

interface NavItem {
  to: string
  label: string
  glyph: string
  hint: string
}

const NAV: Record<Role, NavItem[]> = {
  patient: [
    { to: '/patient/dashboard', label: 'Dashboard', glyph: '◈', hint: 'Cover, claims and payments at a glance' },
    { to: '/patient/records', label: 'Records', glyph: '⛁', hint: 'Medical records your providers have filed' },
    { to: '/patient/claims', label: 'Claims', glyph: '◇', hint: 'Every claim raised against your policy' },
    { to: '/patient/payments', label: 'Payments', glyph: '⇄', hint: 'Settlements made to your providers' },
  ],
  hospital: [
    { to: '/hospital/dashboard', label: 'Dashboard', glyph: '◈', hint: 'Claim and payment position' },
    { to: '/hospital/patients', label: 'Patients', glyph: '☰', hint: 'Patients treated at this provider' },
    { to: '/hospital/records', label: 'Records', glyph: '⛁', hint: 'Author and manage medical records' },
    { to: '/hospital/claims', label: 'Claims', glyph: '◇', hint: 'Claims raised from your records' },
    { to: '/hospital/payments', label: 'Payments', glyph: '⇄', hint: 'Payouts due and received' },
  ],
  insurance: [
    { to: '/insurance/dashboard', label: 'Dashboard', glyph: '◈', hint: 'Queue and exposure overview' },
    { to: '/insurance/claims', label: 'Claims', glyph: '◇', hint: 'Every claim against your policies' },
    { to: '/insurance/review', label: 'Review queue', glyph: '⚖', hint: 'Claims needing a human decision' },
    { to: '/insurance/policies', label: 'Policies', glyph: '⛨', hint: 'Cover, limits and thresholds' },
    { to: '/insurance/payments', label: 'Payments', glyph: '⇄', hint: 'Settlements you have triggered' },
  ],
}

const nav = computed(() => NAV[props.role])

const ROLE_TITLE = computed(() => {
  if (props.role === 'patient') return 'Patient'
  if (props.role === 'insurance') return 'Insurer'
  return auth.orgLabel // "Hospital" or "TPA", from the mock user's orgType
})

const contextLine = computed(() =>
  auth.user?.orgName ? auth.user.orgName : 'Personal cover',
)

const { data: chain } = useAsync(() => blockchainApi.getStatus())

const mobileNavOpen = ref(false)
const switching = ref(false)

async function switchTo(role: Role) {
  if (role === props.role) return
  switching.value = true
  try {
    await auth.switchRole(role)
    await router.push(HOME_FOR[role])
  } finally {
    switching.value = false
  }
}

async function signOut() {
  await auth.signOut()
  await router.push('/login')
}

const ROLES: { key: Role; label: string }[] = [
  { key: 'patient', label: 'Patient' },
  { key: 'hospital', label: 'Hospital / TPA' },
  { key: 'insurance', label: 'Insurer' },
]
</script>

<template>
  <div class="flex h-full">
    <!-- ------------------------------------------------------------ sidebar -->
    <aside
      class="fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-950/80
             backdrop-blur-md transition-transform lg:static lg:translate-x-0"
      :class="mobileNavOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="flex items-center gap-2.5 px-5 py-5">
        <span
          class="grid h-8 w-8 place-items-center rounded-lg bg-gonka-500 text-base font-bold text-ink-950"
          aria-hidden="true"
        >W</span>
        <div class="min-w-0">
          <p class="text-sm font-semibold leading-tight tracking-tight text-mist-100">WayFare</p>
          <p class="truncate text-2xs leading-tight text-mist-500">Claims coordination layer</p>
        </div>
      </div>

      <!-- Which role am I, and for which organisation -->
      <div class="mx-3 mb-3 rounded-lg border border-ink-800 bg-ink-900/60 px-3 py-2.5">
        <p class="label">{{ ROLE_TITLE }}</p>
        <p class="mt-0.5 truncate text-xs font-medium text-mist-200" :title="contextLine">
          {{ contextLine }}
        </p>
      </div>

      <nav class="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Primary">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
          :class="
            isActive(item.to)
              ? 'bg-ink-800 text-mist-100'
              : 'text-mist-400 hover:bg-ink-850 hover:text-mist-200'
          "
          :aria-current="isActive(item.to) ? 'page' : undefined"
          :title="item.hint"
          @click="mobileNavOpen = false"
        >
          <span
            class="w-4 text-center transition-colors"
            :class="isActive(item.to) ? 'text-gonka-400' : 'text-mist-500 group-hover:text-gonka-400'"
            aria-hidden="true"
          >
            {{ item.glyph }}
          </span>
          {{ item.label }}
        </RouterLink>
      </nav>

      <!-- Chain status: honest about being testnet -->
      <div class="mx-3 mb-3 rounded-lg border border-ink-800 bg-ink-900/60 px-3 py-2.5">
        <div class="flex items-center justify-between gap-2">
          <p class="label">Sui testnet</p>
          <span class="flex items-center gap-1.5 text-2xs text-mist-400">
            <span
              class="h-1.5 w-1.5 rounded-full"
              :class="chain?.online ? 'bg-emerald-400' : 'bg-mist-500'"
              aria-hidden="true"
            />
            {{ chain?.online ? 'Connected' : 'Checking…' }}
          </span>
        </div>
        <dl class="mt-2 space-y-1 text-2xs">
          <div class="flex items-center justify-between gap-2">
            <dt class="text-mist-500">Epoch</dt>
            <dd class="tnum font-mono text-mist-300">{{ chain?.epoch ?? '—' }}</dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-mist-500">Sponsor</dt>
            <dd class="font-mono text-mist-300">
              {{ chain ? truncateId(chain.sponsorAddress, 6, 4) : '—' }}
            </dd>
          </div>
        </dl>
      </div>

      <!-- Dev-only role switcher, so reviewers can walk all three experiences -->
      <div class="border-t border-ink-800 px-3 py-3">
        <p class="label mb-2 px-1">Demo · view as</p>
        <div class="grid grid-cols-1 gap-1">
          <button
            v-for="option in ROLES"
            :key="option.key"
            type="button"
            class="rounded-md px-2.5 py-1.5 text-left text-xs transition-colors disabled:opacity-50"
            :class="
              option.key === role
                ? 'bg-gonka-500/12 text-gonka-400 ring-1 ring-inset ring-gonka-600/40'
                : 'text-mist-400 hover:bg-ink-850 hover:text-mist-200'
            "
            :disabled="switching"
            @click="switchTo(option.key)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
    </aside>

    <div
      v-if="mobileNavOpen"
      class="fixed inset-0 z-30 bg-ink-950/70 lg:hidden"
      @click="mobileNavOpen = false"
    />

    <!-- --------------------------------------------------------------- main -->
    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="sticky top-0 z-20 flex items-center gap-3 border-b border-ink-800 bg-ink-900/85 px-4 py-3
               backdrop-blur-md sm:px-6"
      >
        <button
          type="button"
          class="btn-ghost px-2 py-1.5 lg:hidden"
          aria-label="Open navigation"
          @click="mobileNavOpen = true"
        >
          ☰
        </button>

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-mist-200">{{ routeLabel }}</p>
          <p class="truncate text-2xs text-mist-500">{{ ROLE_TITLE }} · {{ contextLine }}</p>
        </div>

        <div class="flex items-center gap-3">
          <CopyChip
            v-if="auth.suiAddress"
            :value="auth.suiAddress"
            label="zkLogin"
            truncate
            class="hidden md:inline-flex"
          />

          <div class="flex items-center gap-2.5">
            <span
              class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-750 text-xs font-semibold text-mist-200"
              aria-hidden="true"
            >
              {{ auth.user?.avatarInitials }}
            </span>
            <div class="hidden min-w-0 sm:block">
              <p class="truncate text-xs font-medium leading-tight text-mist-200">
                {{ auth.user?.name }}
              </p>
              <button
                type="button"
                class="text-2xs leading-tight text-mist-500 transition-colors hover:text-mist-300"
                @click="signOut"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main class="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <div class="mx-auto w-full max-w-[1200px]">
          <RouterView v-slot="{ Component, route }">
            <component :is="Component" :key="route.fullPath" />
          </RouterView>
        </div>
      </main>
    </div>
  </div>
</template>
