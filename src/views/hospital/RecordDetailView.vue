<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAction, useAsync } from '@/lib/useAsync'
import * as hospitalsApi from '@/lib/api/hospitals'
import { date, money } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader.vue'
import RecordDetail from '@/components/RecordDetail.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const route = useRoute()
const auth = useAuthStore()
const recordId = route.params.recordId as string

const { data, loading, error, refresh } = useAsync(() =>
  hospitalsApi.getRecordById(auth.orgId!, recordId),
)

const fileInput = ref<HTMLInputElement | null>(null)

const upload = useAction(async (files: FileList) => {
  for (const file of Array.from(files)) {
    await hospitalsApi.uploadDocument(recordId, file, auth.user!.name)
  }
  await refresh()
})

async function onFiles(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) await upload.run(input.files)
  input.value = ''
}
</script>

<template>
  <div>
    <ErrorState v-if="error" :message="error" @retry="refresh" />

    <div v-else-if="loading" class="space-y-5">
      <SkeletonBlock height="h-10" />
      <div class="surface p-5"><SkeletonBlock :lines="5" /></div>
    </div>

    <template v-else-if="data">
      <PageHeader
        :title="data.diagnosis"
        :subtitle="`${data.patientName} · ${date(data.visitDate)} · ${data.recordNumber}`"
        :back="{ to: '/hospital/records', label: 'All records' }"
      >
        <template #actions>
          <input ref="fileInput" type="file" multiple class="sr-only" @change="onFiles" />
          <button
            type="button"
            class="btn-ghost"
            :disabled="upload.pending.value"
            @click="fileInput?.click()"
          >
            {{ upload.pending.value ? 'Attaching…' : 'Attach document' }}
          </button>

          <RouterLink v-if="data.claimId" :to="`/hospital/claims/${data.claimId}`" class="btn-ghost">
            View claim
          </RouterLink>
          <RouterLink v-else :to="`/hospital/records/${data.id}/claim`" class="btn-primary">
            Raise claim
          </RouterLink>
        </template>
      </PageHeader>

      <!-- A record with no claim is the provider's actionable state; say so plainly. -->
      <div
        v-if="!data.claimId"
        class="surface mb-5 flex flex-wrap items-center justify-between gap-4 border-l-2 border-l-amber-500 p-4"
      >
        <div>
          <p class="text-sm font-medium text-mist-100">No claim raised from this record</p>
          <p class="mt-0.5 text-sm text-mist-500">
            {{ money(data.totalCost) }} billed and unclaimed.
            {{ data.documents.length }} supporting document{{
              data.documents.length === 1 ? '' : 's'
            }}
            attached.
          </p>
        </div>
        <RouterLink :to="`/hospital/records/${data.id}/claim`" class="btn-primary">
          Raise a claim
        </RouterLink>
      </div>

      <p v-if="upload.error.value" class="mb-4 text-sm text-rose-300">{{ upload.error.value }}</p>

      <RecordDetail :record="data" />
    </template>
  </div>
</template>
