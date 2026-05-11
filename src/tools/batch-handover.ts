/**
 * Batch Handover Tool
 * Generates handover summaries for multiple patients at once
 * Perfect for shift change with 6+ patients
 */

import { z } from 'zod';
import type { SHARPContext, PatientRecord } from '../types/index.js';
import { fetchPatientRecord } from '../core/fhir-client.js';

const inputSchema = z.object({
  patientIds: z.array(z.string()).min(1).max(20),
  includeRecommendations: z.boolean().default(true)
});

export interface BatchHandoverInput {
  patientIds: string[];
  includeRecommendations?: boolean;
}

export interface PatientBrief {
  patientId: string;
  name: string;
  age: number;
  diagnosis: string;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  keyFindings: string[];
  actionItems: string[];
  lastVitalsSummary: string;
  attentionRequired: boolean;
}

export interface BatchHandoverOutput {
  totalPatients: number;
  criticalCount: number;
  highRiskCount: number;
  stableCount: number;
  patients: PatientBrief[];
  priorityOrder: string[]; // patientIds sorted by risk
  shiftDurationEstimate: string;
  timestamp: string;
}

export async function generateBatchHandover(
  input: BatchHandoverInput,
  context?: SHARPContext | null,
  env?: { DEMO_MODE?: string }
): Promise<BatchHandoverOutput> {
  // Validate input
  const validated = inputSchema.parse(input);
  const timestamp = new Date().toISOString();
  
  // Fetch all patient records in parallel
  const patientResults = await Promise.all(
    validated.patientIds.map(async (patientId) => {
      try {
        const record = await fetchPatientRecord(patientId, context, env);
        if (!record) {
          return { patientId, error: 'Patient not found' };
        }
        return { patientId, record };
      } catch (error) {
        return { patientId, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    })
  );
  
  // Generate briefs for each patient
  const patientBriefs: PatientBrief[] = [];
  let criticalCount = 0;
  let highRiskCount = 0;
  let stableCount = 0;
  
  for (const result of patientResults) {
    if ('error' in result || !result.record) {
      // Create error brief for failed patients
      patientBriefs.push({
        patientId: result.patientId,
        name: 'Unknown',
        age: 0,
        diagnosis: 'Error loading patient',
        riskLevel: 'CRITICAL',
        keyFindings: ['Data access error'],
        actionItems: ['Manual chart review required'],
        lastVitalsSummary: 'N/A',
        attentionRequired: true
      });
      criticalCount++;
      continue;
    }
    
    const brief = createPatientBrief(result.record, result.patientId);
    patientBriefs.push(brief);
    
    // Count by risk
    if (brief.riskLevel === 'CRITICAL') criticalCount++;
    else if (brief.riskLevel === 'HIGH') highRiskCount++;
    else stableCount++;
  }
  
  // Sort by risk priority (CRITICAL first, then HIGH, etc.)
  const priorityOrder = patientBriefs
    .sort((a, b) => {
      const riskOrder = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };
      return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
    })
    .map(p => p.patientId);
  
  // Estimate time saved
  const traditionalTime = validated.patientIds.length * 15; // 15 min per patient
  const aiTime = 2; // 2 minutes with AI
  const timeSaved = traditionalTime - aiTime;
  
  return {
    totalPatients: validated.patientIds.length,
    criticalCount,
    highRiskCount,
    stableCount,
    patients: patientBriefs,
    priorityOrder,
    shiftDurationEstimate: `Traditional: ${traditionalTime} min | With MedBridge: ${aiTime} min (saved ${timeSaved} min)`,
    timestamp
  };
}

function createPatientBrief(record: PatientRecord, patientId: string): PatientBrief {
  const patient = record.patient;
  
  // Calculate risk level
  let riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
  const keyFindings: string[] = [];
  const actionItems: string[] = [];
  
  // Analyze vitals
  if (record.vitals.length > 0) {
    const latest = record.vitals[record.vitals.length - 1];
    
    // BP check
    if (latest.systolicBP !== undefined && latest.diastolicBP !== undefined) {
      if (latest.systolicBP > 180 || latest.diastolicBP > 110) {
        riskLevel = 'CRITICAL';
        keyFindings.push(`🚨 CRITICAL BP: ${latest.systolicBP}/${latest.diastolicBP}`);
        actionItems.push('Notify physician immediately - hypertensive crisis');
      } else if (latest.systolicBP > 160 || latest.diastolicBP > 100) {
        riskLevel = 'HIGH';
        keyFindings.push(`⚠️ Elevated BP: ${latest.systolicBP}/${latest.diastolicBP}`);
        actionItems.push('Recheck BP in 30 min, notify if trending up');
      }
    }
    
    // O2 saturation check
    if (latest.oxygenSaturation !== undefined) {
      if (latest.oxygenSaturation < 90) {
        riskLevel = 'CRITICAL';
        keyFindings.push(`🚨 HYPOXIA: O2 sat ${latest.oxygenSaturation}%`);
        actionItems.push('Increase O2, prepare for possible intubation');
      } else if (latest.oxygenSaturation < 94) {
        riskLevel = riskLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH';
        keyFindings.push(`⚠️ Low O2: ${latest.oxygenSaturation}%`);
        actionItems.push('Monitor O2 closely, titrate flow');
      }
    }
    
    // Temperature check
    if (latest.temperature !== undefined && latest.temperature > 38.5) {
      riskLevel = riskLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH';
      keyFindings.push(`🌡️ Fever: ${latest.temperature}°C`);
      actionItems.push('Blood cultures before next antibiotic dose');
    }
    
    // Heart rate
    if (latest.heartRate !== undefined && latest.heartRate > 120) {
      keyFindings.push(`⚠️ Tachycardia: ${latest.heartRate} bpm`);
      if (riskLevel !== 'CRITICAL') riskLevel = 'HIGH';
    }
    
    // Pain
    if (latest.painScore !== undefined && latest.painScore >= 7) {
      keyFindings.push(`💢 Severe pain: ${latest.painScore}/10`);
      actionItems.push('Administer PRN analgesic, reassess in 1 hour');
    }
  }
  
  // Check notes for concerning keywords
  const concerningKeywords = ['fall', 'bleeding', 'confusion', 'refused', 'agitated', 'wound', 'infection'];
  for (const note of record.notes) {
    const lowerContent = note.text.toLowerCase();
    for (const keyword of concerningKeywords) {
      if (lowerContent.includes(keyword) && !keyFindings.some(kf => kf.includes(keyword))) {
        keyFindings.push(`⚠️ Note: "${keyword}" mentioned`);
        if (riskLevel === 'LOW') riskLevel = 'MODERATE';
        break;
      }
    }
  }
  
  // Default status if nothing critical
  if (keyFindings.length === 0) {
    if (record.vitals.length > 0) {
      const latest = record.vitals[record.vitals.length - 1];
      keyFindings.push(`✅ Stable: BP ${latest.systolicBP}/${latest.diastolicBP}, O2 ${latest.oxygenSaturation}%`);
    } else {
      keyFindings.push('ℹ️ No recent vital signs recorded');
    }
    actionItems.push('Routine monitoring');
  }
  
  // Build vitals summary
  let lastVitalsSummary = 'No recent vitals';
  if (record.vitals.length > 0) {
    const latest = record.vitals[record.vitals.length - 1];
    lastVitalsSummary = `BP ${latest.systolicBP}/${latest.diastolicBP}, HR ${latest.heartRate}, T ${latest.temperature}°C, O2 ${latest.oxygenSaturation}%`;
  }
  
  return {
    patientId,
    name: `${patient.name.last}, ${patient.name.first}`,
    age: patient.age,
    diagnosis: patient.diagnosis.slice(0, 2).join(', '), // Top 2 diagnoses
    riskLevel,
    keyFindings: keyFindings.slice(0, 4), // Max 4 findings
    actionItems: actionItems.slice(0, 3), // Max 3 actions
    lastVitalsSummary,
    attentionRequired: riskLevel === 'CRITICAL' || riskLevel === 'HIGH'
  };
}
