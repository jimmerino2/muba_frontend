<script setup lang="ts">
defineProps<{ items: { label: string; value: string; mono?: boolean }[]; columns?: 2 | 3 }>()
</script>

<template>
  <dl
    class="grid gap-x-6 gap-y-4"
    :class="columns === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'"
  >
    <div v-for="item in items" :key="item.label" class="min-w-0">
      <dt class="label">{{ item.label }}</dt>
      <dd
        class="mt-1 break-words text-sm text-mist-200"
        :class="item.mono ? 'tnum font-mono' : ''"
      >
        {{ item.value }}
      </dd>
    </div>
  </dl>
</template>
