<script setup lang="ts">
withDefaults(defineProps<{ lines?: number; height?: string }>(), { lines: 1, height: 'h-4' })
</script>

<template>
  <div class="space-y-2" role="status" aria-label="Loading">
    <div
      v-for="n in lines"
      :key="n"
      class="relative overflow-hidden rounded-md bg-ink-750"
      :class="height"
      :style="{ width: n === lines && lines > 1 ? '62%' : '100%' }"
    >
      <div
        class="absolute inset-0 -translate-x-full animate-shimmer
               bg-gradient-to-r from-transparent via-white/[0.045] to-transparent"
      />
    </div>
  </div>
</template>
