<script setup lang="ts">
import { ref } from 'vue'
import * as devApi from '@/lib/api/dev'
import { ApiError } from '@/lib/api/client'
import CopyChip from '@/components/ui/CopyChip.vue'

/**
 * Dev-only demo action. `claims::payout()` on Sui reads the settlement
 * Treasury's real on-chain balance — an approved claim doesn't fail to pay
 * when it's short, it just sits at "payment pending" forever. This tops the
 * treasury up with real (worthless) testnet SUI so the settlement leg of the
 * demo can actually complete. The backend 404s the underlying route outside
 * dev regardless of whether this component is shown.
 */

const amount = ref(50)
const submitting = ref(false)
const error = ref<string | null>(null)
const lastDigest = ref<string | null>(null)

async function submit() {
  if (submitting.value || !(amount.value > 0)) return
  submitting.value = true
  error.value = null
  try {
    const result = await devApi.fundTreasury(amount.value)
    lastDigest.value = result.digest
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not fund the treasury.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="surface p-5">
    <header class="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 class="text-sm font-semibold tracking-tight text-mist-100">Dev: fund settlement treasury</h2>
        <p class="mt-0.5 max-w-md text-xs text-mist-500">
          Tops up the shared on-chain Treasury with real testnet SUI so approved claims can actually
          settle, instead of sitting at "payment pending".
        </p>
      </div>
      <span class="label text-sui-400">Testnet · Dev tool</span>
    </header>

    <form class="flex flex-wrap items-end gap-3" @submit.prevent="submit">
      <label class="flex flex-col gap-1">
        <span class="label">Amount (SUI)</span>
        <input
          v-model.number="amount"
          type="number"
          min="0.01"
          max="999"
          step="0.01"
          class="field w-32"
        />
      </label>
      <button type="submit" class="btn-sui" :disabled="submitting || !(amount > 0)">
        {{ submitting ? 'Funding…' : 'Fund treasury' }}
      </button>
    </form>

    <p v-if="error" class="mt-3 text-xs text-rose-400">{{ error }}</p>

    <div v-if="lastDigest" class="mt-3 flex flex-wrap items-center gap-2">
      <span class="text-xs text-mist-500">Last top-up tx:</span>
      <CopyChip :value="lastDigest" tone="sui" truncate />
    </div>
  </section>
</template>
