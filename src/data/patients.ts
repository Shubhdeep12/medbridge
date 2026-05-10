/**
 * MedBridge Synthetic Patient Data
 * Realistic clinical scenarios for testing handover workflows
 */

import type { PatientRecord, Patient, VitalSign, NurseNote, LabResult } from '../types/index.js';

// ============================================================================
// Patient 1: John Doe - Pneumonia with deteriorating vitals
// Scenario: BP creeping up, confusion noted - tests abnormal trend detection
// ============================================================================

const johnDoePatient: Patient = {
  id: 'P1001',
  name: { first: 'John', last: 'Doe' },
  age: 78,
  gender: 'M',
  mrn: 'MRN-2024-001',
  diagnosis: ['Community Acquired Pneumonia', 'Hypertension', 'Type 2 Diabetes'],
  allergies: ['Penicillin', 'Sulfa drugs'],
  medications: ['Levofloxacin 750mg IV q24h', 'Lisinopril 10mg PO daily', 'Metformin 500mg PO BID', 'Acetaminophen PRN'],
  plan: 'Continue IV antibiotics for 48h, monitor vitals q4h, anticipate discharge after 2 negative fever readings and improving CXR'
};

const johnDoeVitals: VitalSign[] = [
  {
    timestamp: '2026-05-10T06:00:00Z',
    heartRate: 88,
    systolicBP: 132,
    diastolicBP: 84,
    respiratoryRate: 18,
    temperature: 37.2,
    oxygenSaturation: 94,
    painScore: 2
  },
  {
    timestamp: '2026-05-10T10:00:00Z',
    heartRate: 92,
    systolicBP: 138,
    diastolicBP: 88,
    respiratoryRate: 20,
    temperature: 37.8,
    oxygenSaturation: 93,
    painScore: 3
  },
  {
    timestamp: '2026-05-10T14:00:00Z',
    heartRate: 98,
    systolicBP: 142,
    diastolicBP: 90,
    respiratoryRate: 22,
    temperature: 38.4,
    oxygenSaturation: 92,
    painScore: 4
  },
  {
    timestamp: '2026-05-10T18:00:00Z',
    heartRate: 105,
    systolicBP: 148,
    diastolicBP: 92,
    respiratoryRate: 24,
    temperature: 38.6,
    oxygenSaturation: 91,
    painScore: 5
  },
  {
    timestamp: '2026-05-10T22:00:00Z',
    heartRate: 112,
    systolicBP: 155,
    diastolicBP: 95,
    respiratoryRate: 26,
    temperature: 38.9,
    oxygenSaturation: 90,
    painScore: 6
  }
];

const johnDoeNotes: NurseNote[] = [
  {
    timestamp: '2026-05-10T08:00:00Z',
    author: 'RN Sarah Chen',
    text: 'Patient alert and oriented x3. Reports mild chest discomfort with coughing. O2 sat 94% on 2L NC. Denies shortness of breath at rest. Tolerated breakfast well.',
    category: 'Progress'
  },
  {
    timestamp: '2026-05-10T14:30:00Z',
    author: 'RN Michael Torres',
    text: 'Patient appears more fatigued than previous shift. Temp elevated to 38.4C. States "I feel worse than this morning." O2 sat dropped to 92% on 2L, increased to 4L NC now at 94%. Notified resident on call.',
    category: 'Assessment'
  },
  {
    timestamp: '2026-05-10T19:00:00Z',
    author: 'RN Sarah Chen',
    text: 'Patient increasingly confused, oriented only to person. Not following commands consistently. Family at bedside concerned about mental status change. BP elevated 155/95. O2 requirements increased. Will notify attending.',
    category: 'Critical'
  },
  {
    timestamp: '2026-05-10T21:30:00Z',
    author: 'RN Michael Torres',
    text: 'Patient sleeping but arousable. When awake, appears confused about place and time. Family states this is not baseline mental status. Vitals remain concerning. Awaiting physician evaluation.',
    category: 'Assessment'
  }
];

const johnDoeLabs: LabResult[] = [
  { timestamp: '2026-05-10T06:00:00Z', testName: 'WBC', value: 12.5, unit: 'K/uL', referenceRange: '4.5-11.0', flag: 'HIGH' },
  { timestamp: '2026-05-10T06:00:00Z', testName: 'Creatinine', value: 1.2, unit: 'mg/dL', referenceRange: '0.7-1.3', flag: 'NORMAL' },
  { timestamp: '2026-05-10T18:00:00Z', testName: 'WBC', value: 15.8, unit: 'K/uL', referenceRange: '4.5-11.0', flag: 'CRITICAL' },
  { timestamp: '2026-05-10T18:00:00Z', testName: 'Creatinine', value: 1.4, unit: 'mg/dL', referenceRange: '0.7-1.3', flag: 'HIGH' },
  { timestamp: '2026-05-10T18:00:00Z', testName: 'Lactate', value: 2.8, unit: 'mmol/L', referenceRange: '0.5-2.2', flag: 'HIGH' }
];

// ============================================================================
// Patient 2: Jane Smith - Post-op ICU, stable but concerning lab
// Scenario: Elevated lactate unexplained, discharge plan conflicts with labs
// ============================================================================

