/**
 * MedBridge MCP Server
 * JSON-RPC server implementing Model Context Protocol
 */

import express, { Request, Response } from 'express';
import type { 
  MCPRequest, 
  MCPResponse, 
  MCPError,
  SHARPContext 
} from './types/index.js';

// Import tools
import { getPatientVitalsTool, getPatientVitals } from './tools/get-patient-vitals.js';
import { getRecentNurseNotesTool, getRecentNurseNotes } from './tools/get-nurse-notes.js';
import { handoverSummaryTool, generateHandoverSummary } from './tools/handover-summary.js';
import { escalateToAttendingTool, escalateToAttending } from './tools/escalate-to-attending.js';

// Import core utilities
import { extractSHARPContext, validateSHARPContext } from './core/sharp-context.js';

// ============================================================================
// Server Configuration
// ============================================================================

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json({ limit: '10mb' }));

// ============================================================================
// MCP Tools Registry
// ============================================================================

const tools = [
  getPatientVitalsTool,
  getRecentNurseNotesTool,
  handoverSummaryTool,
  escalateToAttendingTool
];

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

// ============================================================================
// MCP JSON-RPC Endpoints
// ============================================================================

/**
 * Main MCP endpoint - handles all JSON-RPC requests
 */
app.post('/mcp', async (req: Request, res: Response) => {
  const request = req.body as MCPRequest;
  
  // Validate JSON-RPC request
  if (request.jsonrpc !== '2.0') {
    return res.json(createErrorResponse(request.id, -32600, 'Invalid Request: jsonrpc must be "2.0"'));
  }
  
  // Extract SHARP context from headers (optional for some operations)
  const _sharpContext = extractSHARPContext(req.headers as Record<string, string>);
  
  try {
    let result: unknown;
    
    switch (request.method) {
      case 'tools/list':
        result = handleToolsList();
        break;
        
      case 'tools/call':
        result = await handleToolsCall(request.params as { name: string; arguments: Record<string, unknown> }, _sharpContext);
        break;
        
      case 'initialize':
        result = handleInitialize();
        break;
        
      default:
        return res.json(createErrorResponse(request.id, -32601, `Method not found: ${request.method}`));
    }
    
    const response: MCPResponse = {
      jsonrpc: '2.0',
      id: request.id,
      result
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Error processing MCP request:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.json(createErrorResponse(request.id, -32603, `Internal error: ${errorMessage}`));
  }
  return;
});

/**
 * Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'medbridge-mcp-server',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

/**
 * Server information endpoint
 */
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'MedBridge MCP Server',
    version: '1.0.0',
    description: 'Clinical handover platform with MCP and A2A standards',
    endpoints: {
      mcp: '/mcp',
      health: '/health'
    },
    tools: tools.map(t => ({ name: t.name, description: t.description }))
  });
});

// ============================================================================
// MCP Method Handlers
// ============================================================================

function handleToolsList(): { tools: typeof tools } {
  return { tools };
}

async function handleToolsCall(
  params: { name: string; arguments: Record<string, unknown> },
  context: SHARPContext | null
): Promise<{ content: Array<{ type: string; content: unknown }>; isError: boolean }> {
  const { name, arguments: args } = params;
  
  // Check if tool exists
  const handler = toolHandlers[name];
  if (!handler) {
    throw new Error(`Tool not found: ${name}`);
  }
  
  // For tools that require patient context, validate SHARP context
  if (context) {
    const validation = validateSHARPContext(context);
    if (!validation.valid) {
      throw new Error(`Invalid SHARP context: ${validation.errors.join(', ')}`);
    }
  }
  
  // Execute tool
  const result = await handler(args, context);
  
  return {
    content: [
      {
        type: 'structured',
        content: result
      }
    ],
    isError: false
  };
}

function handleInitialize(): { 
  protocolVersion: string; 
  capabilities: { 
    tools: { listChanged: boolean }; 
  }; 
  serverInfo: { 
    name: string; 
    version: string; 
  }; 
} {
  return {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: {
        listChanged: false
      }
    },
    serverInfo: {
      name: 'medbridge',
      version: '1.0.0'
    }
  };
}

// ============================================================================
// Error Handling
// ============================================================================

function createErrorResponse(id: string | number, code: number, message: string, data?: unknown): MCPResponse {
  const error: MCPError = {
    code,
    message,
    data
  };
  
  return {
    jsonrpc: '2.0',
    id,
    error
  };
}

// ============================================================================
// Server Startup
// ============================================================================

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    MedBridge MCP Server                      ║
║                                                              ║
║  Clinical Handover Platform                                  ║
║  Port: ${PORT}                                                ║
║  Health: http://localhost:${PORT}/health                       ║
║  MCP Endpoint: http://localhost:${PORT}/mcp                   ║
╚══════════════════════════════════════════════════════════════╝
  `);
  
  console.log('Registered Tools:');
  tools.forEach(tool => {
    console.log(`  ✓ ${tool.name}`);
  });
});

export default app;
