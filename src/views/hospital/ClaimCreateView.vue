<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import type { Claim, Policy } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import { useVerificationRun } from '@/lib/useVerificationRun'
import * as hospitalsApi from '@/lib/api/hospitals'
import { money } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader.vue'
import TruthScorePanel from '@/components/TruthScorePanel.vue'
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

const form = ref({ policyId: '', treatmentDescription: '', amountRequested: 0 })

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
  const outcome = await verify.run(claim.id)
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
