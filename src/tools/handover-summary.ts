/**
 * MedBridge MCP Tool: handover_summary
 * Generates AI-powered clinical handover summaries with risk stratification
 */

import { z } from 'zod';
import type { 
  MCPTool, 
  HandoverSummaryInput, 
  HandoverSummaryOutput,
  PatientRecord,
  SHARPContext
} from '../types/index.js';
import { fetchPatientRecord } from '../core/fhir-client.js';
import { assessPatientRisk } from '../core/risk-assessor.js';

// ============================================================================
// Tool Definition
// ============================================================================

export const handoverSummaryTool: MCPTool = {
  name: 'handover_summary',
  description: 'Generates a comprehensive clinical handover summary with risk stratification and action items',
  inputSchema: {
    type: 'object',
    properties: {
      patientId: {
        type: 'string',
        description: 'Unique patient identifier'
      },
      includeRecommendations: {
        type: 'boolean',
        description: 'Include AI-generated recommendations (default: true)'
      }
    },
    required: ['patientId']
  },
  outputSchema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      keyFindings: {
        type: 'array',
        items: { type: 'string' }
      },
      actionItems: {
        type: 'array',
        items: { type: 'string' }
      },
      riskLevel: {
        type: 'string',
        enum: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL']
      },
      recommendedEscalation: { type: 'boolean' }
    },
    required: ['summary', 'keyFindings', 'actionItems', 'riskLevel']
  }
};

// ============================================================================
// Input Validation
// ============================================================================

const inputSchema = z.object({
  patientId: z.string().min(1),
  includeRecommendations: z.boolean().optional().default(true)
});

// ============================================================================
// Tool Implementation
// ============================================================================

export async function generateHandoverSummary(
  input: HandoverSummaryInput,
  context?: SHARPContext | null,
  env?: { DEMO_MODE?: string }
): Promise<HandoverSummaryOutput> {
  // Validate input
  const validated = inputSchema.parse(input);
  
  // Retrieve patient record from FHIR server
  const record = await fetchPatientRecord(validated.patientId, context, env);
  
  if (!record) {
    throw new Error(`Patient not found: ${validated.patientId}`);
  }
  
  // Perform comprehensive risk assessment
  const riskAssessment = assessPatientRisk(record);
  
  // Generate narrative summary
  const summary = generateNarrativeSummary(record, riskAssessment);
  
  // Extract key findings
  const keyFindings = extractKeyFindings(record, riskAssessment);
  
  // Generate action items
  const actionItems = validated.includeRecommendations 
    ? riskAssessment.recommendations 
    : [];
  
  return {
    summary,
    keyFindings,
    actionItems,
    riskLevel: riskAssessment.overallRisk,
    recommendedEscalation: riskAssessment.overallRisk === 'HIGH' || riskAssessment.overallRisk === 'CRITICAL'
  };
}

// ============================================================================
// Summary Generation
// ============================================================================

