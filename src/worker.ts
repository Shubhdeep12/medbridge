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

// Tool handlers
const toolHandlers: Record<string, (args: Record<string, unknown>, context: SHARPContext | null) => Promise<unknown>> = {
  'get_patient_vitals': async (args, context) => getPatientVitals(
    args as { patientId: string; sinceHours?: number },
    context
  ),
  'get_recent_nurse_notes': async (args, context) => getRecentNurseNotes(
    args as { patientId: string; since?: string; limit?: number },
    context
  ),
  'handover_summary': async (args, context) => generateHandoverSummary(
    args as { patientId: string; includeRecommendations?: boolean },
    context
  ),
  'escalate_to_attending': async (args, context) => escalateToAttending(
    args as { patientId: string; level: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'; message: string; reasonCode?: string },
    context
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
          sharpContext
        );
        break;

      case 'initialize':
        result = handleInitialize();
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
        description: 'Retrieves recent vital signs for a patient with trend analysis and critical flag detection',
        inputSchema: {
          type: 'object',
          properties: {
            patientId: { type: 'string', description: 'Unique patient identifier' },
            sinceHours: { type: 'integer', description: 'Lookback window in hours', minimum: 1, maximum: 168 }
          },
          required: ['patientId']
        }
      },
      {
        name: 'get_recent_nurse_notes',
        description: 'Retrieves recent nursing documentation with AI-powered summary and concern detection',
        inputSchema: {
          type: 'object',
          properties: {
            patientId: { type: 'string' },
            since: { type: 'string', format: 'date-time' },
            limit: { type: 'integer', minimum: 1, maximum: 50 }
          },
          required: ['patientId']
        }
      },
      {
        name: 'handover_summary',
        description: 'Generates a comprehensive clinical handover summary with risk stratification and action items',
        inputSchema: {
          type: 'object',
          properties: {
            patientId: { type: 'string' },
            includeRecommendations: { type: 'boolean' }
          },
          required: ['patientId']
        }
      },
      {
        name: 'escalate_to_attending',
        description: 'Creates critical escalation alerts to attending physicians with FHIR CommunicationRequest support',
        inputSchema: {
          type: 'object',
          properties: {
            patientId: { type: 'string' },
            level: { type: 'string', enum: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] },
            message: { type: 'string' },
            reasonCode: { type: 'string' }
          },
          required: ['patientId', 'level', 'message']
        }
      }
    ]
  };
}

async function handleToolsCall(
  params: { name: string; arguments: Record<string, unknown> },
  context: SHARPContext | null
): Promise<{ content: Array<{ type: string; content: unknown }>; isError: boolean }> {
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

  const result = await handler(args, context);

  return {
    content: [{ type: 'structured', content: result }],
    isError: false
  };
}

function handleInitialize(): {
  protocolVersion: string;
  capabilities: { tools: { listChanged: boolean } };
  serverInfo: { name: string; version: string };
} {
  return {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: { listChanged: false }
    },
    serverInfo: {
      name: 'medbridge',
      version: '1.0.0'
    }
  };
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
