<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'

defineProps<{
  title: string
  subtitle?: string
  back?: { to: RouteLocationRaw; label: string }
}>()
</script>

<template>
  <header class="mb-6">
    <RouterLink
      v-if="back"
      :to="back.to"
      class="mb-2.5 inline-flex items-center gap-1.5 text-xs text-mist-500 transition-colors hover:text-mist-300"
    >
      <span aria-hidden="true">←</span> {{ back.label }}
    </RouterLink>

    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold tracking-tight text-mist-100">{{ title }}</h1>
        <p v-if="subtitle" class="mt-1 max-w-2xl text-sm leading-relaxed text-mist-500">
          {{ subtitle }}
        </p>
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2"><slot name="actions" /></div>
    </div>
  </header>
</template>
