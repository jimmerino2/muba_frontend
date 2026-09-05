<script setup lang="ts">
import { computed } from 'vue'
import type { Claim, ClaimLineItem, MedicalRecord } from '@/lib/types'
import { date, fileSize, money, titleCase } from '@/lib/format'
import DetailList from '@/components/ui/DetailList.vue'

/**
 * The record body, shared by the patient (read-only) and provider views. Only the
 * surrounding page chrome and actions differ between the two. `claim` is optional —
 * a record with no claim raised yet (or whose claim hasn't loaded) just shows the
 * bill with no coverage/owed columns.
 */
const props = defineProps<{ record: MedicalRecord; claim?: Claim | null }>()

const facts = computed(() => [
  { label: 'Record number', value: props.record.recordNumber, mono: true },
  { label: 'Visit date', value: date(props.record.visitDate) },
  { label: 'Admission type', value: titleCase(props.record.admissionType) },
  { label: 'Department', value: props.record.department },
  { label: 'Attending physician', value: props.record.physician },
  { label: 'ICD-10 code', value: props.record.icd10Code, mono: true },
])

/**
 * A claim is decided per line item, so coverage/owed are matched back to each
 * billed line by description rather than derived from the claim total. An item
 * with no matching claim line (or no claim at all) is simply undecided.
 */
const claimItemsByDescription = computed(() => {
  const map = new Map<string, ClaimLineItem>()
  for (const item of props.claim?.lineItems ?? []) map.set(item.description, item)
  return map
})

type LineStatus = 'no-claim' | 'pending' | 'covered' | 'owed'

function statusFor(description: string): { status: LineStatus; covered: number; owed: number } {
  if (!props.claim) return { status: 'no-claim', covered: 0, owed: 0 }
  const match = claimItemsByDescription.value.get(description)
  if (!match || (match.approved === null && match.denied === null)) {
    return { status: 'pending', covered: 0, owed: 0 }
  }
  if (match.approved) return { status: 'covered', covered: match.amount, owed: 0 }
  return { status: 'owed', covered: 0, owed: match.amount }
}

/** Grouped so the bill reads as a bill, not an undifferentiated list. */
const grouped = computed(() => {
  const map = new Map<
    string,
    { category: string; items: (typeof props.record.lineItems[number] & ReturnType<typeof statusFor>)[]; total: number }
  >()
  for (const item of props.record.lineItems) {
    const entry = map.get(item.category) ?? { category: item.category, items: [], total: 0 }
    entry.items.push({ ...item, ...statusFor(item.description) })
    entry.total += item.amount
    map.set(item.category, entry)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
})

/** Whether any line item has actually been decided yet — governs showing the totals footer. */
const hasDecidedItems = computed(() =>
  (props.claim?.lineItems ?? []).some((item) => item.approved !== null || item.denied !== null),
)
const totalCovered = computed(() =>
  grouped.value.reduce((sum, group) => sum + group.items.reduce((s, i) => s + i.covered, 0), 0),
)
const totalOwed = computed(() =>
  grouped.value.reduce((sum, group) => sum + group.items.reduce((s, i) => s + i.owed, 0), 0),
)
</script>

<template>
  <div class="space-y-5">
    <section class="surface p-5">
      <h2 class="text-sm font-semibold tracking-tight text-mist-100">Clinical summary</h2>
      <p class="mt-3 text-sm leading-relaxed text-mist-300">{{ record.treatment }}</p>
      <p v-if="record.notes" class="mt-3 border-l-2 border-ink-700 pl-3 text-sm leading-relaxed text-mist-400">
        {{ record.notes }}
      </p>
      <div class="mt-5 border-t border-ink-700/70 pt-4">
        <DetailList :items="facts" :columns="3" />
      </div>
    </section>

    <section class="surface overflow-hidden">
      <header class="flex items-center justify-between border-b border-ink-700/70 px-5 py-3.5">
        <h2 class="text-sm font-semibold tracking-tight text-mist-100">Itemised bill</h2>
        <span class="tnum text-sm font-semibold text-mist-100">{{ money(record.totalCost) }}</span>
      </header>

      <div v-for="group in grouped" :key="group.category" class="border-b border-ink-800/80 last:border-0">
        <div class="flex items-center justify-between bg-ink-900/40 px-5 py-2">
          <p class="label">{{ group.category }}</p>
          <span class="tnum text-xs text-mist-400">{{ money(group.total) }}</span>
        </div>
        <ul>
          <li
            v-for="item in group.items"
            :key="item.description"
            class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-2.5"
          >
            <span class="min-w-0 flex-1 text-sm text-mist-300">{{ item.description }}</span>

            <div class="flex shrink-0 items-center gap-4">
              <template v-if="item.status === 'covered'">
                <span class="tnum text-xs text-emerald-300">{{ money(item.covered) }} covered</span>
              </template>
              <template v-else-if="item.status === 'owed'">
                <span class="tnum text-xs text-amber-300">{{ money(item.owed) }} you owe</span>
              </template>
              <template v-else-if="item.status === 'pending'">
                <span class="text-2xs text-mist-500">Pending decision</span>
              </template>

              <span class="tnum text-sm text-mist-200">{{ money(item.amount) }}</span>
            </div>
          </li>
        </ul>
      </div>

      <div
        v-if="hasDecidedItems"
        class="flex flex-wrap items-center justify-end gap-x-8 gap-y-2 border-t border-ink-700/70 bg-ink-900/40 px-5 py-3"
      >
        <div class="text-right">
          <p class="label">Covered</p>
          <p class="tnum mt-0.5 text-sm font-semibold text-emerald-300">{{ money(totalCovered) }}</p>
        </div>
        <div class="text-right">
          <p class="label">Total left (you owe)</p>
          <p class="tnum mt-0.5 text-sm font-semibold text-amber-300">{{ money(totalOwed) }}</p>
        </div>
      </div>
    </section>

    <section class="surface overflow-hidden">
      <header class="flex items-center justify-between border-b border-ink-700/70 px-5 py-3.5">
        <h2 class="text-sm font-semibold tracking-tight text-mist-100">Supporting documents</h2>
        <span class="text-2xs text-mist-500">
          {{ record.documents.length }} attached
        </span>
      </header>

      <p v-if="!record.documents.length" class="px-5 py-6 text-sm text-mist-500">
        No documents attached to this record.
      </p>

      <ul v-else class="divide-y divide-ink-800/80">
        <li
          v-for="doc in record.documents"
          :key="doc.id"
          class="flex items-center gap-3.5 px-5 py-3"
        >
          <span
            class="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-ink-700 bg-ink-900/60 text-2xs text-mist-400"
            aria-hidden="true"
          >
            {{ doc.mimeType.startsWith('image/') ? 'IMG' : 'PDF' }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm text-mist-200">{{ doc.name }}</p>
            <p class="truncate text-2xs text-mist-500">
              {{ fileSize(doc.sizeBytes) }} · {{ doc.uploadedBy }} · {{ date(doc.uploadedAt) }}
            </p>
          </div>
          <span class="shrink-0 text-2xs text-mist-500">Demo file — no stored content</span>
        </li>
      </ul>
    </section>
  </div>
</template>
