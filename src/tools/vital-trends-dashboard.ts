/**
 * Vital Trends Dashboard Tool (MCP App)
 * Interactive charting app for visual trend analysis
 * MCP Apps extension with ui:// resource support
 */

import { z } from 'zod';
import type { MCPTool, SHARPContext } from '../types/index.js';
import { fetchPatientRecord } from '../core/fhir-client.js';

const inputSchema = z.object({
  patientId: z.string().min(1),
  timeRange: z.enum(['6h', '12h', '24h', '48h', '7d']).default('24h'),
  vitalTypes: z.array(z.enum(['heartRate', 'bloodPressure', 'temperature', 'oxygenSaturation', 'respiratoryRate', 'painScore'])).default(['heartRate', 'bloodPressure', 'oxygenSaturation'])
});

export interface VitalTrendsDashboardInput {
  patientId: string;
  timeRange?: '6h' | '12h' | '24h' | '48h' | '7d';
  vitalTypes?: Array<'heartRate' | 'bloodPressure' | 'temperature' | 'oxygenSaturation' | 'respiratoryRate' | 'painScore'>;
}

export interface VitalTrendsDashboardOutput {
  status: 'SUCCESS' | 'NO_DATA';
  patientId: string;
  patientName: string;
  timeRange: string;
  vitalTypes: string[];
  dataPoints: number;
  criticalEvents: Array<{
    timestamp: string;
    vital: string;
    value: number;
    threshold: string;
  }>;
  uiResourceUri: string;
  summary: string;
}

// MCP Tool Definition with MCP Apps metadata
export const vitalTrendsDashboardTool: MCPTool = {
  name: 'vital_trends_dashboard',
  description: 'Opens interactive vitals chart for trend analysis with zoomable time ranges, critical event markers, and bidirectional AI integration. Visualizes vital sign trends over time with color-coded alerts.',
  inputSchema: {
    type: 'object',
    properties: {
      patientId: {
        type: 'string',
        description: 'Unique patient identifier'
      },
      timeRange: {
        type: 'string',
        enum: ['6h', '12h', '24h', '48h', '7d'],
        description: 'Time window for chart display',
        default: '24h'
      },
      vitalTypes: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['heartRate', 'bloodPressure', 'temperature', 'oxygenSaturation', 'respiratoryRate', 'painScore']
        },
        description: 'Vital signs to display on chart',
        default: ['heartRate', 'bloodPressure', 'oxygenSaturation']
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
      timeRange: { type: 'string' },
      vitalTypes: { type: 'array', items: { type: 'string' } },
      dataPoints: { type: 'number' },
      criticalEvents: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            timestamp: { type: 'string' },
            vital: { type: 'string' },
            value: { type: 'number' },
            threshold: { type: 'string' }
          }
        }
      },
      uiResourceUri: { type: 'string' },
      summary: { type: 'string' }
    },
    required: ['status', 'patientId', 'uiResourceUri', 'summary']
  },
  // MCP Apps UI Resource Metadata
  _meta: {
    ui: {
      resourceUri: 'ui://medbridge/vital-trends-chart',
      visibility: ['model', 'app']
    }
  }
};

