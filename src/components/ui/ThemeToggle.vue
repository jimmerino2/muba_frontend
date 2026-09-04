<script setup lang="ts">
import { useThemeStore } from '@/stores/theme'

const theme = useThemeStore()
</script>

<template>
  <button
    type="button"
    class="btn-ghost h-8 w-8 shrink-0 p-0 text-sm"
    :aria-label="theme.mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
    :title="theme.mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="theme.toggle()"
  >
    <span aria-hidden="true">{{ theme.mode === 'dark' ? '☀' : '☾' }}</span>
  </button>
</template>