function generateNarrativeSummary(record: PatientRecord, risk: ReturnType<typeof assessPatientRisk>): string {
  const { patient, vitals, notes } = record;
  
  // Basic patient info
  const ageGender = `${patient.age}${patient.gender === 'M' ? 'M' : patient.gender === 'F' ? 'F' : ''}`;
  const diagnoses = patient.diagnosis.join(', ');
  
  // Current status
  const latestVitals = vitals[vitals.length - 1];
  const vitalSummary = latestVitals 
    ? `Current vitals: ${latestVitals.heartRate ? `HR ${latestVitals.heartRate}` : ''} ${latestVitals.systolicBP ? `BP ${latestVitals.systolicBP}/${latestVitals.diastolicBP}` : ''} ${latestVitals.temperature ? `Temp ${latestVitals.temperature}°C` : ''}`.trim()
    : 'No recent vitals available';
  
  // Mental status
  const mentalStatusNote = notes.find(n => 
    n.text.toLowerCase().includes('confused') || 
    n.text.toLowerCase().includes('alert') ||
    n.text.toLowerCase().includes('oriented')
  );
  
  let mentalStatus = 'Mental status not explicitly documented';
  if (mentalStatusNote) {
    if (mentalStatusNote.text.toLowerCase().includes('confused') || mentalStatusNote.text.toLowerCase().includes('not oriented')) {
      mentalStatus = 'Altered mental status documented - requires evaluation';
    } else if (mentalStatusNote.text.toLowerCase().includes('alert and oriented')) {
      mentalStatus = 'Alert and oriented';
    }
  }
  
  // Risk flag
  const riskFlag = risk.overallRisk === 'CRITICAL' 
    ? '⚠️ CRITICAL: Immediate physician evaluation required'
    : risk.overallRisk === 'HIGH'
    ? '⚠️ HIGH RISK: Notify attending within 1 hour'
    : risk.overallRisk === 'MODERATE'
    ? '⚡ MODERATE RISK: Close monitoring recommended'
    : '✓ Low risk, routine monitoring';
  
  // Build summary
  let summary = `**${patient.name.last.toUpperCase()}, ${patient.name.first}** (${ageGender}) - ${patient.mrn}\n\n`;
  summary += `**Diagnoses:** ${diagnoses}\n\n`;
  summary += `**Current Status:** ${vitalSummary}\n`;
  summary += `**Mental Status:** ${mentalStatus}\n\n`;
  summary += `**Risk Assessment:** ${riskFlag}\n\n`;
  
  // Recent events
  const recentNotes = notes.slice(-3);
  if (recentNotes.length > 0) {
    summary += `**Recent Events:**\n`;
    recentNotes.forEach(note => {
      const time = new Date(note.timestamp).toLocaleString();
      summary += `- [${time}] ${note.author}: ${truncateText(note.text, 100)}\n`;
    });
    summary += `\n`;
  }
  
  // Plan
  summary += `**Current Plan:** ${patient.plan}\n\n`;
  
  // Critical findings
  if (risk.triggers.length > 0) {
    const criticalTriggers = risk.triggers.filter(t => t.severity === 'CRITICAL' || t.severity === 'HIGH');
    if (criticalTriggers.length > 0) {
      summary += `**Critical Findings:**\n`;
      criticalTriggers.forEach(trigger => {
        summary += `- ${trigger.description}\n`;
      });
    }
  }
  
  return summary;
}

function extractKeyFindings(record: PatientRecord, risk: ReturnType<typeof assessPatientRisk>): string[] {
  const findings: string[] = [];
  
  // Vital sign trends
  const { vitals } = record;
  if (vitals.length >= 2) {
    const first = vitals[0];
    const last = vitals[vitals.length - 1];
    
    if (last.heartRate && first.heartRate && last.heartRate > first.heartRate * 1.15) {
      findings.push(`Heart rate trending up: ${first.heartRate} → ${last.heartRate} bpm`);
    }
    if (last.systolicBP && first.systolicBP && last.systolicBP > first.systolicBP * 1.1) {
      findings.push(`Blood pressure trending up: ${first.systolicBP} → ${last.systolicBP} mmHg`);
    }
    if (last.oxygenSaturation && first.oxygenSaturation && last.oxygenSaturation < first.oxygenSaturation - 3) {
      findings.push(`Oxygen saturation declining: ${first.oxygenSaturation}% → ${last.oxygenSaturation}%`);
    }
  }
  
  // Documentation gaps
  const hasFallsDocumentation = record.notes.some(n => 
    n.text.toLowerCase().includes('fall') || n.text.toLowerCase().includes('balance')
  );
  const planMentionsFalls = record.patient.plan.toLowerCase().includes('fall');
  
  if (hasFallsDocumentation && !planMentionsFalls) {
    findings.push('⚠️ DOCUMENTATION GAP: Falls risk identified in nursing notes but missing from care plan');
  }
  
  // Lab abnormalities
  if (record.labResults) {
    const criticalLabs = record.labResults.filter(lab => lab.flag === 'CRITICAL' || lab.flag === 'HIGH');
    criticalLabs.forEach(lab => {
      findings.push(`Abnormal ${lab.testName}: ${lab.value} ${lab.unit} (${lab.flag})`);
    });
  }
  
  // Risk assessment findings
  risk.triggers.forEach(trigger => {
    if (trigger.severity === 'CRITICAL' || trigger.severity === 'HIGH') {
      findings.push(`${trigger.severity}: ${trigger.description}`);
    }
  });
  
  // Medications of note
  if (record.patient.medications) {
    const anticoagulants = record.patient.medications.filter(m => 
      m.toLowerCase().includes('warfarin') || 
      m.toLowerCase().includes('apixaban') ||
      m.toLowerCase().includes('rivaroxaban') ||
      m.toLowerCase().includes('heparin')
    );
    if (anticoagulants.length > 0) {
      findings.push(`On anticoagulation: ${anticoagulants.join(', ')}`);
    }
  }
  
  // Allergies
  if (record.patient.allergies && record.patient.allergies.length > 0) {
    findings.push(`Allergies: ${record.patient.allergies.join(', ')}`);
  }
  
  return findings;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
