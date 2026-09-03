<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, ref } from 'vue'
import { useRouter, type RouteLocationRaw } from 'vue-router'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import type { Column } from '@/lib/table'


const props = withDefaults(
  defineProps<{
    columns: Column<T>[]
    rows: T[]
    rowKey: (row: T) => string
    loading?: boolean
    /** Makes each row a link. */
    to?: (row: T) => RouteLocationRaw
    emptyTitle?: string
    emptyBody?: string
    emptyIcon?: string
    /** Free-text search box; the parent decides which fields it matches. */
    searchable?: boolean
    searchPlaceholder?: string
    searchFields?: (row: T) => string[]
    initialSort?: { key: string; direction: 'asc' | 'desc' }
  }>(),
  {
    loading: false,
    emptyTitle: 'Nothing here yet',
    searchable: false,
    searchPlaceholder: 'Search…',
  },
)

const router = useRouter()

const query = ref('')
const sortKey = ref(props.initialSort?.key ?? '')
const sortDirection = ref<'asc' | 'desc'>(props.initialSort?.direction ?? 'desc')

function toggleSort(column: Column<T>) {
  if (!column.sortable) return
  if (sortKey.value === column.key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = column.key
    sortDirection.value = 'desc'
  }
}

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle || !props.searchFields) return props.rows
  return props.rows.filter((row) =>
    props.searchFields!(row).some((field) => (field ?? '').toLowerCase().includes(needle)),
  )
})

const sorted = computed(() => {
  if (!sortKey.value) return filtered.value
  const column = props.columns.find((c) => c.key === sortKey.value)
  if (!column) return filtered.value

  const pick = column.sortValue ?? ((row: T) => row[column.key])
  const factor = sortDirection.value === 'asc' ? 1 : -1

  return [...filtered.value].sort((a, b) => {
    const av = pick(a)
    const bv = pick(b)
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor
    return String(av).localeCompare(String(bv)) * factor
  })
})

function open(row: T) {
  if (props.to) void router.push(props.to(row))
}
</script>

<template>
  <div class="surface overflow-hidden">
    <!-- Toolbar: search on the left, caller-supplied status filters on the right -->
    <div
      v-if="searchable || $slots.filters"
      class="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700/70 px-4 py-3"
    >
      <div v-if="searchable" class="relative min-w-[200px] flex-1 sm:max-w-xs">
        <span
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist-500"
          aria-hidden="true"
        >⌕</span>
        <input
          v-model="query"
          type="search"
          class="field pl-8"
          :placeholder="searchPlaceholder"
          :aria-label="searchPlaceholder"
        />
      </div>
      <div v-else />
      <div class="flex flex-wrap items-center gap-2"><slot name="filters" /></div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-3 p-4">
      <SkeletonBlock v-for="n in 5" :key="n" height="h-9" />
    </div>

    <!-- Empty -->
    <EmptyState
      v-else-if="!sorted.length"
      :title="query ? 'No matches' : emptyTitle"
      :body="query ? `Nothing matches “${query}”. Try a different search.` : emptyBody"
      :icon="emptyIcon"
    >
      <slot name="empty-action" />
    </EmptyState>

    <!-- Table -->
    <div v-else class="overflow-x-auto">
      <table class="w-full border-collapse text-left text-sm">
        <thead>
          <tr class="border-b border-ink-700/70">
            <th
              v-for="column in columns"
              :key="column.key"
              scope="col"
              class="px-4 py-2.5 font-medium"
              :class="[
                column.width,
                column.align === 'right' ? 'text-right' : 'text-left',
                column.hideOnMobile ? 'hidden sm:table-cell' : '',
              ]"
              :aria-sort="
                sortKey === column.key
                  ? sortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : undefined
              "
            >
              <button
                v-if="column.sortable"
                type="button"
                class="label inline-flex items-center gap-1 transition-colors hover:text-mist-300"
                @click="toggleSort(column)"
              >
                {{ column.label }}
                <span
                  class="text-[9px] transition-opacity"
                  :class="sortKey === column.key ? 'opacity-100' : 'opacity-25'"
                  aria-hidden="true"
                >
                  {{ sortKey === column.key && sortDirection === 'asc' ? '▲' : '▼' }}
                </span>
              </button>
              <span v-else class="label">{{ column.label }}</span>
            </th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="row in sorted"
            :key="rowKey(row)"
            class="border-b border-ink-800/80 transition-colors last:border-0"
            :class="to ? 'cursor-pointer hover:bg-ink-800/70' : ''"
            :tabindex="to ? 0 : undefined"
            @click="open(row)"
            @keydown.enter="open(row)"
          >
            <td
              v-for="column in columns"
              :key="column.key"
              class="px-4 py-3 align-middle"
              :class="[
                column.align === 'right' ? 'text-right' : 'text-left',
                column.hideOnMobile ? 'hidden sm:table-cell' : '',
              ]"
            >
              <slot :name="`cell-${column.key}`" :row="row">
                <span class="text-mist-300">{{ row[column.key] }}</span>
              </slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="!loading && sorted.length"
      class="border-t border-ink-700/70 px-4 py-2.5 text-2xs text-mist-500"
    >
      Showing {{ sorted.length }} of {{ rows.length }}
    </div>
  </div>
</template>
