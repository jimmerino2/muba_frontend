<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { MedicalRecord, RecordCategory, RecordLineItem } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'
import { useAction, useAsync } from '@/lib/useAsync'
import * as hospitalsApi from '@/lib/api/hospitals'
import { fileSize, money } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'

const auth = useAuthStore()
const router = useRouter()

const { data: patientList, loading: loadingPatients } = useAsync(() =>
  hospitalsApi.getPatients(auth.orgId!),
)

const CATEGORIES: RecordCategory[] = [
  'Room & Board',
  'Procedure',
  'Medication',
  'Diagnostics',
  'Consultation',
]

const ADMISSION_TYPES: MedicalRecord['admissionType'][] = [
  'outpatient',
  'inpatient',
  'day-surgery',
  'emergency',
]

const form = ref({
  patientId: '',
  visitDate: new Date().toISOString().slice(0, 10),
  admissionType: 'outpatient' as MedicalRecord['admissionType'],
  department: '',
  physician: auth.user?.name ?? '',
  diagnosis: '',
  icd10Code: '',
  treatment: '',
  notes: '',
})

const lineItems = ref<RecordLineItem[]>([
  { description: '', category: 'Consultation', amount: 0 },
])

/** Files are captured by name/size/type only — this build has no real storage. */
const pendingFiles = ref<File[]>([])

function addLineItem() {
  lineItems.value.push({ description: '', category: 'Procedure', amount: 0 })
}

function removeLineItem(index: number) {
  if (lineItems.value.length > 1) lineItems.value.splice(index, 1)
}

function onFiles(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files) pendingFiles.value.push(...Array.from(input.files))
  input.value = ''
}

const total = computed(() =>
  lineItems.value.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
)

const validItems = computed(() =>
  lineItems.value.filter((item) => item.description.trim() && Number(item.amount) > 0),
)

const canSubmit = computed(
  () =>
    form.value.patientId &&
    form.value.diagnosis.trim() &&
    form.value.treatment.trim() &&
    form.value.department.trim() &&
    validItems.value.length > 0,
)

const { pending, error, run } = useAction(async () => {
  const record = await hospitalsApi.createRecord(auth.orgId!, auth.user!.name, {
    ...form.value,
    visitDate: new Date(form.value.visitDate).toISOString(),
    lineItems: validItems.value.map((item) => ({ ...item, amount: Number(item.amount) })),
  })

  // Uploads are a separate route in the real API, so they are separate calls here too.
  for (const file of pendingFiles.value) {
    await hospitalsApi.uploadDocument(
      record.id,
      { name: file.name, size: file.size, type: file.type },
      auth.user!.name,
    )
  }
  return record
})

async function submit() {
  const record = await run()
  if (record) await router.push(`/hospital/records/${record.id}`)
}
</script>

