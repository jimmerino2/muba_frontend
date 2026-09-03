<script setup lang="ts">
import type { ClaimStatus } from '@/lib/types'
import { claimStatusLabel, claimStatusTone } from '@/lib/format'

withDefaults(defineProps<{ status: ClaimStatus; size?: 'sm' | 'md' }>(), { size: 'md' })
</script>

<template>
  <span
    class="inline-flex items-center whitespace-nowrap rounded-md border font-medium"
    :class="[claimStatusTone(status), size === 'sm' ? 'px-1.5 py-0.5 text-2xs' : 'px-2 py-1 text-xs']"
  >
    {{ claimStatusLabel(status) }}
  </span>
</template>
