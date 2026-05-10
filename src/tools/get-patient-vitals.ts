/**
 * MedBridge MCP Tool: get_patient_vitals
 * Retrieves and analyzes patient vital signs with trend detection
 */

import { z } from 'zod';
import type { 
  MCPTool, 
  GetPatientVitalsInput, 
  GetPatientVitalsOutput,
  VitalSign,
  SHARPContext
} from '../types/index.js';
import { fetchPatientRecord } from '../core/fhir-client.js';

// ============================================================================
// Tool Definition
// ============================================================================

export const getPatientVitalsTool: MCPTool = {
  name: 'get_patient_vitals',
  description: 'Retrieves recent vital signs for a patient with trend analysis and critical flag detection',
  inputSchema: {
    type: 'object',
    properties: {
      patientId: {
        type: 'string',
        description: 'Unique patient identifier (e.g., P1001)'
      },
      sinceHours: {
        type: 'integer',
        description: 'Lookback window in hours (default: 24)',
        minimum: 1,
        maximum: 168
      }
    },
    required: ['patientId']
  },
  outputSchema: {
    type: 'object',
    properties: {
      vitals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            timestamp: { type: 'string', format: 'date-time' },
            heartRate: { type: 'number' },
            systolicBP: { type: 'number' },
            diastolicBP: { type: 'number' },
            respiratoryRate: { type: 'number' },
            temperature: { type: 'number' },
            oxygenSaturation: { type: 'number' },
            painScore: { type: 'number' }
          },
          required: ['timestamp']
        }
      },
      trend: {
        type: 'string',
        enum: ['IMPROVING', 'STABLE', 'WORSENING', 'UNSTABLE']
      },
      criticalFlags: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    required: ['vitals', 'trend', 'criticalFlags']
  }
};

// ============================================================================
// Input Validation
// ============================================================================

const inputSchema = z.object({
  patientId: z.string().min(1),
  sinceHours: z.number().int().min(1).max(168).optional().default(24)
});

// ============================================================================
// Tool Implementation
// ============================================================================

export async function getPatientVitals(
  input: GetPatientVitalsInput,
  context?: SHARPContext | null,
  env?: { DEMO_MODE?: string }
): Promise<GetPatientVitalsOutput> {
  // Validate input
  const validated = inputSchema.parse(input);
  
  // Retrieve patient record from FHIR server
  const record = await fetchPatientRecord(validated.patientId, context, env);
  
  if (!record) {
    throw new Error(`Patient not found: ${validated.patientId}`);
  }
  
  // Filter vitals by time window
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - validated.sinceHours);
  
  const filteredVitals = record.vitals.filter((vital: VitalSign) => {
    const vitalTime = new Date(vital.timestamp);
    return vitalTime >= cutoffTime;
  });
  
  // If no vitals in specified window, return all available vitals
  const vitalsToAnalyze = filteredVitals.length > 0 ? filteredVitals : record.vitals;
  
  // Analyze trends
  const trend = analyzeVitalTrend(vitalsToAnalyze);
  
  // Detect critical flags
  const criticalFlags = detectCriticalFlags(vitalsToAnalyze);
  
  return {
    vitals: vitalsToAnalyze,
    trend,
    criticalFlags
  };
}

// ============================================================================
// Analysis Functions
// ============================================================================

function analyzeVitalTrend(vitals: VitalSign[]): GetPatientVitalsOutput['trend'] {
  if (vitals.length < 2) return 'STABLE';
  
  const first = vitals[0];
  const last = vitals[vitals.length - 1];
  
  let improvingCount = 0;
  let worseningCount = 0;
  
  // Heart rate trend
  if (last.heartRate && first.heartRate) {
    if (last.heartRate < first.heartRate * 0.95) improvingCount++;
    if (last.heartRate > first.heartRate * 1.1) worseningCount++;
  }
  
  // BP trend
  if (last.systolicBP && first.systolicBP) {
    if (last.systolicBP < first.systolicBP * 0.95) improvingCount++;
    if (last.systolicBP > first.systolicBP * 1.05) worseningCount++;
  }
  
  // O2 sat trend
  if (last.oxygenSaturation && first.oxygenSaturation) {
    if (last.oxygenSaturation > first.oxygenSaturation + 2) improvingCount++;
    if (last.oxygenSaturation < first.oxygenSaturation - 2) worseningCount++;
  }
  
  // Temperature trend
  if (last.temperature && first.temperature) {
    if (last.temperature < 37.5 && first.temperature >= 37.5) improvingCount++;
    if (last.temperature > first.temperature + 0.5) worseningCount++;
  }
  
  if (worseningCount >= 2) return 'WORSENING';
  if (improvingCount >= 2) return 'IMPROVING';
  if (worseningCount === 1 || improvingCount === 1) return 'UNSTABLE';
  return 'STABLE';
}

