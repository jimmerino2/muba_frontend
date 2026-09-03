<script setup lang="ts">
defineProps<{ message: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="surface flex flex-col items-start gap-3 border-rose-500/30 bg-rose-500/[0.06] p-5">
    <div class="flex items-center gap-2">
      <span class="grid h-6 w-6 place-items-center rounded-md bg-rose-500/15 text-rose-300">!</span>
      <p class="text-sm font-medium text-rose-200">Could not load this view</p>
    </div>
    <p class="text-sm leading-relaxed text-mist-400">{{ message }}</p>
    <button type="button" class="btn-ghost" @click="$emit('retry')">Try again</button>
  </div>
</template>
