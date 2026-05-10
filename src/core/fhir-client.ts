/**
 * MedBridge FHIR Client
 * Production FHIR R4 client for fetching patient data and creating resources
 * Uses SHARP context for authentication and endpoint resolution
 */

import type { 
  SHARPContext, 
  PatientRecord, 
  Patient,
  VitalSign,
  NurseNote,
  LabResult,
  FHIRPatient,
  FHIRObservation 
} from '../types/index.js';
import { getPatientRecord as getDemoPatient } from '../data/patients.js';

// ============================================================================
// Configuration
// ============================================================================

// DEMO_MODE must be explicitly enabled - never falls back to synthetic data in production
const DEMO_MODE = process.env.DEMO_MODE === 'true';

// ============================================================================
// Main FHIR Fetch Function
// ============================================================================

export async function fetchPatientRecord(
  patientId: string,
  context?: SHARPContext | null
): Promise<PatientRecord | null> {
  
  // DEMO_MODE: Use synthetic data only when explicitly enabled
  if (DEMO_MODE) {
    console.log(`[DEMO MODE] Using synthetic data for patient ${patientId}`);
    const demoRecord = getDemoPatient(patientId);
    return demoRecord || null;
  }
  
  // Production: FHIR context is required
  if (!context) {
    throw new Error('FHIR context required (X-FHIR-Server-URL, X-FHIR-Access-Token, X-Patient-ID headers)');
  }
  
  // Fetch from actual FHIR server
  try {
    console.log(`[FHIR] Fetching patient ${patientId} from ${context.fhirServerUrl}`);
    
    const [patient, vitals, notes, labs] = await Promise.all([
      fetchFHIRPatient(context, patientId),
      fetchFHIRVitals(context, patientId),
      fetchFHIRNotes(context, patientId),
      fetchFHIRLabs(context, patientId)
    ]);
    
    if (!patient) {
      throw new Error(`Patient ${patientId} not found in FHIR server`);
    }
    
    return {
      patient,
      vitals,
      notes,
      labResults: labs
    };
    
  } catch (error) {
    console.error('[FHIR] Error fetching patient data:', error);
    throw new Error(`Failed to fetch patient ${patientId} from FHIR server: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================================================
// FHIR Resource Fetchers
// ============================================================================

async function fetchFHIRPatient(
  context: SHARPContext,
  patientId: string
): Promise<Patient | null> {
  
  const url = `${context.fhirServerUrl}/Patient/${patientId}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${context.fhirAccessToken}`,
        'Accept': 'application/fhir+json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`FHIR error: ${response.status} ${response.statusText}`);
    }
    
    const fhirPatient: FHIRPatient = await response.json();
    
    return transformFHIRPatient(fhirPatient);
    
  } catch (error) {
    console.error('[FHIR] Error fetching Patient:', error);
    return null;
  }
}

async function fetchFHIRVitals(
  context: SHARPContext,
  patientId: string
): Promise<VitalSign[]> {
  
  const url = new URL(`${context.fhirServerUrl}/Observation`);
  url.searchParams.set('patient', patientId);
  url.searchParams.set('category', 'vital-signs');
  url.searchParams.set('_sort', '-date');
  url.searchParams.set('_count', '50');
  
  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${context.fhirAccessToken}`,
        'Accept': 'application/fhir+json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`FHIR error: ${response.status}`);
    }
    
    const bundle = await response.json();
    const observations: FHIRObservation[] = bundle.entry?.map((e: { resource: FHIRObservation }) => e.resource) || [];
    
    return transformFHIRVitals(observations);
    
  } catch (error) {
    console.error('[FHIR] Error fetching vitals:', error);
    return [];
  }
}

