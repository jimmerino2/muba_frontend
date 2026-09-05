import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import type { Role } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'

/**
 * Routes are grouped under role-prefixed segments so the guard is a single check
 * against `meta.role`, and each role's layout is scoped to its own subtree.
 */
const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/login' },

  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { public: true },
  },

  /**
   * Standalone — deliberately outside PatientLayout's children, so it never
   * renders the sidebar/nav chrome a not-yet-completed profile shouldn't be
   * navigating away from anyway. The guard below redirects every other
   * /patient/* route here until GET /api/patients/me comes back complete.
   */
  {
    path: '/patient/setup',
    name: 'patient-setup',
    component: () => import('@/views/patient/SetupView.vue'),
    meta: { role: 'patient' as Role, title: 'Complete your profile' },
  },

  /* ------------------------------------------------------------- patient */
  {
    path: '/patient',
    component: () => import('@/views/patient/PatientLayout.vue'),
    meta: { role: 'patient' as Role },
    children: [
      { path: '', redirect: '/patient/dashboard' },
      {
        path: 'dashboard',
        name: 'patient-dashboard',
        component: () => import('@/views/patient/DashboardView.vue'),
        meta: { title: 'Dashboard' },
      },
      {
        path: 'records',
        name: 'patient-records',
        component: () => import('@/views/patient/RecordsView.vue'),
        meta: { title: 'Medical records' },
      },
      {
        path: 'records/:recordId',
        name: 'patient-record-detail',
        component: () => import('@/views/patient/RecordDetailView.vue'),
        meta: { title: 'Record' },
      },
      {
        path: 'claims',
        name: 'patient-claims',
        component: () => import('@/views/patient/ClaimsView.vue'),
        meta: { title: 'Claims' },
      },
      {
        path: 'claims/:claimId',
        name: 'patient-claim-detail',
        component: () => import('@/views/patient/ClaimDetailView.vue'),
        meta: { title: 'Claim' },
      },
      {
        path: 'payments',
        name: 'patient-payments',
        component: () => import('@/views/patient/PaymentsView.vue'),
        meta: { title: 'Payments' },
      },
      {
        path: 'payments/:paymentId',
        name: 'patient-payment-detail',
        component: () => import('@/views/patient/PaymentDetailView.vue'),
        meta: { title: 'Payment' },
      },
    ],
  },

  /* ------------------------------------------------------------ hospital */
  {
    path: '/hospital',
    component: () => import('@/views/hospital/HospitalLayout.vue'),
    meta: { role: 'hospital' as Role },
    children: [
      { path: '', redirect: '/hospital/dashboard' },
      {
        path: 'dashboard',
        name: 'hospital-dashboard',
        component: () => import('@/views/hospital/DashboardView.vue'),
        meta: { title: 'Dashboard' },
      },
      {
        path: 'patients',
        name: 'hospital-patients',
        component: () => import('@/views/hospital/PatientsView.vue'),
        meta: { title: 'Patients' },
      },
      {
        path: 'patients/:patientId',
        name: 'hospital-patient-detail',
        component: () => import('@/views/hospital/PatientDetailView.vue'),
        meta: { title: 'Patient' },
      },
      {
        path: 'records',
        name: 'hospital-records',
        component: () => import('@/views/hospital/RecordsView.vue'),
        meta: { title: 'Medical records' },
      },
      {
        path: 'records/new',
        name: 'hospital-record-new',
        component: () => import('@/views/hospital/RecordCreateView.vue'),
        meta: { title: 'New record' },
      },
      {
        path: 'records/:recordId',
        name: 'hospital-record-detail',
        component: () => import('@/views/hospital/RecordDetailView.vue'),
        meta: { title: 'Record' },
      },
      {
        path: 'records/:recordId/claim',
        name: 'hospital-claim-new',
        component: () => import('@/views/hospital/ClaimCreateView.vue'),
        meta: { title: 'New claim' },
      },
      {
        path: 'claims',
        name: 'hospital-claims',
        component: () => import('@/views/hospital/ClaimsView.vue'),
        meta: { title: 'Claims' },
      },
      {
        path: 'claims/:claimId',
        name: 'hospital-claim-detail',
        component: () => import('@/views/hospital/ClaimDetailView.vue'),
        meta: { title: 'Claim' },
      },
      {
        path: 'payments',
        name: 'hospital-payments',
        component: () => import('@/views/hospital/PaymentsView.vue'),
        meta: { title: 'Payments' },
      },
      {
        path: 'payments/:paymentId',
        name: 'hospital-payment-detail',
        component: () => import('@/views/hospital/PaymentDetailView.vue'),
        meta: { title: 'Payment' },
      },
    ],
  },

  /* ----------------------------------------------------------- insurance */
  {
    path: '/insurance',
    component: () => import('@/views/insurance/InsuranceLayout.vue'),
    meta: { role: 'insurance' as Role },
    children: [
      { path: '', redirect: '/insurance/dashboard' },
      {
        path: 'dashboard',
        name: 'insurance-dashboard',
        component: () => import('@/views/insurance/DashboardView.vue'),
        meta: { title: 'Dashboard' },
      },
      {
        path: 'claims',
        name: 'insurance-claims',
        component: () => import('@/views/insurance/ClaimsView.vue'),
        meta: { title: 'Claims' },
      },
      {
        path: 'claims/:claimId',
        name: 'insurance-claim-detail',
        component: () => import('@/views/insurance/ClaimDetailView.vue'),
        meta: { title: 'Claim' },
      },
      {
        path: 'review',
        name: 'insurance-review',
        component: () => import('@/views/insurance/ReviewView.vue'),
        meta: { title: 'Review queue' },
      },
      {
        path: 'review/:claimId',
        name: 'insurance-review-detail',
        component: () => import('@/views/insurance/ReviewDetailView.vue'),
        meta: { title: 'Review' },
      },
      {
        path: 'policies',
        name: 'insurance-policies',
        component: () => import('@/views/insurance/PoliciesView.vue'),
        meta: { title: 'Policies' },
      },
      {
        path: 'policies/new',
        name: 'insurance-policy-new',
        component: () => import('@/views/insurance/PolicyFormView.vue'),
        meta: { title: 'New policy' },
      },
      {
        path: 'policies/:policyId',
        name: 'insurance-policy-detail',
        component: () => import('@/views/insurance/PolicyDetailView.vue'),
        meta: { title: 'Policy' },
      },
      {
        path: 'policies/:policyId/edit',
        name: 'insurance-policy-edit',
        component: () => import('@/views/insurance/PolicyFormView.vue'),
        meta: { title: 'Edit policy' },
      },
      {
        path: 'payments',
        name: 'insurance-payments',
        component: () => import('@/views/insurance/PaymentsView.vue'),
        meta: { title: 'Payments' },
      },
      {
        path: 'payments/:paymentId',
        name: 'insurance-payment-detail',
        component: () => import('@/views/insurance/PaymentDetailView.vue'),
        meta: { title: 'Payment' },
      },
    ],
  },

  /* ----------------------------------------------------------------- tpa */
  {
    path: '/tpa',
    component: () => import('@/views/tpa/TpaLayout.vue'),
    meta: { role: 'tpa' as Role },
    children: [
      { path: '', redirect: '/tpa/dashboard' },
      {
        path: 'dashboard',
        name: 'tpa-dashboard',
        component: () => import('@/views/tpa/DashboardView.vue'),
        meta: { title: 'Dashboard' },
      },
      {
        path: 'claims',
        name: 'tpa-claims',
        component: () => import('@/views/tpa/ClaimsView.vue'),
        meta: { title: 'Claims' },
      },
      {
        path: 'claims/:claimId',
        name: 'tpa-claim-detail',
        component: () => import('@/views/tpa/ClaimDetailView.vue'),
        meta: { title: 'Claim' },
      },
      {
        path: 'review',
        name: 'tpa-review',
        component: () => import('@/views/tpa/ReviewView.vue'),
        meta: { title: 'Review queue' },
      },
      {
        path: 'review/:claimId',
        name: 'tpa-review-detail',
        component: () => import('@/views/tpa/ReviewDetailView.vue'),
        meta: { title: 'Review' },
      },
      {
        path: 'payments',
        name: 'tpa-payments',
        component: () => import('@/views/tpa/PaymentsView.vue'),
        meta: { title: 'Payments' },
      },
      {
        path: 'payments/:paymentId',
        name: 'tpa-payment-detail',
        component: () => import('@/views/tpa/PaymentDetailView.vue'),
        meta: { title: 'Payment' },
      },
    ],
  },

  { path: '/:pathMatch(.*)*', redirect: '/login' },
]

export const HOME_FOR: Record<Role, string> = {
  patient: '/patient/dashboard',
  hospital: '/hospital/dashboard',
  insurance: '/insurance/dashboard',
  tpa: '/tpa/dashboard',
}

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (to.meta.public) {
    // A signed-in user hitting /login goes straight to their own dashboard.
    return auth.isAuthenticated && auth.role ? HOME_FOR[auth.role] : true
  }

  if (!auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  const required = to.meta.role as Role | undefined
  if (required && auth.role !== required) {
    return HOME_FOR[auth.role!]
  }

  // A patient with a blank profile (fresh account, never filled in phone/DOB/
  // etc.) is confined to /patient/setup until they submit it; a patient who
  // has already completed it is bounced away from setup rather than shown a
  // form with nothing left to do.
  if (auth.role === 'patient') {
    const complete = await auth.isPatientProfileComplete()
    if (!complete && to.name !== 'patient-setup') {
      return { path: '/patient/setup', query: { redirect: to.fullPath } }
    }
    if (complete && to.name === 'patient-setup') {
      return HOME_FOR.patient
    }
  }

  return true
})

router.afterEach((to) => {
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} · WayFare` : 'WayFare — Insurance Claims Coordination'
})
