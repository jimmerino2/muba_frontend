<script setup lang="ts">
defineProps<{ options: { value: string; label: string }[]; modelValue: string }>()
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by status">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
      :class="
        modelValue === option.value
          ? 'border-gonka-600/45 bg-gonka-500/12 text-gonka-400'
          : 'border-ink-700 text-mist-400 hover:border-ink-600 hover:text-mist-200'
      "
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