export async function vitalTrendsDashboard(
  input: VitalTrendsDashboardInput,
  context?: SHARPContext | null,
  env?: { DEMO_MODE?: string }
): Promise<VitalTrendsDashboardOutput> {
  const validated = inputSchema.parse(input);
  
  // Fetch patient record
  const record = await fetchPatientRecord(validated.patientId, context, env);
  
  if (!record) {
    throw new Error(`Patient not found: ${validated.patientId}`);
  }
  
  // Filter vitals by time range
  const hoursMap: Record<string, number> = {
    '6h': 6,
    '12h': 12,
    '24h': 24,
    '48h': 48,
    '7d': 168
  };
  
  const cutoffHours = hoursMap[validated.timeRange];
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - cutoffHours);
  
  const filteredVitals = record.vitals.filter(v => {
    const vitalTime = new Date(v.timestamp);
    return vitalTime >= cutoffTime;
  });
  
  if (filteredVitals.length === 0) {
    return {
      status: 'NO_DATA',
      patientId: validated.patientId,
      patientName: `${record.patient.name.first} ${record.patient.name.last}`,
      timeRange: validated.timeRange,
      vitalTypes: validated.vitalTypes,
      dataPoints: 0,
      criticalEvents: [],
      uiResourceUri: 'ui://medbridge/vital-trends-chart',
      summary: `No vital sign data available for the past ${validated.timeRange}. Consider extending the time range or checking if vitals have been recorded.`
    };
  }
  
  // Detect critical events
  const criticalEvents: VitalTrendsDashboardOutput['criticalEvents'] = [];
  
  for (const vital of filteredVitals) {
    if (vital.heartRate !== undefined) {
      if (vital.heartRate > 120) {
        criticalEvents.push({
          timestamp: vital.timestamp,
          vital: 'Heart Rate',
          value: vital.heartRate,
          threshold: '> 120 bpm'
        });
      } else if (vital.heartRate < 50) {
        criticalEvents.push({
          timestamp: vital.timestamp,
          vital: 'Heart Rate',
          value: vital.heartRate,
          threshold: '< 50 bpm'
        });
      }
    }
    
    if (vital.systolicBP !== undefined) {
      if (vital.systolicBP > 180) {
        criticalEvents.push({
          timestamp: vital.timestamp,
          vital: 'Systolic BP',
          value: vital.systolicBP,
          threshold: '> 180 mmHg'
        });
      } else if (vital.systolicBP < 85) {
        criticalEvents.push({
          timestamp: vital.timestamp,
          vital: 'Systolic BP',
          value: vital.systolicBP,
          threshold: '< 85 mmHg'
        });
      }
    }
    
    if (vital.oxygenSaturation !== undefined && vital.oxygenSaturation < 90) {
      criticalEvents.push({
        timestamp: vital.timestamp,
        vital: 'O2 Saturation',
        value: vital.oxygenSaturation,
        threshold: '< 90%'
      });
    }
    
    if (vital.temperature !== undefined) {
      if (vital.temperature > 39.0) {
        criticalEvents.push({
          timestamp: vital.timestamp,
          vital: 'Temperature',
          value: vital.temperature,
          threshold: '> 39°C'
        });
      } else if (vital.temperature < 35.0) {
        criticalEvents.push({
          timestamp: vital.timestamp,
          vital: 'Temperature',
          value: vital.temperature,
          threshold: '< 35°C'
        });
      }
    }
    
    if (vital.painScore !== undefined && vital.painScore >= 8) {
      criticalEvents.push({
        timestamp: vital.timestamp,
        vital: 'Pain Score',
        value: vital.painScore,
        threshold: '≥ 8/10'
      });
    }
  }
  
  // Generate summary
  const trendSummary = generateTrendSummary(filteredVitals, validated.vitalTypes);
  const criticalSummary = criticalEvents.length > 0 
    ? `⚠️ ${criticalEvents.length} critical event(s) detected in this time window. `
    : '✓ No critical events detected. ';
  
  return {
    status: 'SUCCESS',
    patientId: validated.patientId,
    patientName: `${record.patient.name.first} ${record.patient.name.last}`,
    timeRange: validated.timeRange,
    vitalTypes: validated.vitalTypes,
    dataPoints: filteredVitals.length,
    criticalEvents: criticalEvents.slice(0, 10), // Limit to 10 events
    uiResourceUri: 'ui://medbridge/vital-trends-chart',
    summary: `${criticalSummary}${trendSummary} Interactive chart loaded with ${filteredVitals.length} data points. Click any data point to analyze trends or ask the AI about specific patterns.`
  };
}

function generateTrendSummary(vitals: Array<{
  timestamp: string;
  heartRate?: number;
  systolicBP?: number;
  oxygenSaturation?: number;
  temperature?: number;
}>, vitalTypes: string[]): string {
  if (vitals.length < 2) return 'Insufficient data for trend analysis.';
  
  const first = vitals[0];
  const last = vitals[vitals.length - 1];
  const summaries: string[] = [];
  
  if (vitalTypes.includes('heartRate') && last.heartRate && first.heartRate) {
    const change = last.heartRate - first.heartRate;
    if (Math.abs(change) > 10) {
      summaries.push(`Heart rate ${change > 0 ? 'increased' : 'decreased'} by ${Math.abs(change)} bpm`);
    }
  }
  
  if (vitalTypes.includes('bloodPressure') && last.systolicBP && first.systolicBP) {
    const change = last.systolicBP - first.systolicBP;
    if (Math.abs(change) > 15) {
      summaries.push(`Systolic BP ${change > 0 ? 'rose' : 'dropped'} by ${Math.abs(change)} mmHg`);
    }
  }
  
  if (vitalTypes.includes('oxygenSaturation') && last.oxygenSaturation && first.oxygenSaturation) {
    const change = last.oxygenSaturation - first.oxygenSaturation;
    if (Math.abs(change) > 3) {
      summaries.push(`O2 saturation ${change > 0 ? 'improved' : 'declined'} by ${Math.abs(change)}%`);
    }
  }
  
  if (summaries.length === 0) {
    return 'Vital signs remain relatively stable across the time period.';
  }
  
  return summaries.join('. ') + '.';
}
