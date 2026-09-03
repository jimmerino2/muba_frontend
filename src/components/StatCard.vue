<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'

/**
 * Dashboard tile. Every role's stat row is built from these, so the buckets read
 * as the same object across the three experiences.
 */
withDefaults(
  defineProps<{
    label: string
    value: string | number | null
    hint?: string
    to?: RouteLocationRaw
    loading?: boolean
    /** Accent applies to the value only — the tile chrome stays neutral. */
    tone?: 'neutral' | 'attention' | 'positive' | 'negative' | 'chain'
    emphasis?: boolean
  }>(),
  { tone: 'neutral', loading: false, emphasis: false },
)

const TONES = {
  neutral: 'text-mist-100',
  attention: 'text-amber-300',
  positive: 'text-emerald-300',
  negative: 'text-rose-300',
  chain: 'text-sui-400',
}
</script>

<template>
  <component
    :is="to ? RouterLink : 'div'"
    :to="to"
    class="surface group relative flex flex-col justify-between gap-3 p-4 transition-colors"
    :class="[
      to ? 'hover:border-ink-600 hover:bg-ink-800/80' : '',
      emphasis ? 'ring-1 ring-inset ring-amber-500/25' : '',
    ]"
  >
    <div class="flex items-start justify-between gap-2">
      <p class="label leading-snug">{{ label }}</p>
      <span
        v-if="to"
        class="text-mist-500 opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden="true"
      >→</span>
    </div>

    <div>
      <SkeletonBlock v-if="loading" height="h-8" />
      <p v-else class="tnum text-3xl font-semibold leading-none tracking-tight" :class="TONES[tone]">
        {{ value ?? '—' }}
      </p>
      <p v-if="hint && !loading" class="mt-1.5 text-xs leading-snug text-mist-500">{{ hint }}</p>
    </div>
  </component>
</template>
