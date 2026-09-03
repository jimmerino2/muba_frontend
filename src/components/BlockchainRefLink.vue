<script setup lang="ts">
import type { BlockchainRef } from '@/lib/types'
import { dateTime, truncateId } from '@/lib/format'
import CopyChip from '@/components/ui/CopyChip.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'

/**
 * The Sui surface. Every instance carries the "Testnet · Simulated payout" tag —
 * the README is explicit that settlement is mocked, and the UI does not imply
 * otherwise anywhere it shows a transaction.
 */
withDefaults(
  defineProps<{
    reference: BlockchainRef | null
    loading?: boolean
    /** Inline mode renders a single row, for use inside a table or a list item. */
    inline?: boolean
    emptyLabel?: string
  }>(),
  { loading: false, inline: false, emptyLabel: 'No on-chain transaction yet' },
)
</script>

<template>
  <div v-if="loading" class="surface p-4"><SkeletonBlock :lines="3" /></div>

  <div
    v-else-if="!reference"
    class="rounded-lg border border-dashed border-ink-700 px-4 py-3 text-sm text-mist-500"
  >
    {{ emptyLabel }}
  </div>

  <!-- Inline: a compact digest link, for dense lists -->
  <a
    v-else-if="inline"
    :href="reference.explorerUrl"
    target="_blank"
    rel="noopener noreferrer"
    class="inline-flex items-center gap-2 rounded-md border border-sui-600/35 bg-sui-950/50 px-2 py-1
           font-mono text-xs text-sui-400 transition-colors hover:border-sui-500/60 hover:text-sui-300"
  >
    <span class="h-1.5 w-1.5 rounded-full bg-sui-500" aria-hidden="true" />
    {{ truncateId(reference.digest, 8, 6) }}
    <span class="font-sans text-2xs opacity-60">↗</span>
  </a>

  <!-- Full panel -->
  <section v-else class="surface overflow-hidden" aria-labelledby="chain-ref-heading">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700/70 px-5 py-3.5">
      <div class="flex items-center gap-2.5">
        <span class="h-2 w-2 rounded-full bg-sui-500 shadow-[0_0_10px_2px_rgba(124,138,255,.45)]" aria-hidden="true" />
        <h2 id="chain-ref-heading" class="text-sm font-semibold tracking-tight text-mist-100">
          {{ reference.kind === 'settlement' ? 'Sui settlement' : 'Sui attestation' }}
        </h2>
      </div>
      <span
        class="rounded-md border border-sui-600/35 bg-sui-950/60 px-2 py-1 text-2xs font-medium uppercase tracking-wider text-sui-400"
      >
        Testnet · Simulated payout
      </span>
    </header>

    <div class="space-y-4 p-5">
      <div>
        <p class="label mb-1.5">Transaction digest</p>
        <CopyChip :value="reference.digest" tone="sui" />
      </div>

      <dl class="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        <div>
          <dt class="label">Network</dt>
          <dd class="mt-1 font-mono text-sm text-mist-200">{{ reference.network }}</dd>
        </div>
        <div>
          <dt class="label">Status</dt>
          <dd class="mt-1 text-sm font-medium capitalize text-emerald-300">{{ reference.status }}</dd>
        </div>
        <div>
          <dt class="label">Epoch</dt>
          <dd class="tnum mt-1 font-mono text-sm text-mist-200">{{ reference.epoch }}</dd>
        </div>
        <div>
          <dt class="label">Checkpoint</dt>
          <dd class="tnum mt-1 font-mono text-sm text-mist-200">
            {{ reference.checkpoint.toLocaleString() }}
          </dd>
        </div>
        <div>
          <dt class="label">Gas fee</dt>
          <dd class="tnum mt-1 font-mono text-sm text-mist-200">{{ reference.gasFeeSui }} SUI</dd>
        </div>
        <div>
          <dt class="label">Timestamp</dt>
          <dd class="mt-1 text-sm text-mist-200">{{ dateTime(reference.timestamp) }}</dd>
        </div>
      </dl>

      <!-- Sponsored transactions are the Sui Payments-track point: the signer holds no SUI. -->
      <div v-if="reference.sponsored" class="rounded-lg border border-ink-700 bg-ink-900/50 p-3.5">
        <p class="text-xs font-medium text-mist-200">Gas sponsored</p>
        <p class="mt-1 text-xs leading-relaxed text-mist-500">
          The payer signed this transaction without holding SUI — gas was paid by the WayFare
          sponsor address, so neither the insurer nor the provider needs to manage a gas balance.
        </p>
        <div class="mt-2.5 flex flex-wrap gap-2">
          <CopyChip :value="reference.sender" label="Sender" truncate />
          <CopyChip :value="reference.sponsorAddress" label="Sponsor" truncate tone="sui" />
        </div>
      </div>

      <div>
        <p class="label mb-2">Emitted events</p>
        <ul class="space-y-2">
          <li
            v-for="event in reference.events"
            :key="event.type"
            class="rounded-lg border border-ink-700/70 bg-ink-900/40 px-3 py-2.5"
          >
            <p class="font-mono text-2xs text-sui-400">{{ event.type }}</p>
            <p class="mt-1 text-sm leading-snug text-mist-300">{{ event.summary }}</p>
          </li>
        </ul>
      </div>

      <a
        :href="reference.explorerUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="btn-ghost w-full sm:w-auto"
      >
        View on Suiscan (testnet) ↗
      </a>
    </div>
  </section>
</template>
