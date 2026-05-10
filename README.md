# MedBridge

**Clinical Handover Platform with MCP and A2A Standards**

MedBridge is a healthcare AI solution that streamlines nursing shift handovers using open standards (MCP, A2A, FHIR) to ensure interoperability, security, and clinical excellence.

## Overview

MedBridge connects healthcare organizations with intelligent agents that:
- **Gather** patient data from FHIR-based EHRs
- **Analyze** vitals and notes for critical trends
- **Generate** comprehensive handover summaries
- **Escalate** urgent cases to attending physicians
- **Coordinate** multi-agent workflows for complex patients

## Architecture

**MCP Server Only** - Deployed externally. A2A Agent configured on PromptOpinion platform.

```
┌─────────────────────────────────────────────────────────────┐
│              PROMPTOPINION PLATFORM                          │
│  ┌─────────────┐    ┌─────────────────────────────────────┐ │
│  │  Chat UI   │───►│  A2A Agent (Configured on-platform) │ │
│  │  (Patient  │    │  - prepare_handover                 │ │
│  │   Selector)│    │  - detect_risks                     │ │
│  └─────────────┘    │  - escalate_critical                │ │
│                     └─────────────┬───────────────────────┘ │
│                                   │                         │
│                         SHARP Headers                       │
│              (X-FHIR-Token, X-Patient-ID)                   │
│                                   │                         │
└───────────────────────────────────┼─────────────────────────┘
                                    │
                                    ▼ HTTP + JSON-RPC
┌─────────────────────────────────────────────────────────────┐
│              YOUR DEPLOYMENT (MCP Server Only)              │
│                                                             │
│  POST /mcp                                                  │
│    ├── get_patient_vitals ─────► FHIR Server               │
│    ├── get_recent_nurse_notes                               │
│    ├── handover_summary                                     │
│    └── escalate_to_attending                                │
│                                                             │
│  Hosted on: Railway / Cloud Run / Heroku / VPS             │
└─────────────────────────────────────────────────────────────┘
```

## Components

### MCP Server (Superpowers)

Four clinical tools exposed via JSON-RPC:

1. **`get_patient_vitals`** - Retrieves vital signs with trend analysis
   - Input: `patientId`, `sinceHours`
   - Output: Vitals array, trend direction, critical flags

2. **`get_recent_nurse_notes`** - Retrieves and summarizes nursing documentation
   - Input: `patientId`, `since`, `limit`
   - Output: Notes, AI summary, detected concerns

3. **`handover_summary`** - Generates comprehensive handover narrative
   - Input: `patientId`, `includeRecommendations`
   - Output: Structured summary, key findings, action items, risk level

4. **`escalate_to_attending`** - Creates critical alerts
   - Input: `patientId`, `level`, `message`, `reasonCode`
   - Output: Escalation status, FHIR CommunicationRequest support

### A2A Agent (Superhero)

**MedBridge Handover Agent** with capabilities:
- `prepare_handover` - Gather patient context
- `detect_risks` - Analyze for critical trends
- `escalate_critical` - Alert attending physicians
- `receive_handover` - Deliver to incoming nurse

## Technology Stack

- **Runtime**: Node.js 20+ with TypeScript
- **Protocols**: MCP (Model Context Protocol), A2A (Agent-to-Agent)
- **Standards**: FHIR R4, SMART-on-FHIR, SHARP Context Propagation
- **Security**: OAuth2, TLS 1.3, PHI-safe session state
- **Deployment**: Cloudflare Workers (FREE), Railway, VPS

## Quick Start

### Prerequisites

- Node.js 20+ 
- pnpm (`npm install -g pnpm`)

### Installation

```bash
# Install dependencies
pnpm install

# Build TypeScript
pnpm run build

# Start development server
pnpm run dev

# Or production mode
pnpm run start:prod
```

Server runs at `http://localhost:3000`

### Deploy to Production

**Cloudflare Workers (Recommended - FREE)**
```bash
# Install Wrangler
npm install -g wrangler

# Login and deploy
wrangler login
wrangler deploy

# Get URL: https://medbridge-mcp.your-account.workers.dev
```

**Other Options**: See `DEPLOYMENT-CF.md` for detailed guides.

## API Usage

### MCP Tools List

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "1",
    "method": "tools/list"
  }'
```

### Get Patient Vitals

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "X-FHIR-Server-URL: https://fhir.example.com/r4" \
  -H "X-FHIR-Access-Token: eyJhbGc..." \
  -H "X-Patient-ID: P1001" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "jsonrpc": "2.0",
    "id": "2",
    "method": "tools/call",
    "params": {
      "name": "get_patient_vitals",
      "arguments": {
        "patientId": "P1001",
        "sinceHours": 24
      }
    }
  }'
```

### Generate Handover Summary

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "3",
    "method": "tools/call",
    "params": {
      "name": "handover_summary",
      "arguments": {
        "patientId": "P1001",
        "includeRecommendations": true
      }
    }
  }'
```

## Synthetic Patient Data

MedBridge includes 3 realistic patient scenarios:

### P1001: John Doe (78M)
**Diagnosis**: Pneumonia, Hypertension, Diabetes
**Scenario**: Deteriorating vitals (rising BP, fever, confusion)
**Tests**: Abnormal trend detection, escalation triggers

### P1002: Jane Smith (45F)
**Diagnosis**: Post-op cholecystectomy
**Scenario**: Elevated lactate unexplained, discharge ready
**Tests**: Lab-value reconciliation, plan conflicts

### P1003: Carlos Ruiz (60M)
**Diagnosis**: Long COVID, Atrial Fibrillation, Anticoagulation
**Scenario**: Falls risk documented by nursing but missing from plan
**Tests**: Documentation gap detection

## Security & Compliance

- **PHI Protection**: FHIR context in headers only, never in prompts
- **Authentication**: SMART-on-FHIR OAuth2 with least-privilege scopes
- **Audit Trail**: All tool calls and escalations logged
- **Encryption**: TLS 1.3 for all communications
- **Standards**: HIPAA-ready architecture, GDPR compliant

## Configuration

### Environment Variables

```env
PORT=3000
NODE_ENV=production
LOG_LEVEL=info
FHIR_SERVER_URL=https://fhir.example.com/r4
```

### A2A Agent Registration

```json
{
  "name": "medbridge-handover-agent",
  "capabilities": ["prepare_handover", "detect_risks", "escalate_critical"],
  "endpoint": "https://api.medbridge.health/a2a/webhook",
  "authentication": {
    "type": "apiKey",
    "headerName": "X-API-Key"
  }
}
```

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Run tests
npm test

# Lint code
npm run lint
```

## Project Structure

```
medbridge/
├── src/
│   ├── server.ts              # MCP JSON-RPC server
│   ├── types/
│   │   └── index.ts           # TypeScript definitions
│   ├── tools/
│   │   ├── get-patient-vitals.ts
│   │   ├── get-nurse-notes.ts
│   │   ├── handover-summary.ts
│   │   └── escalate-to-attending.ts
│   ├── data/
│   │   └── patients.ts        # Synthetic patient data
│   ├── core/
│   │   ├── sharp-context.ts   # FHIR context handler
│   │   └── risk-assessor.ts   # Clinical risk engine
│   └── a2a/
│       ├── agent-card.json    # A2A AgentCard
│       └── workflow-config.yaml
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT License - See LICENSE file for details

## Support

For issues and feature requests, please contact the MedBridge team.

---

**Built with open standards for healthcare interoperability**
