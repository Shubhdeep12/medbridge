# MedBridge Deployment Guide - Cloudflare Workers

## Overview

MedBridge is deployed as an **MCP Server on Cloudflare Workers** (free tier). The A2A Agent is configured **directly within PromptOpinion's platform UI** (no code required).

```
┌────────────────────────────────────────────────────────────┐
│                  PromptOpinion Platform                     │
│  ┌─────────────┐         ┌─────────────────────────────┐   │
│  │  Chat UI   │◄────────►│  A2A Agent (Configured     │   │
│  │            │          │   on-platform, no code)    │   │
│  └─────────────┘         └─────────────┬───────────────┘   │
│                                        │                   │
│                              SHARP Headers                 │
│                      (X-FHIR-Token, X-Patient-ID)         │
│                                        │                   │
└────────────────────────────────────┼───────────────────────┘
                                     │
                                     ▼ HTTPS + JSON-RPC
┌────────────────────────────────────────────────────────────┐
│           CLOUDFLARE WORKERS (Free Tier)                    │
│                                                             │
│  POST /mcp                                                  │
│    ├── get_patient_vitals                                  │
│    ├── get_recent_nurse_notes                              │
│    ├── handover_summary                                     │
│    └── escalate_to_attending                               │
│                                                             │
│  URL: https://medbridge-mcp.chhabrashubhdeep.workers.dev   │
└────────────────────────────────────────────────────────────┘
```

## What Gets Deployed

### ✅ MCP Server (Cloudflare Workers)
Deployed to Cloudflare's edge network (200+ locations worldwide)
- **4 Tools**: get_patient_vitals, get_recent_nurse_notes, handover_summary, escalate_to_attending
- **Endpoint**: `https://medbridge-mcp.chhabrashubhdeep.workers.dev/mcp`
- **Protocol**: MCP JSON-RPC over HTTP
- **Cost**: FREE (100,000 requests/day)

### ❌ A2A Agent (On-Platform)
**NOT deployed externally**. Configured directly in PromptOpinion UI:
- Go to Agent Builder in PromptOpinion
- Create agent with capabilities: `prepare_handover`, `detect_risks`, `escalate_critical`
- Point to your MCP tools
- No code required

## Prerequisites

1. **Cloudflare Account** (free): https://dash.cloudflare.com/sign-up
2. **Wrangler CLI**: `npm install -g wrangler`
3. **Authenticated**: `wrangler login`

## Deployment Steps

### Step 1: Configure Wrangler

```bash
# Already done - wrangler.toml is in the repo
cat wrangler.toml
```

### Step 2: Deploy to Cloudflare

```bash
# Navigate to project
cd medbridge

# Deploy (FREE)
wrangler deploy

# Output:
# ⛅️ wrangler 3.x
# ✨ Successfully created script
# ✨ Successfully published your script
# https://medbridge-mcp.chhabrashubhdeep.workers.dev
```

### Step 3: Get Your Endpoint

After deployment, you'll get a URL:
```
https://medbridge-mcp.chhabrashubhdeep.workers.dev/mcp
```

### Step 4: Configure in PromptOpinion

Go to **PromptOpinion App → Settings → MCP Servers → Add Custom MCP Server**

| Field | Value | Example |
|-------|-------|---------|
| **Friendly Name** | `MedBridge Handover` | Any display name |
| **Endpoint** | Your Workers URL + `/mcp` | `https://medbridge-mcp.chhabrashubhdeep.workers.dev/mcp` |
| **Transport Type** | `HTTP` | JSON-RPC over HTTP |
| **Authentication Type** | `API Key` | X-API-Key header |
| **API Key Header Name** | `X-API-Key` | Standard SHARP header |
| **API Key Header Value** | Generate secure key | `mb_live_abc123xyz...` |

### Step 5: Create A2A Agent (No Code!)

Go to **PromptOpinion → Agents → Create Agent**

**Agent Configuration:**
```json
{
  "name": "clinical-handover-agent",
  "displayName": "Clinical Handover Assistant",
  "description": "AI agent for nursing shift handovers with risk detection",
  "capabilities": {
    "extensions": [
      {
        "uri": "https://app.promptopinion.ai/schemas/a2a/v1/fhir-context",
        "description": "FHIR context for accessing patient data",
        "required": true,
        "params": {
          "scopes": [
            { "name": "patient/Patient.read", "required": true },
            { "name": "patient/Observation.read", "required": true },
            { "name": "patient/DocumentReference.read", "required": false },
            { "name": "patient/CommunicationRequest.write", "required": false }
          ]
        }
      }
    ]
  },
  "skills": [
    "clinical-handover",
    "risk-assessment",
    "vital-signs-analysis"
  ]
}
```

**Connect MCP Tools:**
- In agent configuration, select "Use MCP Tools"
- Choose your deployed `MedBridge Handover` MCP server
- Map agent capabilities to MCP tool names

### Step 6: Test in Chat

1. Go to PromptOpinion Chat
2. Select a patient from the FHIR sandbox
3. Invoke your agent: "Prepare handover for this patient"
4. Agent will:
   - Call MCP tools with SHARP headers
   - MCP server fetches real FHIR data
   - Returns handover summary with risk assessment

