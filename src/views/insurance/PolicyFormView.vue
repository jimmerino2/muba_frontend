<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { CoverageType, PolicyStatus } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'
import { useAction, useAsync } from '@/lib/useAsync'
import * as insuranceApi from '@/lib/api/insurance'
import * as clausesApi from '@/lib/api/clauses'
import type { ManulifePlan } from '@/lib/api/clauses'
import { money } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'

const router = useRouter()
const auth = useAuthStore()

/** Policies cannot be edited once issued — a claim may already have been
 * verified against these terms (see the backend's explicit absence of a
 * `PATCH /api/policies/:id`). This view is create-only; the policy detail
 * page is the read-only "view details" screen. */
const COVERAGE_TYPES: CoverageType[] = [
  'Inpatient & Surgical',
  'Outpatient & Specialist',
  'Critical Illness',
  'Comprehensive Medical',
]
const STATUSES: PolicyStatus[] = ['active', 'pending', 'lapsed']

const today = new Date()
const inAYear = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000)

/** Generates a unique-enough policy number in the fixed "MN-<TIER>-<suffix>"
 * shape — there is exactly one insurer (Manulife) and exactly two tiers, so
 * nothing here is freely chosen, just made unique per issuance. */
function generatePolicyNumber(tierCode: string): string {
  return `MN-${tierCode}-${Date.now().toString(36).toUpperCase()}`
}

const form = ref({
  tierCode: '' as '' | 'GOLD' | 'PLATINUM',
  holderPatientId: '',
  coverageType: 'Inpatient & Surgical' as CoverageType,
  status: 'active' as PolicyStatus,
  autoApproveLimit: 15_000,
  tpaOrganizationId: '' as string,
  tpaApprovalLimit: 10_000 as number | null,
  truthScoreThreshold: 85,
  annualPremium: 2_940,
  startDate: today.toISOString().slice(0, 10),
  endDate: inAYear.toISOString().slice(0, 10),
})

const { data: members, loading: loadingMembers } = useAsync(() => insuranceApi.getMembers())
const { data: tpaOrgs, loading: loadingTpaOrgs } = useAsync(() => insuranceApi.listTpaOrganizations())
const { data: plans, loading: loadingPlans } = useAsync(() => clausesApi.getManulifePlans())

/** The one Manulife product this whole app sells — every policy is a tier
 * of it, never a freely-authored plan. Selecting a tier is the only choice
 * an insurer makes; everything else about the contract terms follows from it. */
const selectedPlan = computed<ManulifePlan | null>(
  () => plans.value?.find((p) => p.code === form.value.tierCode) ?? null,
)

const generatedName = computed(() =>
  selectedPlan.value ? `Manulife ${selectedPlan.value.name}` : '',
)

const loading = computed(
  () => loadingMembers.value || loadingPlans.value || loadingTpaOrgs.value,
)

const limitConflict = computed(
  () =>
    selectedPlan.value !== null &&
    Number(form.value.autoApproveLimit) > selectedPlan.value.overallAnnualLimit,
)

const tpaLimitConflict = computed(
  () =>
    selectedPlan.value !== null &&
    form.value.tpaApprovalLimit !== null &&
    Number(form.value.tpaApprovalLimit) > selectedPlan.value.overallAnnualLimit,
)

/** A TPA approval limit only means something once a TPA is actually
 * delegated — a limit with nobody to hold it is a contradiction, not just an
 * unusual policy. */
const tpaWithoutDelegateConflict = computed(
  () => form.value.tpaApprovalLimit !== null && !form.value.tpaOrganizationId,
)

const canSubmit = computed(
  () =>
    selectedPlan.value !== null &&
    form.value.holderPatientId &&
    !limitConflict.value &&
    !tpaLimitConflict.value &&
    !tpaWithoutDelegateConflict.value &&
    Number(form.value.truthScoreThreshold) >= 0 &&
    Number(form.value.truthScoreThreshold) <= 100,
)

const save = useAction(async () => {
  const plan = selectedPlan.value
  if (!plan) throw new Error('Select a tier first.')

  const payload = {
    name: generatedName.value,
    policyNumber: generatePolicyNumber(plan.code),
    productPlanId: plan.id,
    holderPatientId: form.value.holderPatientId,
    coverageType: form.value.coverageType,
    status: form.value.status,
    coverageLimit: plan.overallAnnualLimit,
    autoApproveLimit: Number(form.value.autoApproveLimit),
    tpaOrganizationId: form.value.tpaOrganizationId || null,
    tpaApprovalLimit:
      form.value.tpaApprovalLimit === null ? null : Number(form.value.tpaApprovalLimit),
    truthScoreThreshold: Number(form.value.truthScoreThreshold),
    deductible: plan.deductiblePerPolicyYear,
    annualPremium: Number(form.value.annualPremium),
    startDate: new Date(form.value.startDate).toISOString(),
    endDate: new Date(form.value.endDate).toISOString(),
  }

  return insuranceApi.createPolicy(auth.orgId!, auth.user!.orgName!, payload)
})