<template>
  <div class="max-w-3xl">
    <PageHeader
      title="New medical record"
      subtitle="Records are the source of truth a claim is built from — the more complete this is, the better the plausibility check performs."
      :back="{ to: '/hospital/records', label: 'All records' }"
    />

    <form class="space-y-5" @submit.prevent="submit">
      <!-- Patient & visit -->
      <section class="surface p-5">
        <h2 class="mb-4 text-sm font-semibold tracking-tight text-mist-100">Patient and visit</h2>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label for="patient" class="label mb-1.5 block">Patient</label>
            <SkeletonBlock v-if="loadingPatients" height="h-9" />
            <select v-else id="patient" v-model="form.patientId" class="field" required>
              <option value="" disabled>Select a patient…</option>
              <option v-for="p in patientList?.data ?? []" :key="p.id" :value="p.id">
                {{ p.name }} · {{ p.nationalId }}
              </option>
            </select>
          </div>

          <div>
            <label for="visit-date" class="label mb-1.5 block">Visit date</label>
            <input id="visit-date" v-model="form.visitDate" type="date" class="field" required />
          </div>

          <div>
            <label for="admission" class="label mb-1.5 block">Admission type</label>
            <select id="admission" v-model="form.admissionType" class="field">
              <option v-for="type in ADMISSION_TYPES" :key="type" :value="type">
                {{ type.replace('-', ' ') }}
              </option>
            </select>
          </div>

          <div>
            <label for="department" class="label mb-1.5 block">Department</label>
            <input
              id="department"
              v-model="form.department"
              class="field"
              placeholder="e.g. Orthopaedics"
              required
            />
          </div>

          <div>
            <label for="physician" class="label mb-1.5 block">Attending physician</label>
            <input id="physician" v-model="form.physician" class="field" required />
          </div>
        </div>
      </section>

      <!-- Clinical -->
      <section class="surface p-5">
        <h2 class="mb-4 text-sm font-semibold tracking-tight text-mist-100">Clinical detail</h2>

        <div class="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <div>
            <label for="diagnosis" class="label mb-1.5 block">Diagnosis</label>
            <input
              id="diagnosis"
              v-model="form.diagnosis"
              class="field"
              placeholder="e.g. Acute appendicitis"
              required
            />
          </div>
          <div>
            <label for="icd10" class="label mb-1.5 block">ICD-10 code</label>
            <input
              id="icd10"
              v-model="form.icd10Code"
              class="field font-mono"
              placeholder="K35.80"
            />
          </div>
        </div>

        <div class="mt-4">
          <label for="treatment" class="label mb-1.5 block">Treatment provided</label>
          <textarea
            id="treatment"
            v-model="form.treatment"
            rows="3"
            class="field resize-y"
            placeholder="Describe the procedure, medication or management provided."
            required
          />
        </div>

        <div class="mt-4">
          <label for="notes" class="label mb-1.5 block">Clinical notes</label>
          <textarea
            id="notes"
            v-model="form.notes"
            rows="3"
            class="field resize-y"
            placeholder="Presentation, findings, and anything an assessor would want corroborated."
          />
          <p class="mt-1.5 text-xs text-mist-500">
            These notes are read by the Gonka verifier. Concrete findings — scores, lab values,
            imaging results — raise the Truth Score more than narrative detail.
          </p>
        </div>
      </section>

      <!-- Bill -->
      <section class="surface overflow-hidden">
        <header class="flex items-center justify-between border-b border-ink-700/70 px-5 py-3.5">
          <h2 class="text-sm font-semibold tracking-tight text-mist-100">Itemised bill</h2>
          <span class="tnum text-sm font-semibold text-mist-100">{{ money(total) }}</span>
        </header>

        <ul class="divide-y divide-ink-800/80">
          <li v-for="(item, index) in lineItems" :key="index" class="p-4">
            <div class="grid gap-3 sm:grid-cols-[1fr_11rem_8rem_2.5rem]">
              <input
                v-model="item.description"
                class="field"
                :aria-label="`Line ${index + 1} description`"
                placeholder="Description"
              />
              <select
                v-model="item.category"
                class="field"
                :aria-label="`Line ${index + 1} category`"
              >
                <option v-for="category in CATEGORIES" :key="category" :value="category">
                  {{ category }}
                </option>
              </select>
              <input
                v-model.number="item.amount"
                type="number"
                min="0"
                step="0.01"
                class="field tnum text-right"
                :aria-label="`Line ${index + 1} amount`"
                placeholder="0.00"
              />
              <button
                type="button"
                class="btn-ghost px-0"
                :disabled="lineItems.length === 1"
                :aria-label="`Remove line ${index + 1}`"
                @click="removeLineItem(index)"
              >
                ✕
              </button>
            </div>
          </li>
        </ul>

        <div class="border-t border-ink-700/70 px-4 py-3">
          <button type="button" class="btn-ghost" @click="addLineItem">+ Add line item</button>
        </div>
      </section>

      <!-- Documents -->
      <section class="surface p-5">
        <h2 class="text-sm font-semibold tracking-tight text-mist-100">Supporting documents</h2>
        <p class="mt-1 text-xs leading-relaxed text-mist-500">
          Discharge summaries, operative notes and imaging reports raise the Truth Score materially.
          This prototype records the file name, size and type only — nothing is stored or uploaded.
        </p>

        <label
          class="mt-4 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl
                 border border-dashed border-ink-600 px-4 py-7 text-center transition-colors hover:border-gonka-600/60 hover:bg-ink-850/60"
        >
          <span class="text-sm text-mist-300">Choose files to attach</span>
          <span class="text-xs text-mist-500">PDF or image · demo capture only</span>
          <input type="file" multiple class="sr-only" @change="onFiles" />
        </label>

        <ul v-if="pendingFiles.length" class="mt-3 space-y-2">
          <li
            v-for="(file, index) in pendingFiles"
            :key="`${file.name}-${index}`"
            class="flex items-center justify-between gap-3 rounded-lg border border-ink-700 bg-ink-900/50 px-3 py-2"
          >
            <div class="min-w-0">
              <p class="truncate text-sm text-mist-200">{{ file.name }}</p>
              <p class="text-2xs text-mist-500">{{ fileSize(file.size) }}</p>
            </div>
            <button
              type="button"
              class="shrink-0 text-xs text-mist-500 hover:text-rose-300"
              @click="pendingFiles.splice(index, 1)"
            >
              Remove
            </button>
          </li>
        </ul>
      </section>

      <p v-if="error" class="text-sm text-rose-300">{{ error }}</p>

      <div class="flex flex-wrap items-center gap-3">
        <button type="submit" class="btn-primary" :disabled="!canSubmit || pending">
          {{ pending ? 'Filing record…' : 'File record' }}
        </button>
        <button type="button" class="btn-ghost" @click="router.back()">Cancel</button>
        <p v-if="!canSubmit" class="text-xs text-mist-500">
          Select a patient, add a diagnosis, treatment, department, and at least one billed line.
        </p>
      </div>
    </form>
  </div>
</template>
