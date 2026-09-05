<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import type { Claim, Policy } from '@/lib/types'
import type { ClaimClauseContextInput } from '@/lib/api/hospitals'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import { useVerificationRun } from '@/lib/useVerificationRun'
import * as hospitalsApi from '@/lib/api/hospitals'
import * as gonkaApi from '@/lib/api/gonka'
import { money } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader.vue'
import TruthScorePanel from '@/components/TruthScorePanel.vue'
import ModelComparisonPanel from '@/components/ModelComparisonPanel.vue'
import VerificationSteps from '@/components/VerificationSteps.vue'
import RoutingOutcomeCard from '@/components/RoutingOutcomeCard.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const recordId = route.params.recordId as string

const { data, loading, error, refresh } = useAsync(async () => {
  const record = await hospitalsApi.getRecordById(auth.orgId!, recordId)
  const detail = await hospitalsApi.getPatientById(auth.orgId!, record.patientId)
  return { record, policies: detail.policies }
})

const form = ref({ policyId: '', treatmentDescription: '', amountRequested: 0, model: '', comparisonModels: [] as string[] })

/** Empty string means "use the backend's default model" — not sent as an
 * override at all, see submit() below. */
const { data: gonkaModels } = useAsync(() => gonkaApi.listModels())

/** Other models offered for comparison exclude whichever one is already
 * doing the actual verification — comparing a model against itself is noise,
 * not a second opinion. */
const comparableModels = computed(() =>
  (gonkaModels.value?.models ?? []).filter((m) => m !== (form.value.model || gonkaModels.value?.default)),
)

function toggleComparisonModel(model: string, checked: boolean) {
  if (checked) {
    if (!form.value.comparisonModels.includes(model)) form.value.comparisonModels.push(model)
  } else {
    form.value.comparisonModels = form.value.comparisonModels.filter((m) => m !== model)
  }
}

const FACILITY_TYPES: { value: NonNullable<ClaimClauseContextInput['facilityType']>; label: string }[] = [
  { value: 'PRIVATE_HOSPITAL', label: 'Private hospital' },
  { value: 'GOVERNMENT_HOSPITAL', label: 'Government hospital' },
  { value: 'GOVERNMENT_CLINIC', label: 'Government clinic' },
  { value: 'DIALYSIS_CENTRE', label: 'Dialysis centre' },
  { value: 'CANCER_CENTRE', label: 'Cancer centre' },
  { value: 'CLINIC', label: 'Clinic' },
]

/**
 * Facts the policy's contract clauses turn on — see clauses-service.ts. Left
 * unanswered (blank / '' / null), a clause that needs one of these comes back
 * INCONCLUSIVE and routes the whole claim to a human, even with a high Truth
 * Score: a missing fact is never silently treated as a pass. Defaulting the
 * country to Malaysia matches the overwhelming common case without forcing
 * every claim through this field to reach auto-approval.
 */
const clauseContext = ref({
  treatmentCountry: 'MY',
  consecutiveDaysAbroad: 0,
  facilityType: '' as '' | NonNullable<ClaimClauseContextInput['facilityType']>,
  roomRatePerDay: null as number | null,
  admissionDays: null as number | null,
  roomClass: '',
})

/** The room-entitlement clause only ever applies to a claim that actually
 * bills a Room & Board line item — asking for a room rate on every claim
 * would be noise for the (common) day-case/outpatient majority. */
const hasRoomAndBoard = computed(
  () => seed.value?.record.lineItems.some((item) => item.category === 'Room & Board') ?? false,
)
const treatedAbroad = computed(
  () => clauseContext.value.treatmentCountry.trim().toUpperCase() !== 'MY',
)

