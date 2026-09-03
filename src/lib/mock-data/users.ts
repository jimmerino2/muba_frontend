import type { Organization, Patient, User } from '@/lib/types'
import { ago } from './_time'

/**
 * Organizations — two care providers (one hospital, one TPA) and two insurers.
 * The TPA shares the `hospital` role experience; only `type` differs, which is
 * what drives "Hospital" vs "TPA" copy in the shell.
 */
export const organizations: Organization[] = [
  {
    id: 'org_gleneagles',
    name: 'Gleneagles Kuala Lumpur',
    type: 'hospital',
    registrationNo: 'HOSP-WP-199401-KL',
    address: '286 Jalan Ampang, 50450 Kuala Lumpur',
    contactEmail: 'claims@gleneagles-kl.example',
  },
  {
    id: 'org_mediassist',
    name: 'MediAssist TPA Sdn Bhd',
    type: 'tpa',
    registrationNo: 'TPA-SGR-201108-PJ',
    address: 'Level 12, Menara Prisma, 46050 Petaling Jaya',
    contactEmail: 'ops@mediassist-tpa.example',
  },
  {
    id: 'org_greateastern',
    name: 'Great Eastern Takaful',
    type: 'insurer',
    registrationNo: 'INS-WP-196512-GE',
    address: 'Menara Great Eastern, 50450 Kuala Lumpur',
    contactEmail: 'health.claims@greateastern.example',
  },
  {
    id: 'org_etiqa',
    name: 'Etiqa Insurance Berhad',
    type: 'insurer',
    registrationNo: 'INS-WP-197304-ET',
    address: 'Dataran Maybank, 59000 Kuala Lumpur',
    contactEmail: 'medical@etiqa.example',
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
    orgName: 'Gleneagles Kuala Lumpur',
    orgType: 'hospital',
    jobTitle: 'Claims & Billing Lead',
  },
  {
    id: 'usr_insurance',
    name: 'Adrian Yeoh',
    email: 'a.yeoh@greateastern.example',
    role: 'insurance',
    avatarInitials: 'AY',
    orgId: 'org_greateastern',
    orgName: 'Great Eastern Takaful',
    jobTitle: 'Senior Claims Assessor',
  },
]

export function findUserByRole(role: User['role']): User {
  const user = users.find((u) => u.role === role)
  if (!user) throw new Error(`No seeded user for role "${role}"`)
  return user
}