async function submit() {
  const policy = await save.run()
  if (policy) await router.push(`/insurance/policies/${policy.id}`)
}
</script>

<template>
  <div class="max-w-3xl">
    <PageHeader
      title="New policy"
      subtitle="The auto-approval limit and Truth Score threshold decide which claims this policy sends to an assessor."
      :back="{ to: '/insurance/policies', label: 'All policies' }"
    />

    <div v-if="loading" class="surface p-5"><SkeletonBlock :lines="6" /></div>

    <form v-else class="space-y-5" @submit.prevent="submit">
      <section class="surface p-5">
        <h2 class="mb-4 text-sm font-semibold tracking-tight text-mist-100">Identity and cover</h2>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label for="tier" class="label mb-1.5 block">Manulife EZ-Med Deductible tier</label>
            <select id="tier" v-model="form.tierCode" class="field" required>
              <option value="" disabled>Select a tier…</option>
              <option v-for="plan in plans ?? []" :key="plan.code" :value="plan.code">
                {{ plan.name }} — {{ money(plan.overallAnnualLimit) }} annual limit
              </option>
            </select>
            <p class="mt-1.5 text-xs text-mist-500">
              There is one Manulife product, sold in two fixed tiers — the policy name, number and
              contract terms all follow from the tier, not typed in by hand.
            </p>
          </div>

          <div v-if="selectedPlan">
            <p class="label mb-1.5">Policy name</p>
            <p class="field flex items-center bg-ink-900/40 text-mist-300">{{ generatedName }}</p>
          </div>

          <div v-if="selectedPlan">
            <p class="label mb-1.5">Policy number</p>
            <p class="field flex items-center bg-ink-900/40 font-mono text-mist-300">
              Assigned on save
            </p>
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
            <p class="label mb-1.5">Annual coverage limit</p>
            <p class="field tnum flex items-center bg-ink-900/40 text-mist-300">
              {{ selectedPlan ? money(selectedPlan.overallAnnualLimit) : '— select a tier —' }}
            </p>
            <p class="mt-1.5 text-xs text-mist-500">Fixed by the tier's contract terms.</p>
          </div>

          <div>
            <p class="label mb-1.5">Deductible</p>
            <p class="field tnum flex items-center bg-ink-900/40 text-mist-300">
              {{ selectedPlan ? money(selectedPlan.deductiblePerPolicyYear) : '— select a tier —' }}
            </p>
            <p class="mt-1.5 text-xs text-mist-500">Fixed by the tier's contract terms.</p>
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
            <label for="tpa-org" class="label mb-1.5 block">Administering TPA</label>
            <select id="tpa-org" v-model="form.tpaOrganizationId" class="field">
              <option value="">None — insurer decides directly</option>
              <option v-for="org in tpaOrgs ?? []" :key="org.id" :value="org.id">
                {{ org.name }}
              </option>
            </select>
            <p class="mt-1.5 text-xs text-mist-500">
              The TPA delegated to decide claims on this policy, up to the approval limit below.
            </p>
          </div>

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
              Cannot exceed the tier's annual coverage limit of
              {{ selectedPlan ? money(selectedPlan.overallAnnualLimit) : '—' }}.
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
              :class="tpaLimitConflict || tpaWithoutDelegateConflict ? 'border-rose-500/60' : ''"
            />
            <p v-if="tpaLimitConflict" class="mt-1.5 text-xs text-rose-300">
              Cannot exceed the tier's annual coverage limit of
              {{ selectedPlan ? money(selectedPlan.overallAnnualLimit) : '—' }}.
            </p>
            <p v-else-if="tpaWithoutDelegateConflict" class="mt-1.5 text-xs text-rose-300">
              Select an administering TPA above, or clear this limit.
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
          {{ save.pending.value ? 'Saving…' : 'Create policy' }}
        </button>
        <button type="button" class="btn-ghost" @click="router.back()">Cancel</button>
      </div>
    </form>
  </div>
</template>
