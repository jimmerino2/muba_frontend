<script setup lang="ts">
defineProps<{ title: string; body?: string; icon?: string }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center px-6 py-14 text-center">
    <div
      class="mb-4 grid h-11 w-11 place-items-center rounded-xl border border-ink-700 bg-ink-800 text-lg"
      aria-hidden="true"
    >
      {{ icon ?? '◦' }}
    </div>
    <p class="text-sm font-medium text-mist-200">{{ title }}</p>
    <p v-if="body" class="mt-1.5 max-w-sm text-sm leading-relaxed text-mist-500">{{ body }}</p>
    <div class="mt-5"><slot /></div>
  </div>
</template>
