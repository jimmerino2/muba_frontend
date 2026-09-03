<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { VerificationResult } from '@/lib/types'
import { bandColor, bandLabel, dateTime } from '@/lib/format'
import CopyChip from '@/components/ui/CopyChip.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'

/**
 * The Gonka transparency surface. The score, the reasoning trace and the Gonka
 * Request ID are rendered together, always — an approve/reject outcome is never
 * shown anywhere in this app without this panel beside it.
 */
const props = withDefaults(
  defineProps<{
    verification: VerificationResult | null
    /** Policy threshold, drawn as a tick on the gauge so the score has a reference. */
    threshold?: number
    loading?: boolean
    /** Count the score up on mount — used after a live verification run. */
    animate?: boolean
    compact?: boolean
  }>(),
  { loading: false, animate: false, compact: false },
)

const RADIUS = 46
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const shown = ref(0)

function runTo(target: number) {
  if (!props.animate) {
    shown.value = target
    return
  }
  const start = performance.now()
  const from = shown.value
  const DURATION = 1_100
  const step = (t: number) => {
    const p = Math.min(1, (t - start) / DURATION)
    // Ease-out-cubic: fast arrival, gentle settle — reads as a measurement landing.
    shown.value = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3)))
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

onMounted(() => runTo(props.verification?.truthScore ?? 0))
watch(
  () => props.verification?.truthScore,
  (score) => runTo(score ?? 0),
)

const colors = computed(() => bandColor(props.verification?.band ?? 'medium'))
const dashOffset = computed(() => CIRCUMFERENCE * (1 - shown.value / 100))

/**
 * Tick angle along the gauge's own 270° sweep. Drawn inside the SVG so it shares
 * the arc's coordinate system exactly — positioning it with a CSS rotation on an
 * overlay put it in a different frame and landed it in the wrong place.
 */
const thresholdAngle = computed(() =>
  props.threshold === undefined ? 0 : (props.threshold / 100) * 270,
)

const clearsThreshold = computed(
  () =>
    props.threshold !== undefined &&
    props.verification !== null &&
    props.verification.truthScore >= props.threshold,
)

const IMPACT_TONE = {
  positive: 'bg-gonka-500',
  neutral: 'bg-mist-500',
  negative: 'bg-rose-400',
}
</script>

