import type { Organization, Patient, User } from '@/lib/types'
import { ago } from './_time'

/**
 * Organizations — two hospitals (both on Manulife's provider panel), one TPA
 * (appointed by Manulife as the delegated claims administrator), and one
 * insurer. TPA is a genuine organisation type and role now, not a cosmetic
 * label on a hospital account.
 *
 * A single insurer — Manulife Insurance Berhad — underwrites every seeded
 * policy, written against the transcribed Manulife EZ-Med Deductible contract
 * (`muba_backend/app/features/clauses/clauses-manulife-ezmed.ts`). All five
 * seeded patients are Manulife policyholders, so cross-insurer scoping is no
 * longer part of this demo's story — the interesting contrast is tier
 * (PLATINUM vs GOLD) and TPA-delegated-limit vs insurer-escalated review.
 */
export const organizations: Organization[] = [
  {
    id: 'org_gleneagles',
    name: 'Gleneagles Kuala Lumpur — Manulife Panel Provider',
    type: 'hospital',
    registrationNo: 'HOSP-WP-199401-KL',
    address: '286 Jalan Ampang, 50450 Kuala Lumpur',
    contactEmail: 'claims@gleneagles-kl.example',
  },
  {
    id: 'org_mediassist',
    name: 'MediAssist Medical Centre — Manulife Panel Provider',
    type: 'hospital',
    registrationNo: 'HOSP-SGR-201108-PJ',
    address: 'Level 12, Menara Prisma, 46050 Petaling Jaya',
    contactEmail: 'ops@mediassist-medical.example',
  },
  {
    id: 'org_carecall_tpa',
    name: 'CareCall TPA Services — Appointed by Manulife',
    type: 'tpa',
    registrationNo: 'TPA-WP-201509-CC',
    address: 'Level 8, Menara IGB, 59200 Kuala Lumpur',
    contactEmail: 'ops@carecall-tpa.example',
  },
  {
    id: 'org_manulife',
    name: 'Manulife Insurance Berhad',
    type: 'insurer',
    registrationNo: 'INS-WP-197008-MN',
    address: 'Menara Manulife, 50450 Kuala Lumpur',
    contactEmail: 'health.claims@manulife.example',
  },
]

export const patients: Patient[] = [
  {
    id: 'pat_001',
    name: 'Nurul Aisyah binti Rahman',
    email: 'aisyah.rahman@example.com',
    phone: '+60 12-338 4471',
    dateOfBirth: '1991-04-17',
    gender: 'female',
    nationalId: '910417-14-5528',
    address: '18 Jalan Kerinchi Kiri 2, Bangsar South, 59200 Kuala Lumpur',
    bloodType: 'O+',
    policyIds: ['pol_001'],
    registeredAt: ago(412),
  },
  {
    id: 'pat_002',
    name: 'Tan Wei Ming',
    email: 'weiming.tan@example.com',
    phone: '+60 16-702 1183',
    dateOfBirth: '1984-11-02',
    gender: 'male',
    nationalId: '841102-10-6033',
    address: '7 Jalan SS2/24, 47300 Petaling Jaya, Selangor',
    bloodType: 'A+',
    policyIds: ['pol_002'],
    registeredAt: ago(298),
  },
  {
    id: 'pat_003',
    name: 'Rajesh Kumar a/l Subramaniam',
    email: 'rajesh.kumar@example.com',
    phone: '+60 19-445 9027',
    dateOfBirth: '1978-06-25',
    gender: 'male',
    nationalId: '780625-08-5119',
    address: '42 Lorong Maarof, Bangsar, 59100 Kuala Lumpur',
    bloodType: 'B+',
    policyIds: ['pol_003'],
    registeredAt: ago(233),
  },
  {
    id: 'pat_004',
    name: 'Siti Nadia binti Hassan',
    email: 'nadia.hassan@example.com',
    phone: '+60 13-820 7746',
    dateOfBirth: '1996-09-30',
    gender: 'female',
    nationalId: '960930-03-5842',
    address: '5 Jalan Setia Prima, Setia Alam, 40170 Shah Alam',
    bloodType: 'AB-',
    policyIds: ['pol_004'],
    registeredAt: ago(174),
  },
  {
    id: 'pat_005',
    name: 'Lim Jia Hui',
    email: 'jiahui.lim@example.com',
    phone: '+60 11-2673 5590',
    dateOfBirth: '1989-01-13',
    gender: 'female',
    nationalId: '890113-07-5264',
    address: '23A Jalan Gasing, 46000 Petaling Jaya, Selangor',
    bloodType: 'O-',
    policyIds: ['pol_005'],
    registeredAt: ago(121),
  },
]

/**
 * Demo accounts, one per role. `POST /api/auth/login` resolves to one of these;
 * the dev role-switcher swaps between them without re-authenticating.
 */
export const users: User[] = [
  {
    id: 'usr_patient',
    name: 'Nurul Aisyah binti Rahman',
    email: 'aisyah.rahman@example.com',
    role: 'patient',
    avatarInitials: 'NA',
    patientId: 'pat_001',
  },
  {
    id: 'usr_hospital',
    name: 'Dr. Farah Iskandar',
    email: 'f.iskandar@gleneagles-kl.example',
    role: 'hospital',
    avatarInitials: 'FI',
    orgId: 'org_gleneagles',
    orgName: 'Gleneagles Kuala Lumpur — Manulife Panel Provider',
    jobTitle: 'Claims & Billing Lead',
  },
  {
    id: 'usr_insurance',
    name: 'Adrian Yeoh',
    email: 'a.yeoh@manulife.example',
    role: 'insurance',
    avatarInitials: 'AY',
    orgId: 'org_manulife',
    orgName: 'Manulife Insurance Berhad',
    jobTitle: 'Senior Claims Assessor',
  },
  {
    id: 'usr_tpa',
    name: 'Michelle Wong',
    email: 'm.wong@carecall-tpa.example',
    role: 'tpa',
    avatarInitials: 'MW',
    orgId: 'org_carecall_tpa',
    orgName: 'CareCall TPA Services — Appointed by Manulife',
    jobTitle: 'Claims Administrator',
  },
]

export function findUserByRole(role: User['role']): User {
  const user = users.find((u) => u.role === role)
  if (!user) throw new Error(`No seeded user for role "${role}"`)
  return user
}
