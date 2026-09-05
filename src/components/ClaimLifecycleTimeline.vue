<script setup lang="ts">
import { computed } from 'vue'
import type { ClaimEvent, ClaimStatus } from '@/lib/types'
import { claimStatusLabel, dateTime, relative } from '@/lib/format'

/**
 * The single lifecycle timeline, shared by all three roles. Visibility is the only
 * thing that varies: internal assessor notes are filtered out by the API before
 * they ever reach a patient, and before a claim is finalised for a provider.
 */
const props = withDefaults(
  defineProps<{ events: ClaimEvent[]; currentStatus: ClaimStatus; dense?: boolean }>(),
  { dense: false },
)

/** The canonical path a claim walks. Branches are collapsed onto one spine. */
const STAGES: { key: string; label: string; matches: ClaimStatus[] }[] = [
  { key: 'created', label: 'Created', matches: ['created'] },
  { key: 'submitted', label: 'Submitted', matches: ['submitted'] },
  { key: 'verified', label: 'Verified', matches: ['verified'] },
  { key: 'routed', label: 'Routed', matches: ['auto_approved', 'pending_review'] },
  { key: 'decided', label: 'Decided', matches: ['approved', 'rejected'] },
  { key: 'paid', label: 'Paid', matches: ['paid'] },
  { key: 'closed', label: 'Closed', matches: ['closed'] },
]

const reached = computed(() => {
  const seen = new Set(props.events.map((e) => e.status))
  // auto_approved implies the approval decision even when no separate event exists.
  if (seen.has('auto_approved')) seen.add('approved')
  return STAGES.map((stage) => stage.matches.some((m) => seen.has(m)))
})

const currentStageIndex = computed(() =>
  STAGES.findIndex((stage) => stage.matches.includes(props.currentStatus)),
)

const terminated = computed(() => props.currentStatus === 'rejected')

const ACTOR_STYLE: Record<ClaimEvent['actorRole'], { dot: string; chip: string; name: string }> = {
  hospital: { dot: 'bg-sky-400', chip: 'text-sky-300', name: 'Provider' },
  insurance: { dot: 'bg-amber-400', chip: 'text-amber-300', name: 'Insurer' },
  tpa: { dot: 'bg-fuchsia-400', chip: 'text-fuchsia-300', name: 'TPA' },
  patient: { dot: 'bg-mist-300', chip: 'text-mist-300', name: 'Patient' },
  gonka: { dot: 'bg-gonka-500', chip: 'text-gonka-400', name: 'Gonka' },
  sui: { dot: 'bg-sui-500', chip: 'text-sui-400', name: 'Sui' },
  system: { dot: 'bg-mist-500', chip: 'text-mist-400', name: 'System' },
}

const ordered = computed(() =>
  [...props.events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)),
)
</script>

<template>
  <section class="surface" aria-labelledby="lifecycle-heading">
    <header class="flex items-center justify-between gap-3 border-b border-ink-700/70 px-5 py-3.5">
      <h2 id="lifecycle-heading" class="text-sm font-semibold tracking-tight text-mist-100">
        Claim lifecycle
      </h2>
      <span class="text-2xs uppercase tracking-[0.13em] text-mist-500">
        {{ ordered.length }} recorded event{{ ordered.length === 1 ? '' : 's' }}
      </span>
    </header>

    <!-- Progress spine: where this claim sits on the canonical path -->
    <div class="overflow-x-auto border-b border-ink-700/70 px-5 py-4">
      <ol class="flex min-w-[520px] items-center">
        <li v-for="(stage, i) in STAGES" :key="stage.key" class="flex flex-1 items-center last:flex-none">
          <div class="flex flex-col items-center gap-1.5">
            <span
              class="grid h-6 w-6 place-items-center rounded-full border text-2xs font-semibold transition-colors"
              :class="[
                terminated && i > currentStageIndex
                  ? 'border-ink-700 bg-ink-850 text-ink-600'
                  : reached[i]
                    ? i === currentStageIndex
                      ? 'border-brand-500 bg-brand-500 text-ink-950'
                      : 'border-brand-600/50 bg-brand-950 text-brand-400'
                    : 'border-ink-700 bg-ink-850 text-mist-500',
              ]"
            >
              {{ reached[i] ? '✓' : i + 1 }}
            </span>
            <span
              class="whitespace-nowrap text-2xs"
              :class="i === currentStageIndex ? 'font-medium text-mist-200' : 'text-mist-500'"
            >
              {{ stage.label }}
            </span>
          </div>
          <div
            v-if="i < STAGES.length - 1"
            class="mx-2 mb-5 h-px flex-1"
            :class="reached[i + 1] ? 'bg-brand-600/50' : 'bg-ink-700'"
            aria-hidden="true"
          />
        </li>
      </ol>

      <p v-if="terminated" class="mt-3 text-xs text-rose-300">
        This claim was rejected at the decision stage; the remaining steps do not apply.
      </p>
    </div>

    <!-- Event log -->
    <ol class="relative px-5 py-4" :class="dense ? 'space-y-3' : 'space-y-4'">
      <li
        v-for="(event, i) in ordered"
        :key="event.id"
        class="relative flex gap-3.5 pl-1"
      >
        <!-- Connector -->
        <span
          v-if="i < ordered.length - 1"
          class="absolute left-[7px] top-4 h-full w-px bg-ink-700"
          aria-hidden="true"
        />
        <span
          class="relative z-[1] mt-1.5 h-[9px] w-[9px] shrink-0 rounded-full ring-4 ring-ink-850"
          :class="ACTOR_STYLE[event.actorRole].dot"
          aria-hidden="true"
        />

        <div class="min-w-0 flex-1 pb-0.5">
          <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p class="text-sm font-medium text-mist-100">
              {{ event.label }}
              <span
                v-if="event.internal"
                class="ml-1.5 rounded border border-ink-600 bg-ink-800 px-1.5 py-px align-middle text-2xs font-normal text-mist-400"
              >
                internal
              </span>
            </p>
            <time
              class="shrink-0 text-2xs text-mist-500"
              :datetime="event.timestamp"
              :title="dateTime(event.timestamp)"
            >
              {{ relative(event.timestamp) }}
            </time>
          </div>

          <p class="mt-0.5 text-sm leading-relaxed text-mist-400">{{ event.detail }}</p>

          <p class="mt-1 text-2xs text-mist-500">
            <span :class="ACTOR_STYLE[event.actorRole].chip">
              {{ ACTOR_STYLE[event.actorRole].name }}
            </span>
            · {{ event.actor }} · marked {{ claimStatusLabel(event.status).toLowerCase() }}
          </p>
        </div>
      </li>
    </ol>
  </section>
</template>
