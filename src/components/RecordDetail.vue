<script setup lang="ts">
import { computed } from 'vue'
import type { MedicalRecord } from '@/lib/types'
import { date, fileSize, money, titleCase } from '@/lib/format'
import DetailList from '@/components/ui/DetailList.vue'

/**
 * The record body, shared by the patient (read-only) and provider views. Only the
 * surrounding page chrome and actions differ between the two.
 */
const props = defineProps<{ record: MedicalRecord }>()

const facts = computed(() => [
  { label: 'Record number', value: props.record.recordNumber, mono: true },
  { label: 'Visit date', value: date(props.record.visitDate) },
  { label: 'Admission type', value: titleCase(props.record.admissionType) },
  { label: 'Department', value: props.record.department },
  { label: 'Attending physician', value: props.record.physician },
  { label: 'ICD-10 code', value: props.record.icd10Code, mono: true },
])

/** Grouped so the bill reads as a bill, not an undifferentiated list. */
const grouped = computed(() => {
  const map = new Map<string, { category: string; items: typeof props.record.lineItems; total: number }>()
  for (const item of props.record.lineItems) {
    const entry = map.get(item.category) ?? { category: item.category, items: [], total: 0 }
    entry.items.push(item)
    entry.total += item.amount
    map.set(item.category, entry)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
})
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
            class="flex items-center justify-between gap-4 px-5 py-2.5"
          >
            <span class="text-sm text-mist-300">{{ item.description }}</span>
            <span class="tnum shrink-0 text-sm text-mist-200">{{ money(item.amount) }}</span>
          </li>
        </ul>
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