function detectCriticalFlags(vitals: VitalSign[]): string[] {
  const flags: string[] = [];
  
  if (vitals.length === 0) return flags;
  
  const latest = vitals[vitals.length - 1];
  
  // Critical thresholds
  if (latest.heartRate !== undefined) {
    if (latest.heartRate > 120) flags.push(`CRITICAL: Severe tachycardia (${latest.heartRate} bpm)`);
    if (latest.heartRate < 50) flags.push(`CRITICAL: Severe bradycardia (${latest.heartRate} bpm)`);
  }
  
  if (latest.systolicBP !== undefined) {
    if (latest.systolicBP > 180) flags.push(`CRITICAL: Severe hypertension (${latest.systolicBP} mmHg)`);
    if (latest.systolicBP < 85) flags.push(`CRITICAL: Severe hypotension (${latest.systolicBP} mmHg)`);
    if (latest.systolicBP > 140 && latest.systolicBP <= 180) flags.push(`WARNING: Hypertension (${latest.systolicBP} mmHg)`);
  }
  
  if (latest.temperature !== undefined) {
    if (latest.temperature > 39.0) flags.push(`CRITICAL: High fever (${latest.temperature}°C)`);
    if (latest.temperature < 35.0) flags.push(`CRITICAL: Hypothermia (${latest.temperature}°C)`);
    if (latest.temperature > 38.0 && latest.temperature <= 39.0) flags.push(`WARNING: Fever (${latest.temperature}°C)`);
  }
  
  if (latest.oxygenSaturation !== undefined) {
    if (latest.oxygenSaturation < 90) flags.push(`CRITICAL: Severe hypoxia (${latest.oxygenSaturation}%)`);
    if (latest.oxygenSaturation < 95 && latest.oxygenSaturation >= 90) flags.push(`WARNING: Hypoxia (${latest.oxygenSaturation}%)`);
  }
  
  if (latest.painScore !== undefined) {
    if (latest.painScore >= 8) flags.push(`CRITICAL: Severe pain (${latest.painScore}/10)`);
    if (latest.painScore >= 5 && latest.painScore < 8) flags.push(`WARNING: Moderate pain (${latest.painScore}/10)`);
  }
  
  // Check for concerning trends
  if (vitals.length >= 3) {
    const recent3 = vitals.slice(-3);
    const hrTrend = recent3.every((v, i) => i === 0 || (v.heartRate || 0) >= (recent3[i-1].heartRate || 0));
    if (hrTrend && latest.heartRate && latest.heartRate > 90) {
      flags.push(`TREND: Rising heart rate over last 3 readings`);
    }
    
    const bpTrend = recent3.every((v, i) => i === 0 || (v.systolicBP || 0) >= (recent3[i-1].systolicBP || 0));
    if (bpTrend && latest.systolicBP && latest.systolicBP > 130) {
      flags.push(`TREND: Rising blood pressure over last 3 readings`);
    }
    
    const o2Trend = recent3.every((v, i) => i === 0 || (v.oxygenSaturation || 100) <= (recent3[i-1].oxygenSaturation || 100));
    if (o2Trend && latest.oxygenSaturation && latest.oxygenSaturation < 95) {
      flags.push(`TREND: Declining oxygen saturation over last 3 readings`);
    }
  }
  
  return flags;
}
