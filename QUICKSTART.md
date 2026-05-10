# MedBridge Quickstart for PromptOpinion

## What You're Building

**Only the MCP Server gets deployed externally.** The A2A Agent lives on PromptOpinion's platform.

## Deploy MCP Server (5 minutes)

### Cloudflare Workers (Recommended - FREE)

```bash
# 1. Install Wrangler CLI
npm install -g wrangler

# 2. Login to Cloudflare
wrangler login

# 3. Deploy (FREE - 100k requests/day)
wrangler deploy

# 4. Get your Workers URL
# Output: https://medbridge-mcp.your-account.workers.dev
```

### Local Development (Express)

```bash
# For local testing only (not for deployment)
npm install
npm run build
npm run start:demo
```

## Configure in PromptOpinion (2 minutes)

### Step 1: Add MCP Server

Go to: **Settings → MCP Servers → Add Custom MCP Server**

| Field | Value |
|-------|-------|
| Friendly Name | `MedBridge Clinical Handover` |
| Endpoint | `https://your-domain.com/mcp` |
| Transport Type | `HTTP` |
| Authentication | `API Key` |
| API Key Header | `X-API-Key` |
| API Key Value | `medbridge_live_sk_$(openssl rand -hex 16)` |

### Step 2: Create A2A Agent (No Code!)

Go to: **Agents → Create Agent**

**Basic Info:**
- Name: `handover-agent`
- Display Name: `Clinical Handover Assistant`
- Description: `AI agent for nursing shift handovers`

**Capabilities Extension:**
```json
{
  "extensions": [
    {
      "uri": "https://app.promptopinion.ai/schemas/a2a/v1/fhir-context",
      "description": "FHIR context for patient data access",
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
}
```

**Connect MCP Tools:**
- Toggle "Use MCP Tools"
- Select your `MedBridge Clinical Handover` server
- Done!

### Step 3: Test

1. Go to **Chat**
2. Select any patient from dropdown (e.g., "John Doe")
3. Type: "Prepare handover for this patient"
4. Watch your agent:
   - Receive SHARP headers automatically
   - Call your MCP server
   - Fetch real FHIR data
   - Return handover summary

## Architecture

```
┌────────────────────────────────────────┐
│     PROMPTOPINION (Their Platform)      │
│                                         │
│  Chat UI → A2A Agent → Your MCP Server │
│              (Built-in)   (Your Deploy) │
│                                         │
│  • Patient selector                      │
│  • FHIR sandbox                        │
│  • SHARP headers                       │
│  • Agent builder (no code)              │
└────────────────────────────────────────┘
                   │
                   │ HTTPS + SHARP Headers
                   │
                   ▼
┌────────────────────────────────────────┐
│     YOUR DEPLOYMENT (MCP Server Only)   │
│                                         │
│  POST /mcp                             │
│    ├── get_patient_vitals               │
│    ├── get_recent_nurse_notes          │
│    ├── handover_summary                 │
│    └── escalate_to_attending           │
│                                         │
│  Hosted on: Railway / Cloud Run / etc   │
└────────────────────────────────────────┘
```

## Files You Need

```
medbridge/
├── src/
│   ├── server.ts              # MCP JSON-RPC server
│   ├── tools/                 # 4 clinical tools
│   ├── core/
│   │   ├── fhir-client.ts     # FHIR API client
│   │   ├── sharp-context.ts   # SHARP header handler
│   │   └── risk-assessor.ts   # Clinical risk engine
│   └── data/
│       └── patients.ts        # Demo data (fallback)
├── dist/                      # Compiled JS (gitignore)
├── package.json
├── tsconfig.json
├── wrangler.toml              # Cloudflare Workers config
├── src/worker.ts              # Cloudflare entry point
└── README.md
```

## Cost

- **MCP Server**: FREE | Cloudflare Workers (100k requests/day)
- **PromptOpinion**: Free for hackathon

## Troubleshooting

**MCP server not connecting:**
```bash
# Test your endpoint
curl -X POST https://your-domain.com/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list"}'

# Should return list of 4 tools
```

**FHIR data not loading:**
- Enable `DEMO_MODE=true` temporarily to test tool logic
- Verify patient selected in PromptOpinion UI
- Check SHARP headers are being passed

**Agent not using tools:**
- Ensure MCP server shows "Connected" in UI
- Map agent capabilities correctly
- Authorize FHIR scopes when prompted

## Demo Video Script

1. Show PromptOpinion chat interface
2. Select patient from dropdown
3. Type: "Prepare handover for this patient"
4. Show AI-generated handover summary
5. Point out critical risk flags
6. Show escalation capability

Total time: ~2 minutes

## Next Steps

1. ✅ Build MCP server (done)
2. 🔄 Deploy to Cloudflare Workers
3. ⏳ Configure in PromptOpinion
4. ⏳ Test with sandbox patient
5. ⏳ Record demo video
6. ⏳ Submit to marketplace

---

**Questions?** Check `DEPLOYMENT-CF.md` for the complete Cloudflare Workers guide.
