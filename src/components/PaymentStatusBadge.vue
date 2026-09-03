<script setup lang="ts">
import type { PaymentStatus } from '@/lib/types'
import { paymentStatusLabel, paymentStatusTone } from '@/lib/format'

withDefaults(defineProps<{ status: PaymentStatus; size?: 'sm' | 'md' }>(), { size: 'md' })
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border font-medium"
    :class="[paymentStatusTone(status), size === 'sm' ? 'px-1.5 py-0.5 text-2xs' : 'px-2 py-1 text-xs']"
  >
    <span
      v-if="status === 'processing'"
      class="h-1.5 w-1.5 animate-pulse rounded-full bg-current"
      aria-hidden="true"
    />
    {{ paymentStatusLabel(status) }}
  </span>
</template>