async function fetchFHIRNotes(
  context: SHARPContext,
  patientId: string
): Promise<NurseNote[]> {
  
  // Try DocumentReference for clinical notes
  const url = new URL(`${context.fhirServerUrl}/DocumentReference`);
  url.searchParams.set('patient', patientId);
  url.searchParams.set('type', 'nurse-note');
  url.searchParams.set('_sort', '-date');
  url.searchParams.set('_count', '20');
  
  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${context.fhirAccessToken}`,
        'Accept': 'application/fhir+json'
      }
    });
    
    if (!response.ok) {
      // Try DiagnosticReport as fallback
      return fetchFHIRDiagnosticReports(context, patientId);
    }
    
    const bundle = await response.json();
    const docs = bundle.entry?.map((e: { resource: unknown }) => e.resource) || [];
    
    return docs.map((doc: { date?: string; author?: Array<{ display?: string }>; content?: Array<{ attachment?: { data?: string; contentType?: string } }>; description?: string }) => ({
      timestamp: doc.date || new Date().toISOString(),
      author: doc.author?.[0]?.display || 'Unknown',
      text: doc.content?.[0]?.attachment?.data 
        ? Buffer.from(doc.content[0].attachment.data, 'base64').toString('utf-8')
        : doc.description || 'No content',
      category: 'Note'
    }));
    
  } catch (error) {
    console.error('[FHIR] Error fetching notes:', error);
    return [];
  }
}

async function fetchFHIRDiagnosticReports(
  context: SHARPContext,
  patientId: string
): Promise<NurseNote[]> {
  
  const url = new URL(`${context.fhirServerUrl}/DiagnosticReport`);
  url.searchParams.set('patient', patientId);
  url.searchParams.set('_sort', '-date');
  url.searchParams.set('_count', '20');
  
  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${context.fhirAccessToken}`,
        'Accept': 'application/fhir+json'
      }
    });
    
    if (!response.ok) return [];
    
    const bundle = await response.json();
    const reports = bundle.entry?.map((e: { resource: unknown }) => e.resource) || [];
    
    return reports.map((report: { issued?: string; performer?: Array<{ display?: string }>; conclusion?: string; presentedForm?: Array<{ data?: string }> }) => ({
      timestamp: report.issued || new Date().toISOString(),
      author: report.performer?.[0]?.display || 'Unknown',
      text: report.conclusion || (report.presentedForm?.[0]?.data 
        ? Buffer.from(report.presentedForm[0].data, 'base64').toString('utf-8')
        : 'No conclusion'),
      category: 'Report'
    }));
    
  } catch (error) {
    console.error('[FHIR] Error fetching diagnostic reports:', error);
    return [];
  }
}