function buildClauseContext(): ClaimClauseContextInput | undefined {
  const ctx: ClaimClauseContextInput = {}
  const country = clauseContext.value.treatmentCountry.trim().toUpperCase()
  if (country) ctx.treatmentCountry = country
  if (treatedAbroad.value && clauseContext.value.consecutiveDaysAbroad > 0) {
    ctx.consecutiveDaysAbroad = clauseContext.value.consecutiveDaysAbroad
  }
  if (clauseContext.value.facilityType) ctx.facilityType = clauseContext.value.facilityType
  if (hasRoomAndBoard.value) {
    if (clauseContext.value.roomRatePerDay) ctx.roomRatePerDay = clauseContext.value.roomRatePerDay
    if (clauseContext.value.admissionDays) ctx.admissionDays = clauseContext.value.admissionDays
    if (clauseContext.value.roomClass.trim()) ctx.roomClass = clauseContext.value.roomClass.trim()
  }
  return Object.keys(ctx).length > 0 ? ctx : undefined
}

/** Prefill from the record once it lands — the provider edits rather than retypes. */
const prefilled = ref(false)
const seed = computed(() => {
  if (data.value && !prefilled.value) {
    form.value.policyId = data.value.policies[0]?.id ?? ''
    form.value.treatmentDescription = data.value.record.treatment
    form.value.amountRequested = data.value.record.totalCost
    prefilled.value = true
  }
  return data.value
})

const selectedPolicy = computed<Policy | null>(
  () => data.value?.policies.find((p) => p.id === form.value.policyId) ?? null,
)

/** Shown before submitting: what the policy will do with this claim, and why. */
const routingPreview = computed(() => {
  const policy = selectedPolicy.value
  if (!policy) return null
  const withinLimit = form.value.amountRequested <= policy.autoApproveLimit
  return {
    withinLimit,
    limit: policy.autoApproveLimit,
    threshold: policy.truthScoreThreshold,
    message: withinLimit
      ? `If the Truth Score reaches ${policy.truthScoreThreshold} or above, this claim clears automatically.`
      : `At ${money(form.value.amountRequested)} this exceeds the ${money(policy.autoApproveLimit)} auto-approval limit, so it goes to a human assessor regardless of the score.`,
  }
})

/* ------------------------------------------------------- verification run */

type Phase = 'form' | 'running' | 'done'
const phase = ref<Phase>('form')
const submitError = ref<string | null>(null)
const createdClaim = ref<Claim | null>(null)

const verify = useVerificationRun()

async function submit(alsoSubmitToInsurer: boolean) {
  submitError.value = null

  let claim: Claim
  try {
    claim = await hospitalsApi.createClaimFromRecord(auth.orgId!, auth.user!.name, recordId, {
      policyId: form.value.policyId,
      treatmentDescription: form.value.treatmentDescription,
      amountRequested: Number(form.value.amountRequested),
      submit: alsoSubmitToInsurer,
      clauseContext: buildClauseContext(),
    })
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'The claim could not be created.'
    return
  }

  createdClaim.value = claim

  if (!alsoSubmitToInsurer) {
    await router.push(`/hospital/claims/${claim.id}`)
    return
  }

  phase.value = 'running'
  const outcome = await verify.run(claim.id, form.value.model || undefined, form.value.comparisonModels)
  if (!outcome) {
    submitError.value = verify.error.value
    // The claim exists and is submitted; only the verification leg failed.
    await router.push(`/hospital/claims/${claim.id}`)
    return
  }
  phase.value = 'done'
}

const canSubmit = computed(
  () =>
    form.value.policyId &&
    form.value.treatmentDescription.trim().length > 0 &&
    Number(form.value.amountRequested) > 0,
)
</script>

