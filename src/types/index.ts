/**
 * MedBridge Type Definitions
 * Core types for MCP tools, A2A agents, FHIR data, and clinical workflows
 */

// ============================================================================
// MCP Protocol Types
// ============================================================================

export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

// ============================================================================
// SHARP Context Types (FHIR Integration)
// ============================================================================

export interface SHARPContext {
  fhirServerUrl: string;
  fhirAccessToken: string;
  patientId: string;
  apiKey: string;
}

export interface FHIRHeaders {
  'X-FHIR-Server-URL': string;
  'X-FHIR-Access-Token': string;
  'X-Patient-ID': string;
  'X-API-Key': string;
}

// ============================================================================
// Clinical Data Types
// ============================================================================

export interface Patient {
  id: string;
  name: {
    first: string;
    last: string;
  };
  age: number;
  gender: 'M' | 'F' | 'O';
  mrn: string;
  diagnosis: string[];
  allergies?: string[];
  medications?: string[];
  plan: string;
}

export interface VitalSign {
  timestamp: string;
  heartRate?: number;
  systolicBP?: number;
  diastolicBP?: number;
  respiratoryRate?: number;
  temperature?: number;
  oxygenSaturation?: number;
  painScore?: number;
}

export interface NurseNote {
  timestamp: string;
  author: string;
  text: string;
  category?: string;
}

export interface PatientRecord {
  patient: Patient;
  vitals: VitalSign[];
  notes: NurseNote[];
  labResults?: LabResult[];
}

export interface LabResult {
  timestamp: string;
  testName: string;
  value: number;
  unit: string;
  referenceRange?: string;
  flag?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
}

// ============================================================================
// Tool Input/Output Types
// ============================================================================

export interface GetPatientVitalsInput {
  patientId: string;
  sinceHours?: number;
}

export interface GetPatientVitalsOutput {
  vitals: VitalSign[];
  trend: 'IMPROVING' | 'STABLE' | 'WORSENING' | 'UNSTABLE';
  criticalFlags: string[];
}

export interface GetRecentNurseNotesInput {
  patientId: string;
  since?: string;
  limit?: number;
}

export interface GetRecentNurseNotesOutput {
  notes: NurseNote[];
  summary: string;
  concerns: string[];
}

export interface HandoverSummaryInput {
  patientId: string;
  includeRecommendations?: boolean;
}

export interface HandoverSummaryOutput {
  summary: string;
  keyFindings: string[];
  actionItems: string[];
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  recommendedEscalation?: boolean;
}

export interface EscalateToAttendingInput {
  patientId: string;
  level: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  message: string;
  reasonCode?: string;
}

export interface EscalateToAttendingOutput {
  status: 'SENT' | 'QUEUED' | 'FAILED';
  escalationId: string;
  timestamp: string;
  estimatedResponseTime?: number;
}

// ============================================================================
// A2A Agent Types
// ============================================================================

export interface AgentCard {
  name: string;
  description: string;
  version: string;
  capabilities: AgentCapability[];
  endpoint: string;
  authentication: {
    type: 'apiKey';
    headerName: string;
  };
}

export interface AgentCapability {
  name: string;
  description: string;
  parameters?: JSONSchema;
}

export interface A2ATask {
  id: string;
  state: 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  agent: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Risk Assessment Types
// ============================================================================

export interface RiskAssessment {
  patientId: string;
  timestamp: string;
  overallRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  vitalsRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  notesRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  triggers: RiskTrigger[];
  recommendations: string[];
}

export interface RiskTrigger {
  category: 'VITALS' | 'LABS' | 'NOTES' | 'MEDICATION';
  severity: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  description: string;
  value?: number;
  threshold?: number;
  timestamp: string;
}

// ============================================================================
// FHIR Resource Types (Simplified)
// ============================================================================

export interface FHIRPatient {
  resourceType: 'Patient';
  id: string;
  name: Array<{
    use: string;
    family: string;
    given: string[];
  }>;
  gender: string;
  birthDate: string;
}

export interface FHIRObservation {
  resourceType: 'Observation';
  id: string;
  status: string;
  category: Array<{
    coding: Array<{
      system: string;
      code: string;
      display: string;
    }>;
  }>;
  code: {
    coding: Array<{
      system: string;
      code: string;
      display: string;
    }>;
  };
  subject: {
    reference: string;
  };
  effectiveDateTime: string;
  valueQuantity?: {
    value: number;
    unit: string;
    system: string;
    code: string;
  };
}
