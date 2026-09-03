<script setup lang="ts">
import { ref } from 'vue'
import { truncateId } from '@/lib/format'

const props = withDefaults(
  defineProps<{ value: string; label?: string; truncate?: boolean; tone?: 'gonka' | 'sui' | 'plain' }>(),
  { truncate: false, tone: 'plain' },
)

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  try {
    await navigator.clipboard.writeText(props.value)
  } catch {
    return // Clipboard blocked (insecure context); the full value is still on screen.
  }
  copied.value = true
  clearTimeout(timer)
  timer = setTimeout(() => (copied.value = false), 1600)
}

const TONES = {
  gonka: 'border-gonka-600/40 bg-gonka-950/60 text-gonka-400 hover:border-gonka-500/70',
  sui: 'border-sui-600/40 bg-sui-950/60 text-sui-400 hover:border-sui-500/70',
  plain: 'border-ink-700 bg-ink-900/60 text-mist-300 hover:border-ink-600',
}
</script>

<template>
  <button
    type="button"
    class="group inline-flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5
           font-mono text-xs transition-colors"
    :class="TONES[tone]"
    :title="`Copy ${label ?? 'value'}: ${value}`"
    @click="copy"
  >
    <span v-if="label" class="font-sans text-2xs uppercase tracking-wider opacity-70">
      {{ label }}
    </span>
    <span class="truncate">{{ truncate ? truncateId(value) : value }}</span>
    <span class="shrink-0 opacity-50 transition-opacity group-hover:opacity-90" aria-hidden="true">
      {{ copied ? '✓' : '⧉' }}
    </span>
    <span class="sr-only">{{ copied ? 'Copied to clipboard' : 'Copy to clipboard' }}</span>
  </button>
</template>
