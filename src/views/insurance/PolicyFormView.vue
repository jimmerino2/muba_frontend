<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { CoverageType, PolicyStatus } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'
import { useAction, useAsync } from '@/lib/useAsync'
import * as insuranceApi from '@/lib/api/insurance'
import { money } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const policyId = computed(() => route.params.policyId as string | undefined)
const isEdit = computed(() => Boolean(policyId.value))

const COVERAGE_TYPES: CoverageType[] = [
  'Inpatient & Surgical',
  'Outpatient & Specialist',
  'Critical Illness',
  'Comprehensive Medical',
]
const STATUSES: PolicyStatus[] = ['active', 'pending', 'lapsed']

const today = new Date()
const inAYear = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000)

const form = ref({
  name: '',
  policyNumber: '',
  holderPatientId: '',
  coverageType: 'Inpatient & Surgical' as CoverageType,
  status: 'active' as PolicyStatus,
  coverageLimit: 150_000,
  autoApproveLimit: 15_000,
  tpaApprovalLimit: 10_000 as number | null,
  truthScoreThreshold: 85,
  deductible: 500,
  annualPremium: 2_940,
  startDate: today.toISOString().slice(0, 10),
  endDate: inAYear.toISOString().slice(0, 10),
})

const { data: members, loading: loadingMembers } = useAsync(() => insuranceApi.getMembers())

const { data: existing, loading: loadingPolicy } = useAsync(
  () =>
    policyId.value
      ? insuranceApi.getPolicyById(auth.orgId!, policyId.value)
      : Promise.resolve(null),
)

watch(existing, (policy) => {
  if (!policy) return
  form.value = {
    name: policy.name,
    policyNumber: policy.policyNumber,
    holderPatientId: policy.holderPatientId,
    coverageType: policy.coverageType,
    status: policy.status,
    coverageLimit: policy.coverageLimit,
    autoApproveLimit: policy.autoApproveLimit,
    tpaApprovalLimit: policy.tpaApprovalLimit,
    truthScoreThreshold: policy.truthScoreThreshold,
    deductible: policy.deductible,
    annualPremium: policy.annualPremium,
    startDate: policy.startDate.slice(0, 10),
    endDate: policy.endDate.slice(0, 10),
  }
})

const loading = computed(() => loadingMembers.value || loadingPolicy.value)

const limitConflict = computed(
  () => Number(form.value.autoApproveLimit) > Number(form.value.coverageLimit),
)

const tpaLimitConflict = computed(
  () =>
    form.value.tpaApprovalLimit !== null &&
    Number(form.value.tpaApprovalLimit) > Number(form.value.coverageLimit),
)

const canSubmit = computed(
  () =>
    form.value.name.trim() &&
    form.value.policyNumber.trim() &&
    form.value.holderPatientId &&
    !limitConflict.value &&
    !tpaLimitConflict.value &&
    Number(form.value.truthScoreThreshold) >= 0 &&
    Number(form.value.truthScoreThreshold) <= 100,
)

const save = useAction(async () => {
  const payload = {
    name: form.value.name.trim(),
    policyNumber: form.value.policyNumber.trim(),
    holderPatientId: form.value.holderPatientId,
    coverageType: form.value.coverageType,
    status: form.value.status,
    coverageLimit: Number(form.value.coverageLimit),
    autoApproveLimit: Number(form.value.autoApproveLimit),
    tpaApprovalLimit:
      form.value.tpaApprovalLimit === null ? null : Number(form.value.tpaApprovalLimit),
    truthScoreThreshold: Number(form.value.truthScoreThreshold),
    deductible: Number(form.value.deductible),
    annualPremium: Number(form.value.annualPremium),
    startDate: new Date(form.value.startDate).toISOString(),
    endDate: new Date(form.value.endDate).toISOString(),
  }

  return policyId.value
    ? insuranceApi.updatePolicy(auth.orgId!, policyId.value, payload)
    : insuranceApi.createPolicy(auth.orgId!, auth.user!.orgName!, payload)
})

async function submit() {
  const policy = await save.run()
  if (policy) await router.push(`/insurance/policies/${policy.id}`)
}
</script>

