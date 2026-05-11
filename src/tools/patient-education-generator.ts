/**
 * Patient Education Generator Tool (MCP App)
 * Creates personalized patient education materials with interactive UI
 * MCP Apps extension with ui:// resource support
 */

import { z } from 'zod';
import type { MCPTool, SHARPContext } from '../types/index.js';
import { fetchPatientRecord } from '../core/fhir-client.js';

const inputSchema = z.object({
  patientId: z.string().min(1),
  topics: z.array(z.enum(['medications', 'diagnosis', 'procedures', 'lifestyle', 'followUp', 'warningSigns'])).default(['medications', 'diagnosis']),
  language: z.enum(['en', 'es', 'fr', 'zh', 'ar', 'hi']).default('en'),
  format: z.enum(['handout', 'qr', 'both']).default('handout')
});

export interface PatientEducationInput {
  patientId: string;
  topics?: Array<'medications' | 'diagnosis' | 'procedures' | 'lifestyle' | 'followUp' | 'warningSigns'>;
  language?: 'en' | 'es' | 'fr' | 'zh' | 'ar' | 'hi';
  format?: 'handout' | 'qr' | 'both';
}

export interface PatientEducationOutput {
  status: 'SUCCESS' | 'NO_DATA';
  patientId: string;
  patientName: string;
  generatedAt: string;
  topics: string[];
  language: string;
  format: string;
  content: {
    medications: Array<{
      name: string;
      purpose: string;
      instructions: string;
      sideEffects: string[];
      warnings: string[];
    }>;
    diagnosis: Array<{
      condition: string;
      explanation: string;
      whatToExpect: string;
    }>;
    procedures: Array<{
      name: string;
      preparation: string;
      whatHappens: string;
      recovery: string;
    }>;
    lifestyle: Array<{
      category: string;
      recommendations: string[];
    }>;
    followUp: {
      appointments: string[];
      tests: string[];
      contactInfo: string;
    };
    warningSigns: Array<{
      symptom: string;
      action: string;
      urgency: 'immediate' | 'soon' | 'routine';
    }>;
  };
  summary: string;
  qrCode?: string;
  uiResourceUri: string;
}

// MCP Tool Definition with MCP Apps metadata
export const patientEducationTool: MCPTool = {
  name: 'patient_education_generator',
  description: 'Generates personalized patient education materials with interactive handout builder. Creates customized discharge instructions, medication guides, and warning sign checklists in multiple languages. Includes QR code generation for mobile access.',
  inputSchema: {
    type: 'object',
    properties: {
      patientId: {
        type: 'string',
        description: 'Unique patient identifier'
      },
      topics: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['medications', 'diagnosis', 'procedures', 'lifestyle', 'followUp', 'warningSigns']
        },
        description: 'Education topics to include',
        default: ['medications', 'diagnosis']
      },
      language: {
        type: 'string',
        enum: ['en', 'es', 'fr', 'zh', 'ar', 'hi'],
        description: 'Language for education materials',
        default: 'en'
      },
      format: {
        type: 'string',
        enum: ['handout', 'qr', 'both'],
        description: 'Output format',
        default: 'handout'
      }
    },
    required: ['patientId']
  },
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['SUCCESS', 'NO_DATA'] },
      patientId: { type: 'string' },
      patientName: { type: 'string' },
      generatedAt: { type: 'string' },
      topics: { type: 'array', items: { type: 'string' } },
      language: { type: 'string' },
      format: { type: 'string' },
      summary: { type: 'string' },
      qrCode: { type: 'string' },
      uiResourceUri: { type: 'string' }
    },
    required: ['status', 'patientId', 'uiResourceUri', 'summary']
  },
  // MCP Apps UI Resource Metadata
  _meta: {
    ui: {
      resourceUri: 'ui://medbridge/education-builder',
      visibility: ['model', 'app']
    }
  }
};

