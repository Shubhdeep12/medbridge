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
        description: 'Generates handover summaries for multiple patients simultaneously with risk prioritization. Perfect for shift change with 6+ patients. Returns patients sorted by criticality.',
        inputSchema: {
          type: 'object',
          properties: {
            patientIds: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Array of patient IDs (1-20 patients)',
              minItems: 1,
              maxItems: 20
            },
            includeRecommendations: { type: 'boolean', default: true }
          },
          required: ['patientIds']
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
  <title>MedBridge - Vital Trends Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 24px; }
    h1 { color: #1a365d; font-size: 24px; margin-bottom: 8px; display: flex; align-items: center; gap: 12px; }
    .subtitle { color: #64748b; font-size: 14px; margin-bottom: 20px; }
    .controls { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; align-items: center; padding: 16px; background: #f8fafc; border-radius: 8px; }
    .control-group { display: flex; flex-direction: column; gap: 4px; }
    .control-group label { font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
    select, button { padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px; background: white; cursor: pointer; }
    button { background: #3b82f6; color: white; border: none; font-weight: 500; }
    button:hover { background: #2563eb; }
    .vital-toggles { display: flex; gap: 12px; flex-wrap: wrap; }
    .vital-toggle { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; font-size: 13px; cursor: pointer; }
    .vital-toggle.active { background: #dbeafe; color: #1e40af; }
    .vital-toggle.inactive { background: #f1f5f9; color: #64748b; }
    .chart-container { position: relative; height: 400px; margin-bottom: 24px; background: #fafafa; border-radius: 8px; padding: 16px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-top: 24px; }
    .stat-card { background: #f8fafc; padding: 16px; border-radius: 8px; border-left: 4px solid #3b82f6; }
    .stat-card.critical { border-left-color: #ef4444; }
    .stat-card.warning { border-left-color: #f59e0b; }
    .stat-label { font-size: 12px; color: #64748b; text-transform: uppercase; }
    .stat-value { font-size: 24px; font-weight: 600; color: #1e293b; }
    .events-list { margin-top: 24px; }
    .event-item { display: flex; align-items: center; gap: 12px; padding: 12px; border-left: 3px solid #ef4444; background: #fef2f2; border-radius: 0 6px 6px 0; margin-bottom: 8px; }
    .ai-btn { background: #7c3aed; }
    .ai-btn:hover { background: #6d28d9; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Vital Trends Dashboard</h1>
    <p class="subtitle">Interactive visualization with AI-powered analysis</p>
    <div class="controls">
      <div class="control-group">
        <label>Time Range</label>
        <select id="timeRange"><option value="6h">Last 6 Hours</option><option value="12h">Last 12 Hours</option><option value="24h" selected>Last 24 Hours</option><option value="48h">Last 48 Hours</option><option value="7d">Last 7 Days</option></select>
      </div>
      <div class="vital-toggles">
        <div class="vital-toggle active" data-vital="hr"><span style="width:8px;height:8px;border-radius:50%;background:#ef4444;display:inline-block"></span> Heart Rate</div>
        <div class="vital-toggle active" data-vital="bp"><span style="width:8px;height:8px;border-radius:50%;background:#3b82f6;display:inline-block"></span> Blood Pressure</div>
        <div class="vital-toggle active" data-vital="o2"><span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block"></span> O2 Saturation</div>
      </div>
      <button class="ai-btn" onclick="sendToAI('Analyze these vital sign trends')">✨ AI Analysis</button>
    </div>
    <div class="chart-container">
      <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8">
        Interactive chart will render here with live data from tool results
      </div>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Latest Heart Rate</div><div class="stat-value">72 <small style="font-size:14px">bpm</small></div></div>
      <div class="stat-card"><div class="stat-label">Blood Pressure</div><div class="stat-value">120/80</div></div>
      <div class="stat-card"><div class="stat-label">O2 Saturation</div><div class="stat-value">98%</div></div>
    </div>
  </div>
  <script>
    function sendToAI(message) {
      window.parent.postMessage({ jsonrpc: '2.0', id: Date.now(), method: 'ui/message', params: { role: 'user', content: { type: 'text', text: message } } }, '*');
    }
    window.parent.postMessage({ jsonrpc: '2.0', id: 1, method: 'ui/initialize', params: {} }, '*');
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
  <title>MedBridge - Patient Education Builder</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; padding: 20px; }
    .container { max-width: 1000px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 24px; }
    h1 { color: #1a365d; font-size: 24px; margin-bottom: 8px; display: flex; align-items: center; gap: 12px; }
    .subtitle { color: #64748b; font-size: 14px; margin-bottom: 20px; }
    .builder-layout { display: grid; grid-template-columns: 280px 1fr; gap: 24px; }
    @media (max-width: 768px) { .builder-layout { grid-template-columns: 1fr; } }
    .sidebar { background: #f8fafc; border-radius: 8px; padding: 20px; }
    .section-title { font-size: 13px; font-weight: 600; color: #475569; text-transform: uppercase; margin-bottom: 12px; }
    .topic-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
    .topic-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: white; border-radius: 6px; cursor: pointer; border: 2px solid transparent; }
    .topic-item.selected { border-color: #3b82f6; background: #eff6ff; }
    .btn { padding: 10px 16px; border: none; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-success { background: #10b981; color: white; }
    .preview-pane { background: white; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    .preview-header { background: #f8fafc; padding: 16px 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
    .preview-content { padding: 24px; max-height: 600px; overflow-y: auto; }
    .handout { max-width: 600px; margin: 0 auto; padding: 32px; border: 1px solid #e2e8f0; border-radius: 8px; }
    .handout-header { text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; margin-bottom: 24px; }
    .warning-sign-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px; background: #fef2f2; border-left: 4px solid #ef4444; border-radius: 0 6px 6px 0; margin-bottom: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📚 Patient Education Builder</h1>
    <p class="subtitle">Create personalized education materials</p>
    <div class="builder-layout">
      <div class="sidebar">
        <div class="section-title">Topics</div>
        <div class="topic-list">
          <div class="topic-item selected">💊 Medications</div>
          <div class="topic-item selected">🏥 Diagnosis</div>
          <div class="topic-item">📅 Follow-up</div>
          <div class="topic-item selected">⚠️ Warning Signs</div>
        </div>
        <button class="btn btn-primary" style="width:100%" onclick="generateMaterials()">Generate</button>
      </div>
      <div class="preview-pane">
        <div class="preview-header"><strong>Preview</strong> <button class="btn btn-success" onclick="downloadPDF()">Download PDF</button></div>
        <div class="preview-content">
          <div class="handout">
            <div class="handout-header">
              <h2>🏥 MedBridge</h2>
              <p>Patient Education Materials</p>
            </div>
            <div class="warning-sign-item"><strong>⚠️ Call 911:</strong> Chest pain or difficulty breathing</div>
            <div class="warning-sign-item" style="background:#fff7ed;border-left-color:#f59e0b"><strong>📞 Call Doctor:</strong> Fever over 101°F</div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <script>
    function generateMaterials() {
      window.parent.postMessage({ jsonrpc: '2.0', id: Date.now(), method: 'ui/message', params: { role: 'user', content: { type: 'text', text: 'Generate patient education handout' } } }, '*');
    }
    function downloadPDF() {
      window.parent.postMessage({ jsonrpc: '2.0', id: Date.now(), method: 'ui/message', params: { role: 'user', content: { type: 'text', text: 'Download education materials as PDF' } } }, '*');
    }
    window.parent.postMessage({ jsonrpc: '2.0', id: 1, method: 'ui/initialize', params: {} }, '*');
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