<template>
  <div class="max-w-3xl">
    <PageHeader
      :title="isEdit ? 'Edit policy' : 'New policy'"
      subtitle="The auto-approval limit and Truth Score threshold decide which claims this policy sends to an assessor."
      :back="{
        to: isEdit ? `/insurance/policies/${policyId}` : '/insurance/policies',
        label: isEdit ? 'Back to policy' : 'All policies',
      }"
    />

    <div v-if="loading" class="surface p-5"><SkeletonBlock :lines="6" /></div>

    <form v-else class="space-y-5" @submit.prevent="submit">
      <section class="surface p-5">
        <h2 class="mb-4 text-sm font-semibold tracking-tight text-mist-100">Identity and cover</h2>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="policy-name" class="label mb-1.5 block">Policy name</label>
            <input
              id="policy-name"
              v-model="form.name"
              class="field"
              placeholder="Basic Medical Plan"
              required
            />
          </div>

          <div>
            <label for="policy-number" class="label mb-1.5 block">Policy number</label>
            <input
              id="policy-number"
              v-model="form.policyNumber"
              class="field font-mono"
              placeholder="MN-INP-2026-00001"
              required
            />
          </div>

          <div>
            <label for="holder" class="label mb-1.5 block">Insured party</label>
            <select id="holder" v-model="form.holderPatientId" class="field" required>
              <option value="" disabled>Select a member…</option>
              <option v-for="member in members?.data ?? []" :key="member.id" :value="member.id">
                {{ member.name }} · {{ member.nationalId }}
              </option>
            </select>
          </div>

          <div>
            <label for="coverage-type" class="label mb-1.5 block">Coverage type</label>
            <select id="coverage-type" v-model="form.coverageType" class="field">
              <option v-for="type in COVERAGE_TYPES" :key="type" :value="type">{{ type }}</option>
            </select>
          </div>

          <div>
            <label for="status" class="label mb-1.5 block">Status</label>
            <select id="status" v-model="form.status" class="field capitalize">
              <option v-for="status in STATUSES" :key="status" :value="status">{{ status }}</option>
            </select>
          </div>

          <div>
            <label for="start-date" class="label mb-1.5 block">Start date</label>
            <input id="start-date" v-model="form.startDate" type="date" class="field" required />
          </div>

          <div>
            <label for="end-date" class="label mb-1.5 block">End date</label>
            <input id="end-date" v-model="form.endDate" type="date" class="field" required />
          </div>
        </div>
      </section>

      <section class="surface p-5">
        <h2 class="mb-1 text-sm font-semibold tracking-tight text-mist-100">Limits and pricing</h2>
        <p class="mb-4 text-xs text-mist-500">All amounts in MYR.</p>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="coverage-limit" class="label mb-1.5 block">Annual coverage limit</label>
            <input
              id="coverage-limit"
              v-model.number="form.coverageLimit"
              type="number"
              min="0"
              step="100"
              class="field tnum"
              required
            />
          </div>

          <div>
            <label for="deductible" class="label mb-1.5 block">Deductible</label>
            <input
              id="deductible"
              v-model.number="form.deductible"
              type="number"
              min="0"
              step="50"
              class="field tnum"
              required
            />
          </div>

          <div>
            <label for="premium" class="label mb-1.5 block">Annual premium</label>
            <input
              id="premium"
              v-model.number="form.annualPremium"
              type="number"
              min="0"
              step="10"
              class="field tnum"
              required
            />
          </div>
        </div>
      </section>

      <!-- The automation rules, given their own section because they are the point. -->
      <section class="surface p-5">
        <h2 class="text-sm font-semibold tracking-tight text-mist-100">Automation rules</h2>
        <p class="mt-1 text-xs leading-relaxed text-mist-500">
          A claim clears without human review only when it satisfies both conditions.
        </p>

        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label for="auto-limit" class="label mb-1.5 block">Auto-approval limit</label>
            <input
              id="auto-limit"
              v-model.number="form.autoApproveLimit"
              type="number"
              min="0"
              step="100"
              class="field tnum"
              :class="limitConflict ? 'border-rose-500/60' : ''"
              required
            />
            <p v-if="limitConflict" class="mt-1.5 text-xs text-rose-300">
              Cannot exceed the annual coverage limit of {{ money(Number(form.coverageLimit)) }}.
            </p>
            <p v-else class="mt-1.5 text-xs text-mist-500">
              Claims above {{ money(Number(form.autoApproveLimit)) }} always reach an assessor.
            </p>
          </div>

          <div>
            <label for="tpa-limit" class="label mb-1.5 block">TPA approval limit</label>
            <input
              id="tpa-limit"
              v-model.number="form.tpaApprovalLimit"
              type="number"
              min="0"
              step="100"
              class="field tnum"
              :class="tpaLimitConflict ? 'border-rose-500/60' : ''"
            />
            <p v-if="tpaLimitConflict" class="mt-1.5 text-xs text-rose-300">
              Cannot exceed the annual coverage limit of {{ money(Number(form.coverageLimit)) }}.
            </p>
            <p v-else class="mt-1.5 text-xs text-mist-500">
              The administering TPA may decide claims at or below this amount alone; above it, the
              claim escalates to your own review queue.
            </p>
          </div>

          <div>
            <label for="threshold" class="label mb-1.5 block">
              Truth Score threshold ({{ form.truthScoreThreshold }})
            </label>
            <input
              id="threshold"
              v-model.number="form.truthScoreThreshold"
              type="range"
              min="0"
              max="100"
              step="1"
              class="w-full accent-[#22C9A6]"
            />
            <div class="flex justify-between text-2xs text-mist-500">
              <span>0 · accept anything</span>
              <span>100 · never auto-approve</span>
            </div>
            <p class="mt-1.5 text-xs text-mist-500">
              Claims scoring below
              <span class="text-gonka-400">{{ form.truthScoreThreshold }}</span> reach an assessor.
            </p>
          </div>
        </div>
      </section>

      <p v-if="save.error.value" class="text-sm text-rose-300">{{ save.error.value }}</p>

      <div class="flex flex-wrap items-center gap-3">
        <button type="submit" class="btn-primary" :disabled="!canSubmit || save.pending.value">
          {{ save.pending.value ? 'Saving…' : isEdit ? 'Save changes' : 'Create policy' }}
        </button>
        <button type="button" class="btn-ghost" @click="router.back()">Cancel</button>
      </div>
    </form>
  </div>
</template>
