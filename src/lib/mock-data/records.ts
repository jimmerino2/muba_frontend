import type { DocumentRef, MedicalRecord, RecordLineItem } from '@/lib/types'
import { ago } from './_time'

let docSeq = 0

function doc(name: string, kb: number, days: number, by: string): DocumentRef {
  docSeq += 1
  return {
    id: `doc_${String(docSeq).padStart(3, '0')}`,
    name,
    sizeBytes: Math.round(kb * 1024),
    mimeType: name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
    uploadedAt: ago(days),
    uploadedBy: by,
  }
}

type RecordSeed = Omit<MedicalRecord, 'totalCost' | 'currency'>

/** totalCost is always derived from the line items so the bill never disagrees with itself. */
function seal(seed: RecordSeed): MedicalRecord {
  return {
    ...seed,
    totalCost: seed.lineItems.reduce((sum, li) => sum + li.amount, 0),
    currency: 'MYR',
  }
}

const li = (
  description: string,
  category: RecordLineItem['category'],
  amount: number,
): RecordLineItem => ({ description, category, amount })

const GLEN = { hospitalId: 'org_gleneagles', hospitalName: 'Gleneagles Kuala Lumpur' }
const TPA = { hospitalId: 'org_mediassist', hospitalName: 'MediAssist TPA Sdn Bhd' }