async function fetchFHIRLabs(
  context: SHARPContext,
  patientId: string
): Promise<LabResult[]> {
  
  const url = new URL(`${context.fhirServerUrl}/Observation`);
  url.searchParams.set('patient', patientId);
  url.searchParams.set('category', 'laboratory');
  url.searchParams.set('_sort', '-date');
  url.searchParams.set('_count', '30');
  
  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${context.fhirAccessToken}`,
        'Accept': 'application/fhir+json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`FHIR error: ${response.status}`);
    }
    
    const bundle = await response.json();
    const observations: FHIRObservation[] = bundle.entry?.map((e: { resource: FHIRObservation }) => e.resource) || [];
    
    return transformFHIRLabs(observations);
    
  } catch (error) {
    console.error('[FHIR] Error fetching labs:', error);
    return [];
  }
}

// ============================================================================
// FHIR Transformers
// ============================================================================

function transformFHIRPatient(fhirPatient: FHIRPatient): Patient {
  const name = fhirPatient.name?.[0];
  const given = name?.given || [];
  
  // Calculate age from birthDate
  let age = 0;
  if (fhirPatient.birthDate) {
    const birthDate = new Date(fhirPatient.birthDate);
    const today = new Date();
    age = today.getFullYear() - birthDate.getFullYear();
    if (today.getMonth() < birthDate.getMonth() || 
        (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) {
      age--;
    }
  }
  
  return {
    id: fhirPatient.id,
    name: {
      first: given[0] || 'Unknown',
      last: name?.family || 'Unknown'
    },
    age,
    gender: (fhirPatient.gender?.toUpperCase() as 'M' | 'F' | 'O') || 'O',
    mrn: fhirPatient.id,
    diagnosis: [], // Would need Condition resources
    plan: 'See care plan in EHR'
  };
}

function transformFHIRVitals(observations: FHIRObservation[]): VitalSign[] {
  const vitalsByTime: Map<string, Partial<VitalSign>> = new Map();
  
  observations.forEach(obs => {
    const time = obs.effectiveDateTime;
    if (!time) return;
    
    if (!vitalsByTime.has(time)) {
      vitalsByTime.set(time, { timestamp: time });
    }
    
    const vital = vitalsByTime.get(time)!;
    const code = obs.code?.coding?.[0]?.code;
    const value = obs.valueQuantity?.value;
    
    if (!code || value === undefined) return;
    
    // Map LOINC codes to vital sign fields
    switch (code) {
      case '8867-4': // Heart rate
        vital.heartRate = value;
        break;
      case '8480-6': // Systolic BP
        vital.systolicBP = value;
        break;
      case '8462-4': // Diastolic BP
        vital.diastolicBP = value;
        break;
      case '8310-5': // Body temperature
        vital.temperature = value;
        break;
      case '59408-5': // O2 saturation
      case '2708-6': // O2 saturation
        vital.oxygenSaturation = value;
        break;
      case '9279-1': // Respiratory rate
        vital.respiratoryRate = value;
        break;
      case '72514-3': // Pain score
        vital.painScore = value;
        break;
    }
  });
  
  return Array.from(vitalsByTime.values())
    .filter(v => v.timestamp)
    .map(v => ({
      timestamp: v.timestamp!,
      heartRate: v.heartRate,
      systolicBP: v.systolicBP,
      diastolicBP: v.diastolicBP,
      temperature: v.temperature,
      oxygenSaturation: v.oxygenSaturation,
      respiratoryRate: v.respiratoryRate,
      painScore: v.painScore
    }))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function transformFHIRLabs(observations: FHIRObservation[]): LabResult[] {
  return observations
    .filter(obs => obs.valueQuantity?.value !== undefined)
    .map(obs => {
      const value = obs.valueQuantity!.value!;
      const unit = obs.valueQuantity!.unit || '';
      const testName = obs.code?.coding?.[0]?.display || (obs.code as { text?: string })?.text || 'Unknown';
      
      // Determine flag based on reference range
      let flag: LabResult['flag'] = 'NORMAL';
      const refRange = (obs as { referenceRange?: Array<{ low?: { value?: number }; high?: { value?: number } }> }).referenceRange?.[0];
      if (refRange) {
        const low = refRange.low?.value;
        const high = refRange.high?.value;
        if (low !== undefined && value < low) flag = 'LOW';
        if (high !== undefined && value > high) flag = 'HIGH';
      }
      
      return {
        timestamp: obs.effectiveDateTime || new Date().toISOString(),
        testName,
        value,
        unit,
        referenceRange: refRange ? `${refRange.low?.value || ''}-${refRange.high?.value || ''}` : undefined,
        flag
      };
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ============================================================================
// Utility Functions
// ============================================================================

export async function createFHIREscalation(
  context: SHARPContext,
  patientId: string,
  level: string,
  message: string
): Promise<{ status: string; resourceId?: string }> {
  
  const url = `${context.fhirServerUrl}/CommunicationRequest`;
  
  const communicationRequest = {
    resourceType: 'CommunicationRequest',
    status: 'active',
    priority: level === 'CRITICAL' ? 'stat' : level === 'HIGH' ? 'asap' : 'routine',
    subject: {
      reference: `Patient/${patientId}`
    },
    payload: [
      {
        contentString: message
      }
    ],
    authoredOn: new Date().toISOString(),
    recipient: [
      {
        reference: 'Practitioner/attending-on-call',
        display: 'Attending Physician On-Call'
      }
    ]
  };
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.fhirAccessToken}`,
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json'
      },
      body: JSON.stringify(communicationRequest)
    });
    
    if (!response.ok) {
      throw new Error(`FHIR error: ${response.status}`);
    }
    
    const result = await response.json();
    
    return {
      status: 'SENT',
      resourceId: result.id
    };
    
  } catch (error) {
    console.error('[FHIR] Error creating escalation:', error);
    return {
      status: 'FAILED'
    };
  }
}
