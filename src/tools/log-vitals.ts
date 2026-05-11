/**
 * Log Vitals Tool
 * Creates new FHIR Observation resources for vital signs
 * WRITE operation - posts data to FHIR server
 */

import { z } from 'zod';
import type { SHARPContext } from '../types/index.js';

// Input validation schema
const inputSchema = z.object({
  patientId: z.string(),
  temperature: z.number().optional(),
  temperatureUnit: z.enum(['C', 'F']).default('C'),
  heartRate: z.number().int().min(30).max(250).optional(),
  systolicBP: z.number().int().min(50).max(300).optional(),
  diastolicBP: z.number().int().min(30).max(200).optional(),
  respiratoryRate: z.number().int().min(8).max(60).optional(),
  oxygenSaturation: z.number().min(70).max(100).optional(),
  painScore: z.number().int().min(0).max(10).optional(),
  notes: z.string().optional()
});

export interface LogVitalsInput {
  patientId: string;
  temperature?: number;
  temperatureUnit?: 'C' | 'F';
  heartRate?: number;
  systolicBP?: number;
  diastolicBP?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  painScore?: number;
  notes?: string;
}

export interface LogVitalsOutput {
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  observationsCreated: number;
  observationIds: string[];
  timestamp: string;
  warnings?: string[];
}

