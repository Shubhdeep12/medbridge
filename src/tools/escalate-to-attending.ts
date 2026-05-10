/**
 * MedBridge MCP Tool: escalate_to_attending
 * Creates critical alerts and escalation requests to attending physicians
 */

import { z } from 'zod';
import type { 
  MCPTool, 
  EscalateToAttendingInput, 
  EscalateToAttendingOutput,
  SHARPContext
} from '../types/index.js';
import { fetchPatientRecord } from '../core/fhir-client.js';
import { getPatientSummary } from '../data/patients.js';

// ============================================================================
// Tool Definition
// ============================================================================

export const escalateToAttendingTool: MCPTool = {
  name: 'escalate_to_attending',
  description: 'Creates critical escalation alerts to attending physicians with FHIR CommunicationRequest support',
  inputSchema: {
    type: 'object',
    properties: {
      patientId: {
        type: 'string',
        description: 'Unique patient identifier'
      },
      level: {
        type: 'string',
        enum: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'],
        description: 'Urgency level of escalation'
      },
      message: {
        type: 'string',
        description: 'Detailed escalation message'
      },
      reasonCode: {
        type: 'string',
        description: 'Optional FHIR reason code for the escalation'
      }
    },
    required: ['patientId', 'level', 'message']
  },
  outputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['SENT', 'QUEUED', 'FAILED']
      },
      escalationId: { type: 'string' },
      timestamp: { type: 'string', format: 'date-time' },
      estimatedResponseTime: { type: 'number' }
    },
    required: ['status', 'escalationId', 'timestamp']
  }
};

// ============================================================================
// Input Validation
// ============================================================================

const inputSchema = z.object({
  patientId: z.string().min(1),
  level: z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']),
  message: z.string().min(5).max(1000),
  reasonCode: z.string().optional()
});

// ============================================================================
// Tool Implementation
// ============================================================================