const janeSmithPatient: Patient = {
  id: 'P1002',
  name: { first: 'Jane', last: 'Smith' },
  age: 45,
  gender: 'F',
  mrn: 'MRN-2024-002',
  diagnosis: ['Post-op Day 2 Laparoscopic Cholecystectomy', 'History of Anxiety'],
  allergies: ['Latex'],
  medications: ['Cefazolin 1g IV q8h', 'Ondansetron 4mg IV PRN', 'Morphine 2mg IV q4h PRN pain', 'Alprazolam 0.25mg PO BID'],
  plan: 'Continue current regimen, monitor for infection, plan discharge to home tomorrow if tolerating PO and pain controlled'
};

const janeSmithVitals: VitalSign[] = [
  {
    timestamp: '2026-05-10T06:00:00Z',
    heartRate: 76,
    systolicBP: 118,
    diastolicBP: 72,
    respiratoryRate: 16,
    temperature: 37.0,
    oxygenSaturation: 98,
    painScore: 3
  },
  {
    timestamp: '2026-05-10T10:00:00Z',
    heartRate: 80,
    systolicBP: 122,
    diastolicBP: 74,
    respiratoryRate: 16,
    temperature: 37.1,
    oxygenSaturation: 97,
    painScore: 2
  },
  {
    timestamp: '2026-05-10T14:00:00Z',
    heartRate: 82,
    systolicBP: 120,
    diastolicBP: 70,
    respiratoryRate: 18,
    temperature: 37.2,
    oxygenSaturation: 98,
    painScore: 2
  },
  {
    timestamp: '2026-05-10T18:00:00Z',
    heartRate: 78,
    systolicBP: 116,
    diastolicBP: 72,
    respiratoryRate: 16,
    temperature: 37.0,
    oxygenSaturation: 98,
    painScore: 1
  },
  {
    timestamp: '2026-05-10T22:00:00Z',
    heartRate: 74,
    systolicBP: 114,
    diastolicBP: 70,
    respiratoryRate: 14,
    temperature: 36.9,
    oxygenSaturation: 99,
    painScore: 1
  }
];

const janeSmithNotes: NurseNote[] = [
  {
    timestamp: '2026-05-10T08:00:00Z',
    author: 'RN Jennifer Walsh',
    text: 'Patient resting comfortably. Incision sites clean, dry, intact. Tolerated clear liquids without nausea. Ambulated to bathroom with minimal assistance. Reports pain 2/10. Vitals stable.',
    category: 'Progress'
  },
  {
    timestamp: '2026-05-10T14:00:00Z',
    author: 'RN David Park',
    text: 'Patient up in chair for lunch, tolerated regular diet well. No nausea or vomiting. Ambulated in hallway x2. Reports feeling "much better." Vitals remain stable. Patient asking about discharge timeline.',
    category: 'Progress'
  },
  {
    timestamp: '2026-05-10T18:30:00Z',
    author: 'RN Jennifer Walsh',
    text: 'Patient anxious about elevated lab value mentioned by resident. States "They said my lactate is high but I feel fine." Reassured patient that team is monitoring. Patient sleeping well now.',
    category: 'Assessment'
  },
  {
    timestamp: '2026-05-10T21:00:00Z',
    author: 'RN David Park',
    text: 'Patient resting, pain well controlled. No complaints. Incisions look good. Vitals stable throughout shift. Plan for discharge tomorrow remains per physician note.',
    category: 'Progress'
  }
];

const janeSmithLabs: LabResult[] = [
  { timestamp: '2026-05-10T06:00:00Z', testName: 'WBC', value: 9.2, unit: 'K/uL', referenceRange: '4.5-11.0', flag: 'NORMAL' },
  { timestamp: '2026-05-10T06:00:00Z', testName: 'Hemoglobin', value: 11.8, unit: 'g/dL', referenceRange: '12.0-16.0', flag: 'LOW' },
  { timestamp: '2026-05-10T06:00:00Z', testName: 'Lactate', value: 3.4, unit: 'mmol/L', referenceRange: '0.5-2.2', flag: 'HIGH' },
  { timestamp: '2026-05-10T18:00:00Z', testName: 'Lactate', value: 3.6, unit: 'mmol/L', referenceRange: '0.5-2.2', flag: 'HIGH' },
  { timestamp: '2026-05-10T18:00:00Z', testName: 'CRP', value: 45, unit: 'mg/L', referenceRange: '<10', flag: 'HIGH' }
];

// ============================================================================
// Patient 3: Carlos Ruiz - Long COVID, falls risk undocumented
// Scenario: Nursing notes highlight falls risk, attending plan omits it
// ============================================================================

const carlosRuizPatient: Patient = {
  id: 'P1003',
  name: { first: 'Carlos', last: 'Ruiz' },
  age: 60,
  gender: 'M',
  mrn: 'MRN-2024-003',
  diagnosis: ['Long COVID Syndrome', 'Atrial Fibrillation', 'Chronic Kidney Disease Stage 3', 'Anticoagulation Therapy'],
  allergies: ['Contrast dye', 'Shellfish'],
  medications: ['Apixaban 5mg PO BID', 'Metoprolol 50mg PO BID', 'Rivaroxaban 20mg PO daily', 'Multivitamin daily'],
  plan: 'Continue anticoagulation, monitor renal function, follow up with cardiology in 1 week, home health referral for physical therapy evaluation'
};