<template>
  <div class="max-w-3xl">
    <ErrorState v-if="error" :message="error" @retry="refresh" />

    <div v-else-if="loading" class="space-y-5">
      <SkeletonBlock height="h-10" />
      <div class="surface p-5"><SkeletonBlock :lines="5" /></div>
    </div>

    <template v-else-if="seed">
      <PageHeader
        title="Raise a claim"
        :subtitle="`From record ${seed.record.recordNumber} · ${seed.record.patientName}`"
        :back="{ to: `/hospital/records/${recordId}`, label: 'Back to record' }"
      />

      <!-- ---------------------------------------------------------- form -->
      <form v-if="phase === 'form'" class="space-y-5" @submit.prevent="submit(true)">
        <section class="surface p-5">
          <h2 class="mb-4 text-sm font-semibold tracking-tight text-mist-100">Claim details</h2>

          <div class="space-y-4">
            <div>
              <label for="policy" class="label mb-1.5 block">Policy to claim against</label>
              <select id="policy" v-model="form.policyId" class="field" required>
                <option value="" disabled>Select a policy…</option>
                <option v-for="policy in seed.policies" :key="policy.id" :value="policy.id">
                  {{ policy.policyNumber }} · {{ policy.insurerName }} · {{ policy.coverageType }}
                </option>
              </select>
              <p v-if="!seed.policies.length" class="mt-1.5 text-xs text-amber-300">
                This patient has no policy on file. A claim cannot be raised without active cover.
              </p>
            </div>

            <div>
              <label for="treatment-desc" class="label mb-1.5 block">Treatment description</label>
              <textarea
                id="treatment-desc"
                v-model="form.treatmentDescription"
                rows="3"
                class="field resize-y"
                required
              />
              <p class="mt-1.5 text-xs text-mist-500">
                Prefilled from the record. A specific, clinically detailed description scores better
                than a terse one.
              </p>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label for="amount" class="label mb-1.5 block">Amount claimed (MYR)</label>
                <input
                  id="amount"
                  v-model.number="form.amountRequested"
                  type="number"
                  min="1"
                  step="0.01"
                  class="field tnum"
                  required
                />
                <p class="mt-1.5 text-xs text-mist-500">
                  Record total: {{ money(seed.record.totalCost) }}
                </p>
              </div>
              <div>
                <p class="label mb-1.5">Evidence attached</p>
                <p class="text-sm text-mist-200">
                  {{ seed.record.documents.length }} document{{
                    seed.record.documents.length === 1 ? '' : 's'
                  }}
                </p>
                <p class="mt-1.5 text-xs text-mist-500">
                  Verification weighs documentary completeness heavily — attach more on the record
                  first if you have it.
                </p>
              </div>
            </div>

            <div>
              <label for="model" class="label mb-1.5 block">Verification model</label>
              <select id="model" v-model="form.model" class="field">
                <option value="">
                  Platform default{{ gonkaModels ? ` (${gonkaModels.default})` : '' }}
                </option>
                <option v-for="m in gonkaModels?.models ?? []" :key="m" :value="m">{{ m }}</option>
              </select>
              <p class="mt-1.5 text-xs text-mist-500">
                The Gonka Router model that scores this claim's plausibility and drives the routing
                decision. Leave on the platform default unless you have a reason to change it.
              </p>
            </div>

            <div v-if="comparableModels.length > 0">
              <p class="label mb-1.5">Compare against other models (optional)</p>
              <div class="flex flex-wrap gap-x-5 gap-y-2">
                <label
                  v-for="m in comparableModels"
                  :key="m"
                  class="flex cursor-pointer items-center gap-2 text-sm text-mist-300"
                >
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-ink-600 bg-ink-800 text-gonka-500 focus:ring-gonka-500"
                    :checked="form.comparisonModels.includes(m)"
                    @change="toggleComparisonModel(m, ($event.target as HTMLInputElement).checked)"
                  />
                  {{ m }}
                </label>
              </div>
              <p class="mt-1.5 text-xs text-mist-500">
                Each checked model also scores this claim, shown side by side for reference — it never
                changes the routing decision, which is always the model selected above.
              </p>
            </div>
          </div>
        </section>

        <!-- Facts the policy's own contract clauses (not the AI trust check) turn on.
             Left blank, an affected clause comes back INCONCLUSIVE and routes the
             claim to a human regardless of Truth Score — see the note below the
             fields for exactly why this section exists. -->
        <section v-if="selectedPolicy?.productPlanId" class="surface p-5">
          <h2 class="mb-1 text-sm font-semibold tracking-tight text-mist-100">Contract context</h2>
          <p class="mb-4 text-xs leading-relaxed text-mist-500">
            This policy is written against a contract with clauses that need these facts to check
            automatically. Leaving one blank does not skip the check — it sends the claim to a human
            to confirm instead.
          </p>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label for="treatment-country" class="label mb-1.5 block">Treatment country</label>
              <input
                id="treatment-country"
                v-model="clauseContext.treatmentCountry"
                type="text"
                maxlength="2"
                placeholder="MY"
                class="field uppercase"
              />
              <p class="mt-1.5 text-xs text-mist-500">
                ISO country code — MY, SG or BN are within the covered territory.
              </p>
            </div>

            <div v-if="treatedAbroad">
              <label for="days-abroad" class="label mb-1.5 block">
                Consecutive days treated abroad
              </label>
              <input
                id="days-abroad"
                v-model.number="clauseContext.consecutiveDaysAbroad"
                type="number"
                min="0"
                class="field tnum"
              />
            </div>

            <div>
              <label for="facility-type" class="label mb-1.5 block">Facility type</label>
              <select id="facility-type" v-model="clauseContext.facilityType" class="field">
                <option value="">Unspecified</option>
                <option v-for="f in FACILITY_TYPES" :key="f.value" :value="f.value">
                  {{ f.label }}
                </option>
              </select>
            </div>

            <template v-if="hasRoomAndBoard">
              <div>
                <label for="room-rate" class="label mb-1.5 block">Daily room rate (MYR)</label>
                <input
                  id="room-rate"
                  v-model.number="clauseContext.roomRatePerDay"
                  type="number"
                  min="0"
                  step="1"
                  class="field tnum"
                />
              </div>
              <div>
                <label for="admission-days" class="label mb-1.5 block">Admission days</label>
                <input
                  id="admission-days"
                  v-model.number="clauseContext.admissionDays"
                  type="number"
                  min="0"
                  class="field tnum"
                />
              </div>
              <div>
                <label for="room-class" class="label mb-1.5 block">Room class (as billed)</label>
                <input
                  id="room-class"
                  v-model="clauseContext.roomClass"
                  type="text"
                  placeholder="e.g. Standard Single"
                  class="field"
                />
                <p class="mt-1.5 text-xs text-mist-500">
                  This record bills a Room & Board line item, so the room-entitlement clause needs
                  the daily rate and admission days to check it automatically.
                </p>
              </div>
            </template>
          </div>
        </section>

        <!-- The routing rule is stated before submission, not discovered afterwards. -->
        <section
          v-if="routingPreview"
          class="surface border-l-2 p-4"
          :class="routingPreview.withinLimit ? 'border-l-gonka-600' : 'border-l-amber-500'"
        >
          <p class="text-xs font-medium uppercase tracking-wider text-mist-500">
            What happens after submission
          </p>
          <p class="mt-1.5 text-sm leading-relaxed text-mist-200">{{ routingPreview.message }}</p>
          <p class="mt-2 text-xs text-mist-500">
            Policy threshold {{ routingPreview.threshold }} · auto-approval limit
            {{ money(routingPreview.limit) }}
          </p>
        </section>

        <p v-if="submitError" class="text-sm text-rose-300">{{ submitError }}</p>

        <div class="flex flex-wrap items-center gap-3">
          <button type="submit" class="btn-primary" :disabled="!canSubmit">
            Submit and verify
          </button>
          <button
            type="button"
            class="btn-ghost"
            :disabled="!canSubmit"
            @click="submit(false)"
          >
            Save as draft
          </button>
        </div>
      </form>

      <!-- ------------------------------------------------------- running -->
      <VerificationSteps v-else-if="phase === 'running'" :step-index="verify.stepIndex.value" />

      <!-- ---------------------------------------------------------- done -->
      <div
        v-else-if="phase === 'done' && verify.outcome.value && createdClaim"
        class="space-y-5"
      >
        <RoutingOutcomeCard
          :outcome="verify.outcome.value"
          :claim-number="createdClaim.claimNumber"
          :amount-requested="createdClaim.amountRequested"
        />

        <TruthScorePanel
          :verification="verify.outcome.value.verification"
          :threshold="verify.outcome.value.truthScoreThreshold"
          animate
        />

        <ModelComparisonPanel :verification="verify.outcome.value.verification" />

        <div class="flex flex-wrap gap-3">
          <RouterLink :to="`/hospital/claims/${createdClaim.id}`" class="btn-primary">
            View claim
          </RouterLink>
          <RouterLink to="/hospital/records" class="btn-ghost">Back to records</RouterLink>
        </div>
      </div>
    </template>
  </div>
</template>