## Local Development

```bash
# Install dependencies
npm install

# Local dev server (Express)
npm run dev

# Or test Cloudflare Workers locally
npm run dev:worker
```

## Wrangler Commands

```bash
# Deploy
wrangler deploy

# View logs
wrangler tail

# Set secrets (for production keys)
wrangler secret put API_KEY

# Custom domain (optional)
wrangler route publish
```

## Environment Variables

### Local (.env file)
```env
DEMO_MODE=false
NODE_ENV=development
```

### Cloudflare Secrets
```bash
# Set via wrangler (encrypted at rest)
wrangler secret put DEMO_MODE
# Enter: false
```

## SHARP Headers (Automatic)

PromptOpinion automatically sends these headers with every MCP tool call:

```
X-FHIR-Server-URL: https://api.promptopinion.ai/fhir/r4
X-FHIR-Access-Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
X-Patient-ID: <selected-patient-id>
X-API-Key: <your-configured-api-key>
```

Your MCP server (Cloudflare Worker) extracts these and queries the FHIR server directly.

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│  PROMPTOPINION PLATFORM (You don't deploy this)              │
│                                                              │
│  ┌──────────────┐    ┌──────────────────────────────┐       │
│  │   Chat UI    │───►│  A2A Agent (Built-in Config)  │       │
│  │   (Selects   │    │  - prepare_handover            │       │
│  │    Patient)  │    │  - detect_risks               │       │
│  └──────────────┘    │  - escalate_critical          │       │
│                      └──────────────┬──────────────────┘       │
│                                     │                          │
│                         SHARP Headers                          │
│         (X-FHIR-Token, X-Patient-ID, X-API-Key)                │
│                                     │                          │
└─────────────────────────────────────┼──────────────────────────┘
                                      │
                                      ▼ HTTPS
┌─────────────────────────────────────────────────────────────┐
│  CLOUDFLARE WORKERS (Your Deployment)                        │
│                                                              │
│  https://medbridge-mcp.chhabrashubhdeep.workers.dev         │
│                                                              │
│  POST /mcp ──┬──► tools/list                                │
│              │                                              │
│              └──► tools/call                               │
│                    ├── get_patient_vitals ◄────┐          │
│                    ├── get_recent_nurse_notes    │          │
│                    ├── handover_summary            │          │
│                    └── escalate_to_attending ─────┘          │
│                                                              │
│  FHIR Client ──► PromptOpinion FHIR Sandbox                  │
│  (uses SHARP headers)                                        │
│                                                              │
│  Cost: FREE (100k requests/day)                              │
└─────────────────────────────────────────────────────────────┘
```

## Cloudflare Workers Benefits

| Feature | Benefit |
|---------|---------|
| **Cost** | FREE tier: 100,000 requests/day |
| **Speed** | Edge-deployed (200+ locations) |
| **Cold Start** | Near-zero (edge runtime) |
| **HTTPS** | Automatic SSL |
| **DDoS** | Built-in protection |
| **Scaling** | Auto-scale to millions |

## Troubleshooting

### MCP Server Not Connecting
```bash
# Test your endpoint
curl -X POST https://medbridge-mcp.chhabrashubhdeep.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list"}'
```

### FHIR Data Not Loading
- Check SHARP headers are being received
- Verify patient ID exists in PromptOpinion sandbox
- View logs: `wrangler tail`

### Agent Not Using Tools
- Ensure MCP server is "Connected" in PromptOpinion UI
- Map agent capabilities to correct tool names
- Check agent has required FHIR scopes authorized

### Wrangler Issues
```bash
# Login again
wrangler login

# Check config
wrangler config

# Verify deployment
wrangler deploy --dry-run
```

## Custom Domain (Optional)

```bash
# Add custom domain
wrangler route publish medbridge.yourdomain.com/*

# Or in wrangler.toml
routes = [
  { pattern = "medbridge.yourdomain.com/*", custom_domain = true }
]
```

## Quick Start Checklist

- [ ] Install Wrangler: `npm install -g wrangler`
- [ ] Login: `wrangler login`
- [ ] Deploy: `wrangler deploy`
- [ ] Get Workers URL
- [ ] Add MCP server in PromptOpinion
- [ ] Create A2A agent in PromptOpinion UI
- [ ] Authorize agent with FHIR scopes
- [ ] Test in chat with sandbox patient
- [ ] Record demo video

## Migration from Express Server

If you were using the Express server locally:

1. **Code**: No changes needed - `worker.ts` mirrors `server.ts`
2. **Deployment**: Replace `npm start` with `wrangler deploy`
3. **Logs**: Use `wrangler tail` instead of console output
4. **Testing**: Same `test-mcp.js` works (just change URL)

## Support

- **Cloudflare Workers Docs**: https://developers.cloudflare.com/workers/
- **PromptOpinion MCP Docs**: https://docs.promptopinion.ai/
- **SHARP on MCP Spec**: https://www.sharponmcp.com/
- **Wrangler CLI**: https://developers.cloudflare.com/workers/wrangler/