export async function escalateToAttending(
  input: EscalateToAttendingInput,
  context?: SHARPContext | null,
  env?: { DEMO_MODE?: string }
): Promise<EscalateToAttendingOutput> {
  // Validate input
  const validated = inputSchema.parse(input);
  
  // Verify patient exists in FHIR server
  // Generate escalation ID
  const escalationId = generateEscalationId();
  const timestamp = new Date().toISOString();
  
  // Calculate estimated response time based on escalation level
  const estimatedResponseTime = calculateResponseTime(validated.level);
  
  // In DEMO_MODE: Just log and return (no actual FHIR write)
  if (env?.DEMO_MODE === 'true' || !context) {
    const patientSummary = getPatientSummary(validated.patientId);
    if (!patientSummary) {
      throw new Error(`Patient not found: ${validated.patientId}`);
    }
    const escalationLog = {
      id: escalationId,
      patientId: validated.patientId,
      patientSummary: getPatientSummary(validated.patientId),
      level: validated.level,
      message: validated.message,
      reasonCode: validated.reasonCode,
      timestamp,
      status: 'PENDING',
      mode: 'DEMO'
    };
    console.log('[ESCALATION DEMO]', JSON.stringify(escalationLog, null, 2));
    
    return {
      status: 'SENT',
      escalationId,
      timestamp,
      estimatedResponseTime
    };
  }
  
  // Production: Create actual FHIR CommunicationRequest
  try {
    // Fetch patient record for production
    const record = await fetchPatientRecord(validated.patientId, context, env);
    if (!record) {
      throw new Error(`Patient not found: ${validated.patientId}`);
    }
    
    const fhirResult = await createFHIRCommunicationRequest(
      context,
      validated.patientId,
      record.patient.name,
      validated.level,
      validated.message,
      validated.reasonCode
    );
    
    if (fhirResult.status === 'FAILED') {
      throw new Error('Failed to create FHIR CommunicationRequest');
    }
    
    return {
      status: 'SENT',
      escalationId: fhirResult.resourceId || escalationId,
      timestamp,
      estimatedResponseTime
    };
    
  } catch (error) {
    console.error('[ESCALATION] Failed to create FHIR CommunicationRequest:', error);
    throw new Error(`Escalation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateEscalationId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ESC-${timestamp}-${random}`;
}

function calculateResponseTime(level: EscalateToAttendingInput['level']): number {
  // Estimated response time in minutes
  switch (level) {
    case 'CRITICAL':
      return 5;  // 5 minutes
    case 'HIGH':
      return 30; // 30 minutes
    case 'MODERATE':
      return 60; // 1 hour
    case 'LOW':
      return 240; // 4 hours
    default:
      return 60;
  }
}

// No in-memory store in production - FHIR is the source of truth

// ============================================================================
// FHIR Integration
// ============================================================================

async function createFHIRCommunicationRequest(
  context: import('../types/index.js').SHARPContext,
  patientId: string,
  patientName: { first: string; last: string },
  level: string,
  message: string,
  reasonCode?: string
): Promise<{ status: 'SENT' | 'FAILED'; resourceId?: string }> {
  
  // Map escalation level to FHIR priority
  const priorityMap: Record<string, string> = {
    'CRITICAL': 'stat',
    'HIGH': 'asap',
    'MODERATE': 'urgent',
    'LOW': 'routine'
  };
  
  const timestamp = new Date().toISOString();
  
  const communicationRequest = {
    resourceType: 'CommunicationRequest',
    status: 'active',
    priority: priorityMap[level] || 'routine',
    subject: {
      reference: `Patient/${patientId}`,
      display: `${patientName.last}, ${patientName.first}`
    },
    payload: [
      {
        contentString: message
      }
    ],
    authoredOn: timestamp,
    recipient: [
      {
        reference: 'Practitioner/attending-on-call',
        display: 'Attending Physician On-Call'
      }
    ],
    reasonCode: reasonCode ? [
      {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: reasonCode,
            display: 'Escalation reason'
          }
        ],
        text: message.substring(0, 100)
      }
    ] : undefined,
    note: [
      {
        text: `Escalation initiated via MedBridge MCP tool. Level: ${level}`,
        time: timestamp
      }
    ]
  };
  
  // POST to FHIR server
  const url = `${context.fhirServerUrl}/CommunicationRequest`;
  
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
      throw new Error(`FHIR error ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    return {
      status: 'SENT',
      resourceId: result.id
    };
    
  } catch (error) {
    console.error('[ESCALATION] FHIR CommunicationRequest creation failed:', error);
    return {
      status: 'FAILED'
    };
  }
}

// ============================================================================
// Predefined Escalation Templates
// ============================================================================

export const escalationTemplates = {
  criticalVitals: (patientId: string, vitalDetails: string) => ({
    patientId,
    level: 'CRITICAL' as const,
    message: `CRITICAL ALERT: Patient ${patientId} has critical vital signs requiring immediate evaluation. ${vitalDetails}`,
    reasonCode: '386372009' // SNOMED: Emergency procedure
  }),
  
  mentalStatusChange: (patientId: string, details: string) => ({
    patientId,
    level: 'HIGH' as const,
    message: `ALERT: Patient ${patientId} showing altered mental status. ${details}`,
    reasonCode: '40917007' // SNOMED: Altered mental status
  }),
  
  fallEvent: (patientId: string, details: string) => ({
    patientId,
    level: 'HIGH' as const,
    message: `ALERT: Fall or near-fall event occurred for patient ${patientId}. ${details}`,
    reasonCode: '413308001' // SNOMED: Fall injury
  }),
  
  labAbnormality: (patientId: string, labName: string, value: string) => ({
    patientId,
    level: 'MODERATE' as const,
    message: `Lab Alert: ${labName} abnormal for patient ${patientId}. Value: ${value}`,
    reasonCode: '264931009' // SNOMED: Laboratory test result abnormal
  }),
  
  documentationGap: (patientId: string, gapDetails: string) => ({
    patientId,
    level: 'LOW' as const,
    message: `Documentation Review: ${gapDetails} for patient ${patientId}`,
    reasonCode: '18629005' // SNOMED: Administration of medical record
  })
};
