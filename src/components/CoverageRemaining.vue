<script setup lang="ts">
import { computed } from 'vue'
import { money } from '@/lib/format'

/**
 * "How much can I still claim" — the patient-facing framing of the same
 * used-vs-limit utilisation the insurer's PolicyDetailView already shows,
 * just flipped to lead with what's left rather than what's spent.
 */
const props = withDefaults(defineProps<{ used: number; limit: number; label?: string }>(), {
  label: 'You can still claim',
})

const remaining = computed(() => Math.max(0, props.limit - props.used))
const percentUsed = computed(() =>
  props.limit ? Math.min(100, Math.round((props.used / props.limit) * 100)) : 0,
)
</script>

<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="label">{{ label }}</p>
        <p class="tnum mt-1 text-2xl font-semibold tracking-tight text-emerald-300">
          {{ money(remaining) }}
        </p>
      </div>
      <p class="tnum text-sm text-mist-500">
        {{ money(used) }} claimed of {{ money(limit) }} annual limit · {{ percentUsed }}% used
      </p>
    </div>
    <div class="mt-3 h-2 overflow-hidden rounded-full bg-ink-750">
      <div
        class="h-full rounded-full bg-brand-500 transition-[width] duration-700"
        :style="{ width: `${percentUsed}%` }"
      />
    </div>
  </div>
</template>
