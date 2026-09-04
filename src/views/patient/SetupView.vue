<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAction, useAsync } from '@/lib/useAsync'
import * as patientsApi from '@/lib/api/patients'
import { HOME_FOR } from '@/router'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'

/**
 * Shown once, right after a patient's first Google sign-in. A freshly
 * auto-created profile (backend: `bindOrCreateForAccount`) has no phone, DOB,
 * national ID, address, or blood type — this is what actually collects them.
 * The router guard (`router/index.ts`) confines a patient here until
 * `PATCH /api/patients/:id` reports the profile complete, and bounces them
 * away from here once it does.
 */

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

type Gender = 'male' | 'female'

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const

const form = ref({
  name: auth.user?.name ?? '',
  phone: '',
  dateOfBirth: '',
  gender: '' as Gender | '',
  nationalId: '',
  address: '',
  bloodType: '',
})

// Prefills anything already saved (e.g. the patient started this once before
// and navigated away) rather than showing a blank form over real data.
const { data: existing, loading } = useAsync(() => patientsApi.getMe(auth.patientId!))

watch(existing, (patient) => {
  if (!patient) return
  form.value = {
    name: patient.name || form.value.name,
    phone: patient.phone,
    // <input type="date"> needs exactly YYYY-MM-DD; a full ISO timestamp
    // would silently fail to populate it.
    dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.slice(0, 10) : '',
    gender: patient.gender,
    nationalId: patient.nationalId,
    address: patient.address,
    bloodType: patient.bloodType,
  }
})

const canSubmit = () =>
  form.value.name.trim() &&
  form.value.phone.trim() &&
  form.value.dateOfBirth &&
  form.value.gender &&
  form.value.nationalId.trim() &&
  form.value.address.trim() &&
  form.value.bloodType

const save = useAction(async () => {
  return patientsApi.updateProfile(auth.patientId!, {
    name: form.value.name.trim(),
    phone: form.value.phone.trim(),
    dateOfBirth: form.value.dateOfBirth,
    gender: form.value.gender as Gender,
    nationalId: form.value.nationalId.trim(),
    address: form.value.address.trim(),
    bloodType: form.value.bloodType,
  })
})

async function submit() {
  const patient = await save.run()
  if (!patient) return
  auth.markPatientProfileComplete()
  const redirect = route.query.redirect as string | undefined
  await router.push(redirect ?? HOME_FOR.patient)
}
</script>

<template>
  <div class="flex min-h-full items-center justify-center px-5 py-12 sm:px-10">
    <div class="w-full max-w-lg">
      <div class="mb-6 flex items-center gap-3">
        <span
          class="grid h-9 w-9 place-items-center rounded-lg bg-gonka-500 text-lg font-bold text-ink-950"
          aria-hidden="true"
        >W</span>
        <div>
          <p class="text-sm font-semibold tracking-tight text-mist-100">WayFare</p>
          <p class="text-2xs text-mist-500">Claims coordination layer</p>
        </div>
      </div>

      <h1 class="text-xl font-semibold tracking-tight text-mist-100">Complete your profile</h1>
      <p class="mt-1.5 text-sm leading-relaxed text-mist-500">
        Your hospital and insurer need these on file before a claim can be raised or verified on
        your behalf. This only appears once.
      </p>

      <div v-if="loading" class="surface mt-6 p-5"><SkeletonBlock :lines="6" /></div>

      <form v-else class="surface mt-6 space-y-4 p-5" @submit.prevent="submit">
        <div>
          <label for="name" class="label mb-1.5 block">Full name</label>
          <input id="name" v-model="form.name" class="field" required />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="phone" class="label mb-1.5 block">Phone number</label>
            <input id="phone" v-model="form.phone" type="tel" class="field" placeholder="+60 12-345 6789" required />
          </div>

          <div>
            <label for="dob" class="label mb-1.5 block">Date of birth</label>
            <input id="dob" v-model="form.dateOfBirth" type="date" class="field" required />
          </div>

          <div>
            <label for="gender" class="label mb-1.5 block">Gender</label>
            <select id="gender" v-model="form.gender" class="field" required>
              <option value="" disabled>Select…</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>

          <div>
            <label for="blood-type" class="label mb-1.5 block">Blood type</label>
            <select id="blood-type" v-model="form.bloodType" class="field" required>
              <option value="" disabled>Select…</option>
              <option v-for="type in BLOOD_TYPES" :key="type" :value="type">{{ type }}</option>
            </select>
          </div>
        </div>

        <div>
          <label for="national-id" class="label mb-1.5 block">National ID / passport number</label>
          <input id="national-id" v-model="form.nationalId" class="field font-mono" required />
        </div>

        <div>
          <label for="address" class="label mb-1.5 block">Home address</label>
          <textarea id="address" v-model="form.address" rows="2" class="field resize-none" required />
        </div>

        <p v-if="save.error.value" class="text-sm text-rose-300">{{ save.error.value }}</p>

        <button type="submit" class="btn-primary w-full" :disabled="!canSubmit() || save.pending.value">
          {{ save.pending.value ? 'Saving…' : 'Save and continue' }}
        </button>
      </form>

      <p class="mt-4 text-2xs leading-relaxed text-mist-500">
        This information stays with WayFare and the organisations you interact with — never placed
        directly on Sui. Only claim references and settlement events are recorded on-chain.
      </p>
    </div>
  </div>
</template>
