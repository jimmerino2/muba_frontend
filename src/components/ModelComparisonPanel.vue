<script setup lang="ts">
import { computed } from 'vue'
import type { VerificationResult } from '@/lib/types'
import { bandLabel } from '@/lib/format'

/**
 * Shows other models' takes on the same claim, requested purely for
 * side-by-side comparison — see gonka-model.ts VerifyClaimInput.comparisonModels.
 * Never implies these scores had any say in the routing decision; that stays
 * exactly what TruthScorePanel already shows for the primary model.
 */
const props = defineProps<{
  verification: VerificationResult | null
}>()

/** Normalized to a single shape up front — the wire union type doesn't narrow
 * cleanly across separate template blocks, and this reads better anyway. */
const rows = computed(() =>
  (props.verification?.comparisons ?? []).map((entry) => ({
    model: entry.model,
    failed: entry.error !== undefined,
    error: entry.error,
    truthScore: entry.error === undefined ? entry.truthScore : null,
    band: entry.error === undefined ? entry.band : null,
    verdict: entry.error === undefined ? entry.verdict : null,
    reasoning: entry.error === undefined ? entry.reasoning : null,
  })),
)

const BAND_TONE: Record<'high' | 'medium' | 'low', string> = {
  high: 'border-gonka-600/40 bg-gonka-950/70 text-gonka-400',
  medium: 'border-amber-500/35 bg-amber-500/[0.08] text-amber-300',
  low: 'border-rose-500/35 bg-rose-500/[0.08] text-rose-300',
}
</script>

<template>
  <section
    v-if="rows.length > 0"
    class="surface overflow-hidden"
    aria-labelledby="model-comparison-heading"
  >
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700/70 px-5 py-3.5">
      <div class="flex items-center gap-2.5">
        <span class="h-2 w-2 rounded-full bg-mist-500" aria-hidden="true" />
        <h2 id="model-comparison-heading" class="text-sm font-semibold tracking-tight text-mist-100">
          Model comparison
        </h2>
      </div>
      <p class="text-2xs uppercase tracking-[0.13em] text-mist-500">
        For reference only · does not affect routing
      </p>
    </header>

    <ul class="divide-y divide-ink-700/70">
      <li
        v-for="entry in rows"
        :key="entry.model"
        class="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-start sm:justify-between"
      >
        <div class="min-w-0">
          <p class="font-mono text-xs text-mist-300">{{ entry.model }}</p>

          <p v-if="entry.failed" class="mt-1 text-sm text-rose-300">
            Could not get a verdict from this model: {{ entry.error }}
          </p>
          <template v-else>
            <p class="mt-1 text-sm font-medium text-mist-100">{{ entry.verdict }}</p>
            <p class="mt-1 max-w-xl text-xs leading-relaxed text-mist-500">{{ entry.reasoning }}</p>
          </template>
        </div>

        <div v-if="!entry.failed" class="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
          <p class="tnum text-lg font-semibold text-mist-100">{{ entry.truthScore }}</p>
          <span
            class="rounded-md border px-2 py-0.5 text-2xs font-medium"
            :class="entry.band ? BAND_TONE[entry.band] : ''"
          >
            {{ entry.band ? bandLabel(entry.band) : '' }}
          </span>
        </div>
      </li>
    </ul>
  </section>
</template>
