/**
 * MedBridge MCP Server - Cloudflare Workers Entry Point
 * Edge-deployed JSON-RPC server for clinical handover tools
 */

import type { MCPRequest, MCPResponse, SHARPContext } from './types/index.js';
import { extractSHARPContext, validateSHARPContext } from './core/sharp-context.js';

// Import tools
import { getPatientVitals } from './tools/get-patient-vitals.js';
import { getRecentNurseNotes } from './tools/get-nurse-notes.js';
import { generateHandoverSummary } from './tools/handover-summary.js';
import { escalateToAttending } from './tools/escalate-to-attending.js';
import { logVitals } from './tools/log-vitals.js';
import { generateBatchHandover } from './tools/batch-handover.js';
import { vitalTrendsDashboard } from './tools/vital-trends-dashboard.js';
import { patientEducationGenerator } from './tools/patient-education-generator.js';


// Tool handlers
const toolHandlers: Record<string, (args: Record<string, unknown>, context: SHARPContext | null, env: Record<string, string>) => Promise<unknown>> = {
  'get_patient_vitals': async (args, context, env) => getPatientVitals(
    args as { patientId: string; sinceHours?: number },
    context,
    env
  ),
  'get_recent_nurse_notes': async (args, context, env) => getRecentNurseNotes(
    args as { patientId: string; since?: string; limit?: number },
    context,
    env
  ),
  'handover_summary': async (args, context, env) => generateHandoverSummary(
    args as { patientId: string; includeRecommendations?: boolean },
    context,
    env
  ),
  'escalate_to_attending': async (args, context, env) => escalateToAttending(
    args as { patientId: string; level: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'; message: string; reasonCode?: string },
    context,
    env
  ),
  'log_vitals': async (args, context, env) => logVitals(
    args as { patientId: string; temperature?: number; temperatureUnit?: 'C' | 'F'; heartRate?: number; systolicBP?: number; diastolicBP?: number; respiratoryRate?: number; oxygenSaturation?: number; painScore?: number; notes?: string },
    context,
    env
  ),
  'batch_handover': async (args, context, env) => generateBatchHandover(
    args as { patientIds: string[]; includeRecommendations?: boolean },
    context,
    env
  ),
  'vital_trends_dashboard': async (args, context, env) => vitalTrendsDashboard(
    args as { patientId: string; timeRange?: '6h' | '12h' | '24h' | '48h' | '7d'; vitalTypes?: Array<'heartRate' | 'bloodPressure' | 'temperature' | 'oxygenSaturation' | 'respiratoryRate' | 'painScore'> },
    context,
    env
  ),
  'patient_education_generator': async (args, context, env) => patientEducationGenerator(
    args as { patientId: string; topics?: Array<'medications' | 'diagnosis' | 'procedures' | 'lifestyle' | 'followUp' | 'warningSigns'>; language?: 'en' | 'es' | 'fr' | 'zh' | 'ar' | 'hi'; format?: 'handout' | 'qr' | 'both' },
    context,
    env
  )
};

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-FHIR-Server-URL, X-FHIR-Access-Token, X-Patient-ID',
};

