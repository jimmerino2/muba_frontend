<script setup lang="ts">
import { VERIFICATION_STEPS } from '@/lib/useVerificationRun'

/** Progress readout for a verification run. Purely presentational. */
defineProps<{ stepIndex: number }>()
</script>

<template>
  <section class="surface overflow-hidden">
    <header class="flex items-center gap-2.5 border-b border-ink-700/70 px-5 py-3.5">
      <span
        class="h-2 w-2 animate-pulse rounded-full bg-gonka-500 shadow-[0_0_10px_2px_rgba(34,201,166,.45)]"
        aria-hidden="true"
      />
      <h2 class="text-sm font-semibold tracking-tight text-mist-100">Verifying claim</h2>
    </header>

    <ol class="space-y-3.5 p-5" aria-live="polite">
      <li
        v-for="(step, index) in VERIFICATION_STEPS"
        :key="step"
        class="flex items-center gap-3 transition-opacity"
        :class="index > stepIndex ? 'opacity-35' : 'opacity-100'"
      >
        <span
          class="grid h-5 w-5 shrink-0 place-items-center rounded-full border text-2xs"
          :class="
            index < stepIndex
              ? 'border-gonka-600/50 bg-gonka-950 text-gonka-400'
              : index === stepIndex
                ? 'border-gonka-500 bg-gonka-500 text-ink-950'
                : 'border-ink-700 text-mist-500'
          "
        >
          {{ index < stepIndex ? '✓' : index + 1 }}
        </span>
        <span class="text-sm" :class="index <= stepIndex ? 'text-mist-200' : 'text-mist-500'">
          {{ step }}
        </span>
        <span v-if="index === stepIndex" class="ml-auto text-2xs text-mist-500">working…</span>
      </li>
    </ol>

    <p class="border-t border-ink-700/70 px-5 py-3 text-xs leading-relaxed text-mist-500">
      The router is scoring this claim against clinical pathways, cost benchmarks and the evidence
      attached to the record. This usually takes a few seconds.
    </p>
  </section>
</template>