const carlosRuizVitals: VitalSign[] = [
  {
    timestamp: '2026-05-10T06:00:00Z',
    heartRate: 72,
    systolicBP: 128,
    diastolicBP: 78,
    respiratoryRate: 18,
    temperature: 36.8,
    oxygenSaturation: 96,
    painScore: 2
  },
  {
    timestamp: '2026-05-10T10:00:00Z',
    heartRate: 76,
    systolicBP: 130,
    diastolicBP: 80,
    respiratoryRate: 18,
    temperature: 36.9,
    oxygenSaturation: 95,
    painScore: 2
  },
  {
    timestamp: '2026-05-10T14:00:00Z',
    heartRate: 74,
    systolicBP: 126,
    diastolicBP: 76,
    respiratoryRate: 16,
    temperature: 36.7,
    oxygenSaturation: 96,
    painScore: 1
  },
  {
    timestamp: '2026-05-10T18:00:00Z',
    heartRate: 78,
    systolicBP: 132,
    diastolicBP: 82,
    respiratoryRate: 18,
    temperature: 37.0,
    oxygenSaturation: 95,
    painScore: 2
  },
  {
    timestamp: '2026-05-10T22:00:00Z',
    heartRate: 70,
    systolicBP: 124,
    diastolicBP: 74,
    respiratoryRate: 16,
    temperature: 36.8,
    oxygenSaturation: 97,
    painScore: 0
  }
];

const carlosRuizNotes: NurseNote[] = [
  {
    timestamp: '2026-05-10T08:00:00Z',
    author: 'RN Amanda Foster',
    text: 'Patient alert, ambulating independently to bathroom. Reports fatigue with activity but stable at rest. Fall risk assessment: Patient uses walker at home, reports 2 falls in past month. Recommended physical therapy consult.',
    category: 'Assessment'
  },
  {
    timestamp: '2026-05-10T12:00:00Z',
    author: 'RN Robert Kim',
    text: 'Patient up for lunch, nearly lost balance when standing from chair. Caught himself on bedside rail. States "My legs just gave out for a second." Repeated fall risk concern. Notified charge nurse.',
    category: 'Critical'
  },
  {
    timestamp: '2026-05-10T16:00:00Z',
    author: 'RN Amanda Foster',
    text: 'Patient placed on fall precautions per protocol. Bed alarm activated. Patient and family educated on call light use. Family states patient has fallen multiple times at home since COVID. Will continue monitoring closely.',
    category: 'Intervention'
  },
  {
    timestamp: '2026-05-10T20:00:00Z',
    author: 'RN Robert Kim',
    text: 'Patient resting, no further balance issues noted. Bed alarm remains on. Patient using call light appropriately. Family stayed late to ensure patient settled. Plan for PT eval tomorrow still pending.',
    category: 'Progress'
  }
];

const carlosRuizLabs: LabResult[] = [
  { timestamp: '2026-05-10T06:00:00Z', testName: 'eGFR', value: 52, unit: 'mL/min/1.73m2', referenceRange: '>60', flag: 'LOW' },
  { timestamp: '2026-05-10T06:00:00Z', testName: 'INR', value: 2.4, unit: '', referenceRange: '2.0-3.0', flag: 'NORMAL' },
  { timestamp: '2026-05-10T18:00:00Z', testName: 'eGFR', value: 50, unit: 'mL/min/1.73m2', referenceRange: '>60', flag: 'LOW' },
  { timestamp: '2026-05-10T18:00:00Z', testName: 'Hemoglobin', value: 11.2, unit: 'g/dL', referenceRange: '13.5-17.5', flag: 'LOW' }
];

// ============================================================================
// Patient Registry
// ============================================================================

export const patientRecords: Map<string, PatientRecord> = new Map([
  ['P1001', {
    patient: johnDoePatient,
    vitals: johnDoeVitals,
    notes: johnDoeNotes,
    labResults: johnDoeLabs
  }],
  ['P1002', {
    patient: janeSmithPatient,
    vitals: janeSmithVitals,
    notes: janeSmithNotes,
    labResults: janeSmithLabs
  }],
  ['P1003', {
    patient: carlosRuizPatient,
    vitals: carlosRuizVitals,
    notes: carlosRuizNotes,
    labResults: carlosRuizLabs
  }]
]);

// ============================================================================
// Helper Functions
// ============================================================================

export function getPatientRecord(patientId: string): PatientRecord | undefined {
  return patientRecords.get(patientId);
}

export function getAllPatientIds(): string[] {
  return Array.from(patientRecords.keys());
}

export function getPatientSummary(patientId: string): string {
  const record = patientRecords.get(patientId);
  if (!record) return '';
  
  const { patient } = record;
  return `${patient.name.last}, ${patient.name.first} (${patient.gender}, ${patient.age}y) - MRN: ${patient.mrn}`;
}