// Serve UI HTML files for MCP Apps
async function serveUIFile(_filename: string): Promise<Response> {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MedBridge</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #fff; padding: 16px; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { font-size: 18px; font-weight: 500; color: #111; margin-bottom: 16px; }
    .panel { background: #f8f9fa; border-radius: 6px; padding: 16px; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e9ecef; }
    .row:last-child { border-bottom: none; }
    .label { color: #666; font-size: 13px; }
    .value { color: #111; font-size: 13px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="container">
    <h1>MedBridge</h1>
    <div class="panel">
      <div class="row">
        <span class="label">Status</span>
        <span class="value">Active</span>
      </div>
      <div class="row">
        <span class="label">Protocol</span>
        <span class="value">MCP Apps</span>
      </div>
    </div>
  </div>
  <script>
    window.parent.postMessage({ type: 'MCP_APP_READY' }, '*');
  </script>
</body>
</html>`;
  
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'public, max-age=3600',
      ...corsHeaders
    }
  });
}

export default {
  async fetch(request: Request, env: Record<string, string>): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === '/health' && request.method === 'GET') {
      return jsonResponse({
        status: 'healthy',
        service: 'medbridge-mcp-worker',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      });
    }

    // Root info
    if (path === '/' && request.method === 'GET') {
      return jsonResponse({
        name: 'MedBridge MCP Server',
        version: '1.0.0',
        description: 'Clinical handover platform - Cloudflare Workers',
        endpoints: {
          mcp: '/mcp',
          health: '/health'
        },
        tools: Object.keys(toolHandlers)
      });
    }

    // MCP JSON-RPC endpoint
    if (path === '/mcp' && request.method === 'POST') {
      return handleMCPRequest(request, env);
    }

    // UI App Routes - Serve MCP Apps HTML
    if (path === '/ui/vital-trends-chart') {
      return serveUIFile('vital-trends-chart.html');
    }
    
    if (path === '/ui/education-builder') {
      return serveUIFile('education-builder.html');
    }

    // 404
    return jsonResponse({ error: 'Not found' }, 404);
  }
};

async function handleMCPRequest(request: Request, env: Record<string, string>): Promise<Response> {
  try {
    const body = await request.json() as MCPRequest;
    
    // Validate JSON-RPC
    if (body.jsonrpc !== '2.0') {
      return jsonResponse(createErrorResponse(body.id, -32600, 'Invalid Request'), 400);
    }

    // Extract SHARP context from headers
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    
    const sharpContext = extractSHARPContext(headers);

    // Handle methods
    let result: unknown;

    switch (body.method) {
      case 'tools/list':
        result = handleToolsList();
        break;

      case 'tools/call':
        result = await handleToolsCall(
          body.params as { name: string; arguments: Record<string, unknown> },
          sharpContext,
          env
        );
        break;

      case 'initialize':
        result = handleInitialize();
        break;

      case 'notifications/initialized':
        // Notification - no response needed, return empty success
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: {} });

      case 'resources/read':
        result = await handleResourcesRead(
          body.params as { uri: string }
        );
        break;

      case 'resources/list':
        result = handleResourcesList();
        break;

      default:
        return jsonResponse(createErrorResponse(body.id, -32601, `Method not found: ${body.method}`), 404);
    }

    const response: MCPResponse = {
      jsonrpc: '2.0',
      id: body.id,
      result
    };

    return jsonResponse(response);

  } catch (error) {
    console.error('Error processing MCP request:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse(createErrorResponse(null, -32603, `Internal error: ${errorMessage}`), 500);
  }
}

function handleToolsList(): { tools: unknown[] } {
  return {
    tools: [
      {
        name: 'get_patient_vitals',
        description: 'Retrieves recent vital signs for a patient with trend analysis and critical flag detection. IMPORTANT: If patientId is not explicitly known, it will be automatically extracted from the FHIR context (current patient session).',
        inputSchema: {
          type: 'object',
          properties: {
            patientId: { type: 'string', description: 'Patient identifier - optional if using FHIR context from current session' },
            sinceHours: { type: 'integer', description: 'Lookback window in hours', minimum: 1, maximum: 168 }
          },
          required: []
        }
      },
      {
        name: 'get_recent_nurse_notes',
        description: 'Retrieves recent nursing documentation with AI-powered summary and concern detection. IMPORTANT: patientId will be extracted from FHIR context if not explicitly provided.',
        inputSchema: {
          type: 'object',
          properties: {
            patientId: { type: 'string', description: 'Patient identifier - optional if using FHIR context' },
            since: { type: 'string', format: 'date-time' },
            limit: { type: 'integer', minimum: 1, maximum: 50 }
          },
          required: []
        }
      },
      {
        name: 'handover_summary',
        description: 'Generates a comprehensive clinical handover summary with risk stratification and action items. IMPORTANT: patientId will be extracted from FHIR context if not explicitly provided.',
        inputSchema: {
          type: 'object',
          properties: {
            patientId: { type: 'string', description: 'Patient identifier - optional if using FHIR context' },
            includeRecommendations: { type: 'boolean' }
          },
          required: []
        }
      },
      {
        name: 'escalate_to_attending',
        description: 'Creates critical escalation alerts to attending physicians with FHIR CommunicationRequest support. IMPORTANT: patientId will be extracted from FHIR context if not explicitly provided.',
        inputSchema: {
          type: 'object',
          properties: {
            patientId: { type: 'string', description: 'Patient identifier - optional if using FHIR context' },
            level: { type: 'string', enum: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] },
            message: { type: 'string' },
            reasonCode: { type: 'string' }
          },
          required: ['level', 'message']
        }
      },
      {
        name: 'log_vitals',
        description: 'Records new vital signs to the FHIR server (temperature, BP, HR, O2 sat, pain score). WRITE operation - creates FHIR Observation resources. IMPORTANT: patientId will be extracted from FHIR context if not explicitly provided.',
        inputSchema: {
          type: 'object',
          properties: {
            patientId: { type: 'string', description: 'Patient identifier - optional if using FHIR context' },
            temperature: { type: 'number', description: 'Body temperature (default Celsius)' },
            temperatureUnit: { type: 'string', enum: ['C', 'F'], description: 'Temperature unit' },
            heartRate: { type: 'integer', minimum: 30, maximum: 250, description: 'Heart rate in beats/min' },
            systolicBP: { type: 'integer', minimum: 50, maximum: 300, description: 'Systolic blood pressure' },
            diastolicBP: { type: 'integer', minimum: 30, maximum: 200, description: 'Diastolic blood pressure' },
            respiratoryRate: { type: 'integer', minimum: 8, maximum: 60, description: 'Respiratory rate per minute' },
            oxygenSaturation: { type: 'number', minimum: 70, maximum: 100, description: 'O2 saturation percentage' },
            painScore: { type: 'integer', minimum: 0, maximum: 10, description: 'Pain score 0-10' },
            notes: { type: 'string', description: 'Additional notes about this vital sign reading' }
          },
          required: []
        }
      },
      {
        name: 'batch_handover',
        description: 'Generates handover summaries for multiple patients simultaneously with risk prioritization. Perfect for shift change with 6+ patients. Returns patients sorted by criticality. IMPORTANT: If patientIds not provided, uses current patient from FHIR context.',
        inputSchema: {
          type: 'object',
          properties: {
            patientIds: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Array of patient IDs (optional - uses FHIR context if empty)',
              maxItems: 20
            },
            includeRecommendations: { type: 'boolean', default: true }
          },
          required: []
        }
      },
      {
        name: 'vital_trends_dashboard',
        description: 'Opens interactive vitals chart for trend analysis with zoomable time ranges, critical event markers, and bidirectional AI integration. Visualizes vital sign trends over time with color-coded alerts. IMPORTANT: patientId will be extracted from FHIR context if not explicitly provided.',
        inputSchema: {
          type: 'object',
          properties: {
            patientId: { type: 'string', description: 'Patient identifier - optional if using FHIR context' },
            timeRange: { type: 'string', enum: ['6h', '12h', '24h', '48h', '7d'], description: 'Time window for chart display' },
            vitalTypes: { type: 'array', items: { type: 'string', enum: ['heartRate', 'bloodPressure', 'temperature', 'oxygenSaturation', 'respiratoryRate', 'painScore'] }, description: 'Vital signs to display' }
          },
          required: []
        },
        _meta: {
          ui: {
            resourceUri: 'ui://medbridge/vital-trends-chart',
            visibility: ['model', 'app']
          }
        }
      },
      {
        name: 'patient_education_generator',
        description: 'Generates personalized patient education materials with interactive handout builder. Creates customized discharge instructions, medication guides, and warning sign checklists in multiple languages. Includes QR code generation for mobile access. IMPORTANT: patientId will be extracted from FHIR context if not explicitly provided.',
        inputSchema: {
          type: 'object',
          properties: {
            patientId: { type: 'string', description: 'Patient identifier - optional if using FHIR context' },
            topics: { type: 'array', items: { type: 'string', enum: ['medications', 'diagnosis', 'procedures', 'lifestyle', 'followUp', 'warningSigns'] }, description: 'Education topics to include' },
            language: { type: 'string', enum: ['en', 'es', 'fr', 'zh', 'ar', 'hi'], description: 'Language for education materials' },
            format: { type: 'string', enum: ['handout', 'qr', 'both'], description: 'Output format' }
          },
          required: []
        },
        _meta: {
          ui: {
            resourceUri: 'ui://medbridge/education-builder',
            visibility: ['model', 'app']
          }
        }
      }
    ]
  };
}

async function handleToolsCall(
  params: { name: string; arguments: Record<string, unknown> },
  context: SHARPContext | null,
  env: Record<string, string>
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError: boolean }> {
  const { name, arguments: args } = params;

  const handler = toolHandlers[name];
  if (!handler) {
    throw new Error(`Tool not found: ${name}`);
  }

  // Validate SHARP context if provided
  if (context) {
    const validation = validateSHARPContext(context);
    if (!validation.valid) {
      throw new Error(`Invalid SHARP context: ${validation.errors.join(', ')}`);
    }
  }

  // Inject patientId from SHARP context if missing or null in args
  const mergedArgs = { ...args };
  if ((!mergedArgs.patientId || mergedArgs.patientId === null) && context?.patientId) {
    mergedArgs.patientId = context.patientId;
  }

  // Validate patientId is present
  if (!mergedArgs.patientId) {
    throw new Error(`Missing required parameter: patientId (not in args or SHARP context)`);
  }

  const result = await handler(mergedArgs, context, env);

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    isError: false
  };
}

function handleInitialize(): {
  protocolVersion: string;
  capabilities: {
    tools: { listChanged: boolean };
    resources?: { listChanged: boolean };
    extensions?: {
      'ai.promptopinion/fhir-context'?: {
        scopes: Array<{ name: string; required?: boolean }>;
      };
    };
  };
  serverInfo: { name: string; version: string };
} {
  return {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: { listChanged: false },
      resources: { listChanged: false },
      extensions: {
        'ai.promptopinion/fhir-context': {
          scopes: [
            { name: 'patient/Patient.rs', required: true },
            { name: 'patient/Observation.rs', required: true },
            { name: 'patient/DocumentReference.rs', required: false },
            { name: 'patient/CommunicationRequest.rs', required: false }
          ]
        }
      }
    },
    serverInfo: {
      name: 'medbridge',
      version: '1.0.0'
    }
  };
}

// ============================================================================
// MCP Apps UI Resource Handlers
// ============================================================================

function handleResourcesList(): { resources: Array<{ uri: string; name: string; mimeType: string }> } {
  return {
    resources: [
      {
        uri: 'ui://medbridge/vital-trends-chart',
        name: 'Vital Trends Dashboard',
        mimeType: 'text/html;profile=mcp-app'
      },
      {
        uri: 'ui://medbridge/education-builder',
        name: 'Patient Education Builder',
        mimeType: 'text/html;profile=mcp-app'
      }
    ]
  };
}

async function handleResourcesRead(params: { uri: string }): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  const { uri } = params;

  // UI Resource: Vital Trends Chart
  if (uri === 'ui://medbridge/vital-trends-chart') {
    // Note: In production, this would load from a file or template
    // For now, return a reference that the host can resolve
    return {
      contents: [
        {
          uri,
          mimeType: 'text/html;profile=mcp-app',
          text: getVitalTrendsChartHTML()
        }
      ]
    };
  }

  // UI Resource: Education Builder
  if (uri === 'ui://medbridge/education-builder') {
    return {
      contents: [
        {
          uri,
          mimeType: 'text/html;profile=mcp-app',
          text: getEducationBuilderHTML()
        }
      ]
    };
  }

  throw new Error(`Resource not found: ${uri}`);
}

// HTML Templates for MCP Apps (simplified for inline deployment)
function getVitalTrendsChartHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vital Trends</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #fff; padding: 16px; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { font-size: 18px; font-weight: 500; color: #111; margin-bottom: 16px; }
    .data-panel { background: #f8f9fa; border-radius: 6px; padding: 16px; margin-bottom: 12px; }
    .data-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e9ecef; }
    .data-row:last-child { border-bottom: none; }
    .label { color: #666; font-size: 13px; }
    .value { color: #111; font-size: 13px; font-weight: 500; }
    .status-normal { color: #198754; }
    .status-warning { color: #ffc107; }
    .status-critical { color: #dc3545; }
    .timestamp { color: #999; font-size: 11px; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Vital Trends</h1>
    <div class="data-panel">
      <div class="data-row">
        <span class="label">Heart Rate</span>
        <span class="value status-normal">-- bpm</span>
      </div>
      <div class="data-row">
        <span class="label">Blood Pressure</span>
        <span class="value">--/--</span>
      </div>
      <div class="data-row">
        <span class="label">O2 Saturation</span>
        <span class="value status-normal">--%</span>
      </div>
      <div class="data-row">
        <span class="label">Temperature</span>
        <span class="value">--.-</span>
      </div>
    </div>
    <p class="timestamp">Data from tool execution will populate here</p>
  </div>
  <script>
    window.parent.postMessage({ type: 'MCP_APP_READY' }, '*');
  </script>
</body>
</html>`;
}

function getEducationBuilderHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Education Materials</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #fff; padding: 16px; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { font-size: 18px; font-weight: 500; color: #111; margin-bottom: 16px; }
    .content-panel { background: #f8f9fa; border-radius: 6px; padding: 16px; }
    .section { margin-bottom: 16px; }
    .section-title { font-size: 13px; font-weight: 500; color: #333; margin-bottom: 8px; text-transform: uppercase; }
    .section-body { color: #555; font-size: 13px; line-height: 1.5; }
    .alert-box { background: #fff3cd; border-left: 3px solid #ffc107; padding: 12px; margin-top: 12px; border-radius: 0 4px 4px 0; }
    .alert-title { font-weight: 500; color: #856404; font-size: 12px; margin-bottom: 4px; }
    .alert-text { color: #856404; font-size: 12px; }
    .timestamp { color: #999; font-size: 11px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Patient Education</h1>
    <div class="content-panel">
      <div class="section">
        <div class="section-title">Medications</div>
        <div class="section-body">Prescribed medications and dosing instructions will appear here.</div>
      </div>
      <div class="section">
        <div class="section-title">Care Instructions</div>
        <div class="section-body">Personalized care instructions based on diagnosis.</div>
      </div>
      <div class="alert-box">
        <div class="alert-title">When to Seek Care</div>
        <div class="alert-text">Emergency and routine care guidance will populate from tool results.</div>
      </div>
    </div>
    <p class="timestamp">Generated from tool execution</p>
  </div>
  <script>
    window.parent.postMessage({ type: 'MCP_APP_READY' }, '*');
  </script>
</body>
</html>`;
}

function createErrorResponse(id: string | number | null, code: number, message: string): MCPResponse {
  return {
    jsonrpc: '2.0',
    id: id ?? 'error',
    error: { code, message }
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}