export const medicalRecords: MedicalRecord[] = [
  seal({
    id: 'rec_001',
    recordNumber: 'MR-2026-1041',
    patientId: 'pat_001',
    patientName: 'Nurul Aisyah binti Rahman',
    ...GLEN,
    visitDate: ago(48),
    admissionType: 'inpatient',
    department: 'General Surgery',
    physician: 'Dr. Farah Iskandar',
    diagnosis: 'Acute appendicitis',
    icd10Code: 'K35.80',
    treatment: 'Laparoscopic appendectomy under general anaesthesia; 2-night inpatient stay.',
    lineItems: [
      li('Single room, 2 nights', 'Room & Board', 1_760),
      li('Laparoscopic appendectomy', 'Procedure', 7_400),
      li('Anaesthesia & recovery', 'Procedure', 1_850),
      li('Post-operative analgesia & antibiotics', 'Medication', 640),
      li('Abdominal ultrasound & bloods', 'Diagnostics', 750),
    ],
    notes:
      'Presented to ED with 14h right iliac fossa pain. Alvarado score 8. Uncomplicated laparoscopic course, discharged day 2 ambulating and afebrile.',
    documents: [
      doc('discharge-summary.pdf', 284, 46, 'Dr. Farah Iskandar'),
      doc('operative-note.pdf', 196, 47, 'Dr. Farah Iskandar'),
      doc('itemised-bill.pdf', 132, 46, 'Billing Office'),
    ],
    claimId: 'clm_001',
    createdAt: ago(46),
    createdBy: 'Dr. Farah Iskandar',
  }),

  seal({
    id: 'rec_002',
    recordNumber: 'MR-2026-1078',
    patientId: 'pat_002',
    patientName: 'Tan Wei Ming',
    ...GLEN,
    visitDate: ago(11),
    admissionType: 'outpatient',
    department: 'Orthopaedics',
    physician: 'Dr. Suresh Menon',
    diagnosis: 'Chronic lumbar radiculopathy',
    icd10Code: 'M54.16',
    treatment:
      'MRI lumbar spine with contrast, epidural steroid injection, and a 12-session physiotherapy programme.',
    lineItems: [
      li('MRI lumbar spine with contrast', 'Diagnostics', 3_200),
      li('Epidural steroid injection', 'Procedure', 4_800),
      li('Physiotherapy, 12 sessions', 'Procedure', 8_400),
      li('Orthopaedic consultation x3', 'Consultation', 1_350),
      li('Analgesia & muscle relaxants', 'Medication', 1_000),
    ],
    notes:
      'Third imaging study for the same complaint in 8 months. Prior MRI (Feb) reported only mild L4/L5 disc bulge. Patient requested the extended physiotherapy block.',
    documents: [
      doc('mri-report.pdf', 512, 10, 'Radiology'),
      doc('physio-plan.pdf', 88, 10, 'Dr. Suresh Menon'),
    ],
    claimId: 'clm_002',
    createdAt: ago(10),
    createdBy: 'Dr. Suresh Menon',
  }),

  seal({
    id: 'rec_003',
    recordNumber: 'MR-2026-1085',
    patientId: 'pat_003',
    patientName: 'Rajesh Kumar a/l Subramaniam',
    ...TPA,
    visitDate: ago(7),
    admissionType: 'day-surgery',
    department: 'Gastroenterology',
    physician: 'Dr. Cheryl Ng',
    diagnosis: 'Gastro-oesophageal reflux disease with dysphagia',
    icd10Code: 'K21.00',
    treatment: 'Diagnostic oesophagogastroduodenoscopy with biopsy under sedation.',
    lineItems: [
      li('OGD with biopsy', 'Procedure', 2_400),
      li('Conscious sedation', 'Procedure', 620),
      li('Histopathology', 'Diagnostics', 480),
      li('Specialist consultation', 'Consultation', 350),
    ],
    notes:
      'Six-month history of reflux unresponsive to PPI. Findings consistent with LA Grade B oesophagitis. Biopsy negative for dysplasia.',
    documents: [doc('endoscopy-report.pdf', 240, 6, 'Dr. Cheryl Ng')],
    claimId: 'clm_003',
    createdAt: ago(6),
    createdBy: 'Nurul Izzati (Claims Officer)',
  }),

  seal({
    id: 'rec_004',
    recordNumber: 'MR-2026-1091',
    patientId: 'pat_004',
    patientName: 'Siti Nadia binti Hassan',
    ...GLEN,
    visitDate: ago(3),
    admissionType: 'emergency',
    department: 'Emergency Medicine',
    physician: 'Dr. Amir Zulkifli',
    diagnosis: 'Acute asthma exacerbation',
    icd10Code: 'J45.901',
    treatment: 'Nebulised salbutamol/ipratropium, IV hydrocortisone, 6h observation.',
    lineItems: [
      li('Emergency department attendance', 'Consultation', 420),
      li('Nebulisation & IV steroids', 'Medication', 780),
      li('Chest X-ray & ABG', 'Diagnostics', 560),
      li('Observation bay, 6 hours', 'Room & Board', 420),
    ],
    notes:
      'Peak flow 42% predicted on arrival, improved to 81% after two nebulisations. Discharged with a step-up inhaled corticosteroid plan.',
    documents: [doc('ed-notes.pdf', 154, 3, 'Dr. Amir Zulkifli')],
    claimId: 'clm_004',
    createdAt: ago(3),
    createdBy: 'Dr. Amir Zulkifli',
  }),

  seal({
    id: 'rec_005',
    recordNumber: 'MR-2026-1094',
    patientId: 'pat_005',
    patientName: 'Lim Jia Hui',
    ...GLEN,
    visitDate: ago(2),
    admissionType: 'day-surgery',
    department: 'Orthopaedics',
    physician: 'Dr. Suresh Menon',
    diagnosis: 'Medial meniscus tear, right knee',
    icd10Code: 'S83.241A',
    treatment: 'Arthroscopic partial medial meniscectomy, right knee.',
    lineItems: [
      li('Knee arthroscopy & meniscectomy', 'Procedure', 6_800),
      li('Anaesthesia', 'Procedure', 1_200),
      li('Day-surgery suite', 'Room & Board', 900),
      li('MRI right knee', 'Diagnostics', 1_400),
      li('Post-op analgesia', 'Medication', 300),
    ],
    notes:
      'Injury sustained during recreational futsal 5 weeks prior. MRI confirmed a bucket-handle tear. Uneventful day-case procedure.',
    documents: [
      doc('mri-knee.pdf', 468, 4, 'Radiology'),
      doc('operative-note.pdf', 178, 2, 'Dr. Suresh Menon'),
    ],
    claimId: 'clm_005',
    createdAt: ago(2),
    createdBy: 'Dr. Suresh Menon',
  }),

  seal({
    id: 'rec_006',
    recordNumber: 'MR-2026-1063',
    patientId: 'pat_001',
    patientName: 'Nurul Aisyah binti Rahman',
    ...GLEN,
    visitDate: ago(22),
    admissionType: 'inpatient',
    department: 'Internal Medicine',
    physician: 'Dr. Lee Kar Wai',
    diagnosis: 'Dengue fever with warning signs',
    icd10Code: 'A97.1',
    treatment: 'Inpatient monitoring, IV fluid resuscitation, serial FBC; 3-night stay.',
    lineItems: [
      li('Twin-share room, 3 nights', 'Room & Board', 1_980),
      li('IV fluids & supportive care', 'Medication', 1_240),
      li('Serial full blood counts & NS1', 'Diagnostics', 2_100),
      li('Daily physician review', 'Consultation', 1_050),
      li('Nursing & monitoring', 'Procedure', 2_050),
    ],
    notes:
      'Platelet nadir 68 x10^9/L on day 3 with no bleeding. Defervesced day 4, discharged with outpatient FBC follow-up.',
    documents: [
      doc('discharge-summary.pdf', 262, 19, 'Dr. Lee Kar Wai'),
      doc('lab-trend.pdf', 96, 19, 'Pathology'),
    ],
    claimId: 'clm_006',
    createdAt: ago(19),
    createdBy: 'Dr. Lee Kar Wai',
  }),

  seal({
    id: 'rec_007',
    recordNumber: 'MR-2026-1052',
    patientId: 'pat_002',
    patientName: 'Tan Wei Ming',
    ...TPA,
    visitDate: ago(34),
    admissionType: 'day-surgery',
    department: 'ENT',
    physician: 'Dr. Priya Raman',
    diagnosis: 'Deviated nasal septum',
    icd10Code: 'J34.2',
    treatment: 'Septorhinoplasty with dorsal hump reduction and tip refinement.',
    lineItems: [
      li('Septorhinoplasty', 'Procedure', 11_500),
      li('Anaesthesia', 'Procedure', 1_400),
      li('Day-surgery suite', 'Room & Board', 800),
      li('Post-op medication', 'Medication', 500),
    ],
    notes:
      'Patient reports intermittent nasal obstruction. No rhinomanometry or CT performed. Operative note describes dorsal hump reduction and tip refinement alongside septal correction.',
    documents: [doc('operative-note.pdf', 188, 33, 'Dr. Priya Raman')],
    claimId: 'clm_007',
    createdAt: ago(33),
    createdBy: 'Nurul Izzati (Claims Officer)',
  }),

  seal({
    id: 'rec_008',
    recordNumber: 'MR-2026-1029',
    patientId: 'pat_004',
    patientName: 'Siti Nadia binti Hassan',
    ...GLEN,
    visitDate: ago(61),
    admissionType: 'day-surgery',
    department: 'Oncology',
    physician: 'Dr. Hafiz Rahim',
    diagnosis: 'Invasive ductal carcinoma, right breast — stage IIB',
    icd10Code: 'C50.411',
    treatment: 'Adjuvant chemotherapy cycle 3 of 6 (docetaxel/cyclophosphamide) in day-care unit.',
    lineItems: [
      li('Chemotherapy agents, cycle 3', 'Medication', 18_400),
      li('Day-care infusion suite', 'Room & Board', 1_600),
      li('Pre-chemo bloods & cardiac echo', 'Diagnostics', 3_200),
      li('Oncology review & administration', 'Consultation', 1_800),
      li('Antiemetics & GCSF support', 'Medication', 2_500),
    ],
    notes:
      'Third of six planned adjuvant cycles. LVEF stable at 62%. Cycle delivered in full with no dose reduction.',
    documents: [
      doc('oncology-plan.pdf', 340, 62, 'Dr. Hafiz Rahim'),
      doc('infusion-record.pdf', 118, 60, 'Day-care Unit'),
      doc('pathology-report.pdf', 402, 88, 'Pathology'),
    ],
    claimId: 'clm_008',
    createdAt: ago(60),
    createdBy: 'Dr. Hafiz Rahim',
  }),

  seal({
    id: 'rec_009',
    recordNumber: 'MR-2026-0998',
    patientId: 'pat_003',
    patientName: 'Rajesh Kumar a/l Subramaniam',
    ...TPA,
    visitDate: ago(88),
    admissionType: 'day-surgery',
    department: 'Ophthalmology',
    physician: 'Dr. Cheryl Ng',
    diagnosis: 'Age-related nuclear cataract, left eye',
    icd10Code: 'H25.12',
    treatment: 'Phacoemulsification with monofocal intraocular lens implant, left eye.',
    lineItems: [
      li('Phacoemulsification & IOL', 'Procedure', 3_400),
      li('Monofocal intraocular lens', 'Procedure', 700),
      li('Biometry & pre-op assessment', 'Diagnostics', 400),
      li('Topical antibiotics & steroids', 'Medication', 250),
    ],
    notes:
      'Pre-op BCVA 6/24 left eye, improved to 6/7.5 at one-week review. No intra-operative complications.',
    documents: [doc('op-report-left-eye.pdf', 210, 87, 'Dr. Cheryl Ng')],
    claimId: 'clm_009',
    createdAt: ago(87),
    createdBy: 'Nurul Izzati (Claims Officer)',
  }),

  seal({
    id: 'rec_010',
    recordNumber: 'MR-2026-1096',
    patientId: 'pat_005',
    patientName: 'Lim Jia Hui',
    ...GLEN,
    visitDate: ago(1),
    admissionType: 'outpatient',
    department: 'Internal Medicine',
    physician: 'Dr. Lee Kar Wai',
    diagnosis: 'Acute gastritis',
    icd10Code: 'K29.00',
    treatment: 'Outpatient consultation, PPI course and dietary advice.',
    lineItems: [
      li('Specialist consultation', 'Consultation', 320),
      li('Proton pump inhibitor, 14 days', 'Medication', 180),
      li('H. pylori breath test', 'Diagnostics', 120),
    ],
    notes: 'Symptoms attributed to NSAID use post-arthroscopy. NSAIDs stopped, PPI cover started.',
    documents: [],
    claimId: 'clm_010',
    createdAt: ago(1),
    createdBy: 'Dr. Lee Kar Wai',
  }),

  seal({
    id: 'rec_011',
    recordNumber: 'MR-2026-1071',
    patientId: 'pat_002',
    patientName: 'Tan Wei Ming',
    ...GLEN,
    visitDate: ago(15),
    admissionType: 'inpatient',
    department: 'Cardiology',
    physician: 'Dr. Hafiz Rahim',
    diagnosis: 'Non-ST elevation myocardial infarction',
    icd10Code: 'I21.4',
    treatment:
      'Coronary angiogram with drug-eluting stent to the LAD; 3-night coronary care unit stay.',
    lineItems: [
      li('Coronary angiography', 'Procedure', 9_800),
      li('PCI with drug-eluting stent', 'Procedure', 24_500),
      li('Coronary care unit, 3 nights', 'Room & Board', 6_600),
      li('Dual antiplatelet & statin therapy', 'Medication', 1_900),
      li('Serial troponin, ECG & echo', 'Diagnostics', 4_000),
    ],
    notes:
      'Presented with 3h central chest pain, troponin 1,840 ng/L, dynamic ECG changes. 95% proximal LAD lesion stented. TIMI 3 flow post-procedure.',
    documents: [
      doc('angiogram-report.pdf', 620, 14, 'Cardiac Cath Lab'),
      doc('ccu-discharge-summary.pdf', 296, 12, 'Dr. Hafiz Rahim'),
      doc('ecg-series.pdf', 480, 15, 'Cardiology'),
    ],
    claimId: 'clm_011',
    createdAt: ago(12),
    createdBy: 'Dr. Hafiz Rahim',
  }),

  seal({
    id: 'rec_012',
    recordNumber: 'MR-2026-1088',
    patientId: 'pat_004',
    patientName: 'Siti Nadia binti Hassan',
    ...GLEN,
    visitDate: ago(9),
    admissionType: 'outpatient',
    department: 'Dermatology',
    physician: 'Dr. Priya Raman',
    diagnosis: 'Benign melanocytic naevus requiring excision',
    icd10Code: 'D22.5',
    treatment: 'Excision biopsy of a 9mm pigmented lesion on the upper back, with histology.',
    lineItems: [
      li('Excision biopsy under local anaesthesia', 'Procedure', 1_450),
      li('Histopathology', 'Diagnostics', 620),
      li('Dermatology consultation', 'Consultation', 380),
      li('Wound dressing & antibiotics', 'Medication', 210),
    ],
    notes:
      'Lesion showed recent change in border and colour; excised with 2mm margin. Histology benign, margins clear.',
    documents: [
      doc('dermoscopy-images.jpg', 1_240, 9, 'Dr. Priya Raman'),
      doc('histology-report.pdf', 176, 7, 'Pathology'),
    ],
    claimId: 'clm_012',
    createdAt: ago(8),
    createdBy: 'Dr. Priya Raman',
  }),

  seal({
    id: 'rec_015',
    recordNumber: 'MR-2026-1082',
    patientId: 'pat_001',
    patientName: 'Nurul Aisyah binti Rahman',
    ...GLEN,
    visitDate: ago(13),
    admissionType: 'day-surgery',
    department: 'ENT',
    physician: 'Dr. Priya Raman',
    diagnosis: 'Recurrent tonsillitis',
    icd10Code: 'J35.01',
    treatment: 'Bilateral tonsillectomy under general anaesthesia, day-case.',
    lineItems: [
      li('Bilateral tonsillectomy', 'Procedure', 4_200),
      li('Anaesthesia', 'Procedure', 1_100),
      li('Day-surgery suite', 'Room & Board', 900),
      li('ENT consultation & nasoendoscopy', 'Consultation', 480),
      li('Post-op analgesia & antibiotics', 'Medication', 220),
    ],
    notes:
      'Three documented episodes of culture-positive tonsillitis in the past 12 months. Patient reports further untreated episodes not seen at this centre.',
    documents: [
      doc('ent-clinic-notes.pdf', 164, 20, 'Dr. Priya Raman'),
      doc('operative-note.pdf', 172, 13, 'Dr. Priya Raman'),
    ],
    claimId: 'clm_013',
    createdAt: ago(12),
    createdBy: 'Dr. Priya Raman',
  }),

  /* ---- Records with no claim raised yet — targets for the "create claim" flow ---- */

  seal({
    id: 'rec_013',
    recordNumber: 'MR-2026-1099',
    patientId: 'pat_003',
    patientName: 'Rajesh Kumar a/l Subramaniam',
    ...GLEN,
    visitDate: ago(1, 6),
    admissionType: 'outpatient',
    department: 'Endocrinology',
    physician: 'Dr. Lee Kar Wai',
    diagnosis: 'Type 2 diabetes mellitus, poorly controlled',
    icd10Code: 'E11.65',
    treatment: 'Quarterly review, HbA1c and renal profile, insulin regimen adjustment.',
    lineItems: [
      li('Endocrinology consultation', 'Consultation', 380),
      li('HbA1c, renal profile & lipids', 'Diagnostics', 460),
      li('Basal insulin, 3 months', 'Medication', 890),
      li('Diabetic foot & retinal screening', 'Diagnostics', 340),
    ],
    notes: 'HbA1c 8.9% (from 9.4%). Basal insulin uptitrated; dietitian referral made.',
    documents: [doc('lab-results.pdf', 142, 1, 'Pathology')],
    claimId: null,
    createdAt: ago(1, 5),
    createdBy: 'Dr. Lee Kar Wai',
  }),

  seal({
    id: 'rec_014',
    recordNumber: 'MR-2026-1100',
    patientId: 'pat_001',
    patientName: 'Nurul Aisyah binti Rahman',
    ...GLEN,
    visitDate: ago(0, 5),
    admissionType: 'emergency',
    department: 'Emergency Medicine',
    physician: 'Dr. Amir Zulkifli',
    diagnosis: 'Closed fracture of distal radius, left wrist',
    icd10Code: 'S52.501A',
    treatment: 'Closed reduction and below-elbow cast application under haematoma block.',
    lineItems: [
      li('Emergency department attendance', 'Consultation', 420),
      li('Closed reduction & casting', 'Procedure', 2_300),
      li('Wrist X-ray, pre and post', 'Diagnostics', 520),
      li('Haematoma block & analgesia', 'Medication', 380),
    ],
    notes:
      'Fall onto outstretched hand. Post-reduction films show acceptable alignment. Orthopaedic follow-up in one week.',
    documents: [doc('wrist-xray.jpg', 980, 0, 'Radiology')],
    claimId: null,
    createdAt: ago(0, 4),
    createdBy: 'Dr. Amir Zulkifli',
  }),
]