export async function logVitals(
  input: LogVitalsInput,
  context?: SHARPContext | null,
  env?: { DEMO_MODE?: string }
): Promise<LogVitalsOutput> {
  // Validate input
  const validated = inputSchema.parse(input);
  const timestamp = new Date().toISOString();
  
  // DEMO_MODE: Just log and return (no actual FHIR write)
  if (env?.DEMO_MODE === 'true' || !context) {
    const vitalsLog = {
      patientId: validated.patientId,
      vitals: {
        temperature: validated.temperature,
        heartRate: validated.heartRate,
        bp: validated.systolicBP && validated.diastolicBP 
          ? `${validated.systolicBP}/${validated.diastolicBP}` 
          : undefined,
        respiratoryRate: validated.respiratoryRate,
        oxygenSaturation: validated.oxygenSaturation,
        painScore: validated.painScore
      },
      timestamp,
      mode: 'DEMO'
    };
    console.log('[LOG VITALS DEMO]', JSON.stringify(vitalsLog, null, 2));
    
    return {
      status: 'SUCCESS',
      observationsCreated: countVitals(validated),
      observationIds: generateDemoIds(countVitals(validated)),
      timestamp
    };
  }
  
  // Production: Create FHIR Observation resources
  const observationIds: string[] = [];
  const warnings: string[] = [];
  let successCount = 0;
  
  try {
    // Temperature
    if (validated.temperature !== undefined) {
      const tempC = validated.temperatureUnit === 'F' 
        ? (validated.temperature - 32) * 5 / 9 
        : validated.temperature;
      
      const result = await createObservation(
        context,
        validated.patientId,
        '8310-5', // Body temperature LOINC
        'Body temperature',
        tempC,
        'Cel',
        validated.notes
      );
      if (result.id) {
        observationIds.push(result.id);
        successCount++;
      } else {
        warnings.push('Temperature observation failed');
      }
    }
    
    // Heart rate
    if (validated.heartRate !== undefined) {
      const result = await createObservation(
        context,
        validated.patientId,
        '8867-4', // Heart rate LOINC
        'Heart rate',
        validated.heartRate,
        '/min',
        validated.notes
      );
      if (result.id) {
        observationIds.push(result.id);
        successCount++;
      } else {
        warnings.push('Heart rate observation failed');
      }
    }
    
    // Blood Pressure (systolic + diastolic as one observation)
    if (validated.systolicBP !== undefined && validated.diastolicBP !== undefined) {
      const result = await createBPObservation(
        context,
        validated.patientId,
        validated.systolicBP,
        validated.diastolicBP,
        validated.notes
      );
      if (result.id) {
        observationIds.push(result.id);
        successCount++;
      } else {
        warnings.push('Blood pressure observation failed');
      }
    }
    
    // Respiratory rate
    if (validated.respiratoryRate !== undefined) {
      const result = await createObservation(
        context,
        validated.patientId,
        '9279-1', // Respiratory rate LOINC
        'Respiratory rate',
        validated.respiratoryRate,
        '/min',
        validated.notes
      );
      if (result.id) {
        observationIds.push(result.id);
        successCount++;
      } else {
        warnings.push('Respiratory rate observation failed');
      }
    }
    
    // O2 saturation
    if (validated.oxygenSaturation !== undefined) {
      const result = await createObservation(
        context,
        validated.patientId,
        '2708-6', // O2 saturation LOINC
        'Oxygen saturation in Arterial blood',
        validated.oxygenSaturation,
        '%',
        validated.notes
      );
      if (result.id) {
        observationIds.push(result.id);
        successCount++;
      } else {
        warnings.push('Oxygen saturation observation failed');
      }
    }
    
    // Pain score
    if (validated.painScore !== undefined) {
      const result = await createObservation(
        context,
        validated.patientId,
        '72514-3', // Pain severity LOINC
        'Pain severity - 0-10 verbal numeric rating',
        validated.painScore,
        '{score}',
        validated.notes
      );
      if (result.id) {
        observationIds.push(result.id);
        successCount++;
      } else {
        warnings.push('Pain score observation failed');
      }
    }
    
    const expectedCount = countVitals(validated);
    const status: 'SUCCESS' | 'PARTIAL' | 'FAILED' = 
      successCount === expectedCount ? 'SUCCESS' :
      successCount > 0 ? 'PARTIAL' : 'FAILED';
    
    return {
      status,
      observationsCreated: successCount,
      observationIds,
      timestamp,
      warnings: warnings.length > 0 ? warnings : undefined
    };
    
  } catch (error) {
    console.error('[LOG VITALS] Error creating observations:', error);
    throw new Error(`Failed to log vitals: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper functions
function countVitals(input: LogVitalsInput): number {
  let count = 0;
  if (input.temperature !== undefined) count++;
  if (input.heartRate !== undefined) count++;
  if (input.systolicBP !== undefined && input.diastolicBP !== undefined) count++;
  if (input.respiratoryRate !== undefined) count++;
  if (input.oxygenSaturation !== undefined) count++;
  if (input.painScore !== undefined) count++;
  return count;
}

function generateDemoIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `demo-obs-${Date.now()}-${i}`);
}

async function createObservation(
  context: SHARPContext,
  patientId: string,
  loincCode: string,
  display: string,
  value: number,
  unit: string,
  notes?: string
): Promise<{ id?: string; status: 'SUCCESS' | 'FAILED' }> {
  const observation = {
    resourceType: 'Observation',
    status: 'final',
    category: [{
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/observation-category',
        code: 'vital-signs',
        display: 'Vital Signs'
      }]
    }],
    code: {
      coding: [{
        system: 'http://loinc.org',
        code: loincCode,
        display: display
      }]
    },
    subject: {
      reference: `Patient/${patientId}`,
      display: `Patient ${patientId}`
    },
    effectiveDateTime: new Date().toISOString(),
    valueQuantity: {
      value: value,
      unit: unit,
      system: 'http://unitsofmeasure.org',
      code: unit
    },
    note: notes ? [{ text: notes }] : undefined
  };
  
  const url = `${context.fhirServerUrl}/Observation`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.fhirAccessToken}`,
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json'
      },
      body: JSON.stringify(observation)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LOG VITALS] FHIR error ${response.status}: ${errorText.substring(0, 200)}`);
      return { status: 'FAILED' };
    }
    
    const result = await response.json();
    return { id: result.id, status: 'SUCCESS' };
    
  } catch (error) {
    console.error('[LOG VITALS] POST failed:', error);
    return { status: 'FAILED' };
  }
}

async function createBPObservation(
  context: SHARPContext,
  patientId: string,
  systolic: number,
  diastolic: number,
  notes?: string
): Promise<{ id?: string; status: 'SUCCESS' | 'FAILED' }> {
  const observation = {
    resourceType: 'Observation',
    status: 'final',
    category: [{
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/observation-category',
        code: 'vital-signs'
      }]
    }],
    code: {
      coding: [{
        system: 'http://loinc.org',
        code: '85354-9',
        display: 'Blood pressure panel'
      }]
    },
    subject: {
      reference: `Patient/${patientId}`
    },
    effectiveDateTime: new Date().toISOString(),
    component: [
      {
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: '8480-6',
            display: 'Systolic blood pressure'
          }]
        },
        valueQuantity: {
          value: systolic,
          unit: 'mmHg',
          system: 'http://unitsofmeasure.org',
          code: 'mm[Hg]'
        }
      },
      {
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: '8462-4',
            display: 'Diastolic blood pressure'
          }]
        },
        valueQuantity: {
          value: diastolic,
          unit: 'mmHg',
          system: 'http://unitsofmeasure.org',
          code: 'mm[Hg]'
        }
      }
    ],
    note: notes ? [{ text: notes }] : undefined
  };
  
  const url = `${context.fhirServerUrl}/Observation`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.fhirAccessToken}`,
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json'
      },
      body: JSON.stringify(observation)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LOG VITALS] BP FHIR error ${response.status}: ${errorText.substring(0, 200)}`);
      return { status: 'FAILED' };
    }
    
    const result = await response.json();
    return { id: result.id, status: 'SUCCESS' };
    
  } catch (error) {
    console.error('[LOG VITALS] BP POST failed:', error);
    return { status: 'FAILED' };
  }
}