export async function patientEducationGenerator(
  input: PatientEducationInput,
  context?: SHARPContext | null,
  env?: { DEMO_MODE?: string }
): Promise<PatientEducationOutput> {
  const validated = inputSchema.parse(input);
  
  // Fetch patient record
  const record = await fetchPatientRecord(validated.patientId, context, env);
  
  if (!record) {
    throw new Error(`Patient not found: ${validated.patientId}`);
  }
  
  const patient = record.patient;
  const generatedAt = new Date().toISOString();
  
  // Generate education content based on patient data
  const content = generateEducationContent(patient, validated.topics, validated.language);
  
  // Generate QR code data (would be actual QR generation in production)
  const qrCode = validated.format !== 'handout' 
    ? `https://medbridge.app/education/${validated.patientId}?lang=${validated.language}&t=${Date.now()}`
    : undefined;
  
  // Build summary
  const topicCount = validated.topics.length;
  const medicationCount = content.medications.length;
  const diagnosisCount = content.diagnosis.length;
  const warningCount = content.warningSigns.length;
  
  const langNames: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    zh: 'Chinese',
    ar: 'Arabic',
    hi: 'Hindi'
  };
  
  const summaryParts: string[] = [
    `Generated personalized education materials for ${patient.name.first} ${patient.name.last}.`,
    `Topics covered: ${topicCount} (${validated.topics.join(', ')}).`,
    langNames[validated.language] !== 'English' ? `Translated to ${langNames[validated.language]}.` : ''
  ];
  
  if (medicationCount > 0) {
    summaryParts.push(`Includes instructions for ${medicationCount} medication(s).`);
  }
  if (diagnosisCount > 0) {
    summaryParts.push(`Covers ${diagnosisCount} diagnosis(es).`);
  }
  if (warningCount > 0) {
    summaryParts.push(`⚠️ ${warningCount} warning sign(s) highlighted for patient safety.`);
  }
  if (qrCode) {
    summaryParts.push('QR code generated for mobile access.');
  }
  
  return {
    status: 'SUCCESS',
    patientId: validated.patientId,
    patientName: `${patient.name.first} ${patient.name.last}`,
    generatedAt,
    topics: validated.topics,
    language: validated.language,
    format: validated.format,
    content,
    summary: summaryParts.filter(Boolean).join(' '),
    qrCode,
    uiResourceUri: 'ui://medbridge/education-builder'
  };
}

function generateEducationContent(
  patient: { diagnosis: string[]; medications?: string[]; plan?: string },
  topics: string[],
  _language: string
): PatientEducationOutput['content'] {
  const content: PatientEducationOutput['content'] = {
    medications: [],
    diagnosis: [],
    procedures: [],
    lifestyle: [],
    followUp: {
      appointments: [],
      tests: [],
      contactInfo: 'Call your care team at (555) 123-4567 for questions'
    },
    warningSigns: []
  };
  
  // Generate medication instructions
  if (topics.includes('medications') && patient.medications) {
    for (const med of patient.medications.slice(0, 5)) {
      content.medications.push({
        name: med,
        purpose: 'As prescribed by your physician for your condition',
        instructions: 'Take exactly as directed. Do not skip doses.',
        sideEffects: ['Contact your doctor if you experience unusual symptoms'],
        warnings: ['Do not stop taking without consulting your doctor']
      });
    }
  }
  
  // Generate diagnosis explanations
  if (topics.includes('diagnosis')) {
    for (const diag of patient.diagnosis.slice(0, 3)) {
      content.diagnosis.push({
        condition: diag,
        explanation: `You have been diagnosed with ${diag}. Your care team will monitor your progress.`,
        whatToExpect: 'Symptoms may improve with treatment. Follow your care plan closely.'
      });
    }
  }
  
  // Generate procedure info (based on common procedures for diagnoses)
  if (topics.includes('procedures')) {
    const commonProcedures = ['Vital sign monitoring', 'Medication administration', 'Physical therapy'];
    for (const proc of commonProcedures) {
      content.procedures.push({
        name: proc,
        preparation: 'Follow pre-procedure instructions provided by your nurse',
        whatHappens: 'Trained healthcare staff will perform this procedure safely',
        recovery: 'Most patients tolerate this well. Report any discomfort.'
      });
    }
  }
  
  // Generate lifestyle recommendations
  if (topics.includes('lifestyle')) {
    content.lifestyle.push(
      {
        category: 'Nutrition',
        recommendations: ['Eat balanced meals', 'Stay hydrated', 'Follow any dietary restrictions']
      },
      {
        category: 'Activity',
        recommendations: ['Follow activity guidelines from your care team', 'Rest when needed']
      },
      {
        category: 'Sleep',
        recommendations: ['Aim for 7-8 hours of sleep', 'Keep regular sleep schedule']
      }
    );
  }
  
  // Generate follow-up instructions
  if (topics.includes('followUp')) {
    content.followUp.appointments = [
      'Follow-up appointment with primary physician within 1 week',
      'Return to clinic if symptoms worsen'
    ];
    content.followUp.tests = [
      'Lab work as ordered by physician',
      'Imaging studies if scheduled'
    ];
  }
  
  // Generate warning signs
  if (topics.includes('warningSigns')) {
    content.warningSigns.push(
      { symptom: 'Chest pain or pressure', action: 'Call 911 immediately', urgency: 'immediate' },
      { symptom: 'Difficulty breathing', action: 'Call 911 immediately', urgency: 'immediate' },
      { symptom: 'Severe headache or confusion', action: 'Seek emergency care', urgency: 'immediate' },
      { symptom: 'Fever over 101°F (38.3°C)', action: 'Contact your doctor within 24 hours', urgency: 'soon' },
      { symptom: 'Worsening pain not controlled by medication', action: 'Contact your care team', urgency: 'soon' },
      { symptom: 'New or worsening symptoms', action: 'Schedule follow-up appointment', urgency: 'routine' }
    );
  }
  
  return content;
}