<template>
  <section
    class="surface overflow-hidden"
    aria-labelledby="truth-score-heading"
  >
    <!-- Header: this panel is always identifiably a Gonka artefact. -->
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700/70 px-5 py-3.5">
      <div class="flex items-center gap-2.5">
        <span class="h-2 w-2 rounded-full bg-gonka-500 shadow-[0_0_10px_2px_rgba(34,201,166,.45)]" aria-hidden="true" />
        <h2 id="truth-score-heading" class="text-sm font-semibold tracking-tight text-mist-100">
          Gonka Truth Score
        </h2>
      </div>
      <p class="text-2xs uppercase tracking-[0.13em] text-mist-500">
        AI plausibility check · decision support, not a decision
      </p>
    </header>

    <!-- Loading -->
    <div v-if="loading" class="space-y-4 p-5">
      <div class="flex items-center gap-5">
        <div class="h-28 w-28 shrink-0 rounded-full bg-ink-750" />
        <div class="flex-1"><SkeletonBlock :lines="3" /></div>
      </div>
      <SkeletonBlock :lines="2" />
    </div>

    <!-- Honest not-yet-verified state: no zero score, no implied judgement. -->
    <div v-else-if="!verification" class="flex items-start gap-4 p-5">
      <div
        class="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-dashed border-ink-600 text-mist-500"
        aria-hidden="true"
      >
        —
      </div>
      <div>
        <p class="text-sm font-medium text-mist-200">Not yet verified</p>
        <p class="mt-1.5 max-w-md text-sm leading-relaxed text-mist-500">
          This claim has not been through the Gonka Router. No Truth Score, reasoning trace or
          request ID exists for it yet, so no automated routing decision has been made.
        </p>
      </div>
    </div>

    <!-- Verified -->
    <div v-else class="animate-fade-up">
      <div class="flex flex-col gap-6 p-5 sm:flex-row sm:items-start">
        <!-- Gauge -->
        <div class="relative mx-auto shrink-0 sm:mx-0">
          <svg viewBox="0 0 120 120" class="h-32 w-32 -rotate-[135deg]" role="img"
               :aria-label="`Truth Score ${verification.truthScore} out of 100, ${bandLabel(verification.band)}`">
            <circle
              cx="60" cy="60" :r="RADIUS" fill="none" stroke-width="9" stroke-linecap="round"
              class="stroke-ink-750"
              :stroke-dasharray="`${CIRCUMFERENCE * 0.75} ${CIRCUMFERENCE}`"
            />
            <circle
              cx="60" cy="60" :r="RADIUS" fill="none" stroke-width="9" stroke-linecap="round"
              :class="colors.ring"
              :stroke-dasharray="`${CIRCUMFERENCE * 0.75} ${CIRCUMFERENCE}`"
              :stroke-dashoffset="dashOffset * 0.75"
              style="transition: stroke-dashoffset .2s linear"
            />

            <!-- Policy threshold marker, on the same sweep as the arc above -->
            <line
              v-if="threshold !== undefined"
              :x1="60 + RADIUS - 8"
              y1="60"
              :x2="60 + RADIUS + 8"
              y2="60"
              stroke-width="2"
              stroke-linecap="round"
              class="stroke-mist-200/80"
              :transform="`rotate(${thresholdAngle} 60 60)`"
            />
          </svg>

          <div class="absolute inset-0 grid place-items-center">
            <div class="text-center">
              <p class="tnum text-4xl font-semibold leading-none tracking-tight" :class="colors.text">
                {{ shown }}
              </p>
              <p class="mt-1 text-2xs uppercase tracking-[0.13em] text-mist-500">of 100</p>
            </div>
          </div>
        </div>

        <!-- Verdict + reasoning trace -->
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="rounded-md border px-2 py-1 text-xs font-medium"
              :class="{
                'border-gonka-600/40 bg-gonka-950/70 text-gonka-400': verification.band === 'high',
                'border-amber-500/35 bg-amber-500/[0.08] text-amber-300': verification.band === 'medium',
                'border-rose-500/35 bg-rose-500/[0.08] text-rose-300': verification.band === 'low',
              }"
            >
              {{ bandLabel(verification.band) }}
            </span>
            <span
              v-if="threshold !== undefined"
              class="rounded-md border border-ink-700 bg-ink-900/60 px-2 py-1 text-xs text-mist-400"
            >
              Policy threshold {{ threshold }}
              <span :class="clearsThreshold ? 'text-emerald-300' : 'text-amber-300'">
                · {{ clearsThreshold ? 'cleared' : 'not met' }}
              </span>
            </span>
          </div>

          <p class="mt-3 text-sm font-medium leading-snug text-mist-100">{{ verification.verdict }}</p>

          <div class="mt-3">
            <p class="label mb-1.5">Reasoning trace</p>
            <p class="text-sm leading-relaxed text-mist-300">{{ verification.reasoning }}</p>
          </div>
        </div>
      </div>

      <!-- Contributing factors -->
      <div v-if="!compact" class="border-t border-ink-700/70 px-5 py-4">
        <p class="label mb-3">Contributing factors</p>
        <ul class="space-y-2.5">
          <li v-for="factor in verification.factors" :key="factor.label" class="flex items-start gap-3">
            <span
              class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
              :class="IMPACT_TONE[factor.impact]"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline justify-between gap-3">
                <p class="text-sm font-medium text-mist-200">{{ factor.label }}</p>
                <span class="tnum shrink-0 text-2xs text-mist-500">
                  weight {{ Math.round(factor.weight * 100) }}%
                </span>
              </div>
              <p class="mt-0.5 text-xs leading-relaxed text-mist-500">{{ factor.detail }}</p>
              <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-750">
                <div
                  class="h-full rounded-full transition-[width] duration-700"
                  :class="IMPACT_TONE[factor.impact]"
                  :style="{ width: `${Math.round(factor.weight * 100)}%`, opacity: 0.75 }"
                />
              </div>
            </div>
          </li>
        </ul>
      </div>

      <!-- Traceability footer: the request ID is never more than one glance away. -->
      <footer
        class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-700/70 bg-ink-900/40 px-5 py-3"
      >
        <CopyChip :value="verification.requestId" label="Gonka request" tone="gonka" />
        <dl class="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-mist-500">
          <div class="flex items-center gap-1.5">
            <dt class="uppercase tracking-wider">Model</dt>
            <dd class="font-mono text-mist-400">{{ verification.model }}</dd>
          </div>
          <div class="flex items-center gap-1.5">
            <dt class="uppercase tracking-wider">Latency</dt>
            <dd class="tnum font-mono text-mist-400">{{ verification.latencyMs.toLocaleString() }}ms</dd>
          </div>
          <div class="flex items-center gap-1.5">
            <dt class="uppercase tracking-wider">Verified</dt>
            <dd class="text-mist-400">{{ dateTime(verification.verifiedAt) }}</dd>
          </div>
        </dl>
      </footer>
    </div>
  </section>
</template>
