/**
 * MedBridge MCP Tool: get_recent_nurse_notes
 * Retrieves and summarizes nursing documentation
 */

import { z } from 'zod';
import type { 
  MCPTool, 
  GetRecentNurseNotesInput, 
  GetRecentNurseNotesOutput,
  NurseNote,
  SHARPContext
} from '../types/index.js';
import { fetchPatientRecord } from '../core/fhir-client.js';

// ============================================================================
// Tool Definition
// ============================================================================

export const getRecentNurseNotesTool: MCPTool = {
  name: 'get_recent_nurse_notes',
  description: 'Retrieves recent nursing documentation with AI-powered summary and concern detection',
  inputSchema: {
    type: 'object',
    properties: {
      patientId: {
        type: 'string',
        description: 'Unique patient identifier'
      },
      since: {
        type: 'string',
        format: 'date-time',
        description: 'ISO timestamp for lookback (default: 24 hours ago)'
      },
      limit: {
        type: 'integer',
        description: 'Maximum number of notes to return (default: 10)',
        minimum: 1,
        maximum: 50
      }
    },
    required: ['patientId']
  },
  outputSchema: {
    type: 'object',
    properties: {
      notes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            timestamp: { type: 'string', format: 'date-time' },
            author: { type: 'string' },
            text: { type: 'string' },
            category: { type: 'string' }
          },
          required: ['timestamp', 'author', 'text']
        }
      },
      summary: { type: 'string' },
      concerns: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    required: ['notes', 'summary', 'concerns']
  }
};

// ============================================================================
// Input Validation
// ============================================================================

const inputSchema = z.object({
  patientId: z.string().min(1),
  since: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(50).optional().default(10)
});

// ============================================================================
// Tool Implementation
// ============================================================================

export async function getRecentNurseNotes(
  input: GetRecentNurseNotesInput,
  context?: SHARPContext | null,
  env?: { DEMO_MODE?: string }
): Promise<GetRecentNurseNotesOutput> {
  // Validate input
  const validated = inputSchema.parse(input);
  
  // Retrieve patient record from FHIR server
  const record = await fetchPatientRecord(validated.patientId, context, env);
  
  if (!record) {
    throw new Error(`Patient not found: ${validated.patientId}`);
  }
  
  // Determine time window
  const sinceTime = validated.since 
    ? new Date(validated.since)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  // Filter notes by time
  let filteredNotes = record.notes.filter(note => {
    const noteTime = new Date(note.timestamp);
    return noteTime >= sinceTime;
  });
  
  // If no notes in window, return recent ones
  if (filteredNotes.length === 0) {
    filteredNotes = record.notes.slice(-validated.limit);
  }
  
  // Apply limit
  const limitedNotes = filteredNotes.slice(0, validated.limit);
  
  // Generate summary
  const summary = generateNotesSummary(limitedNotes, record.patient.name);
  
  // Detect concerns
  const concerns = detectConcerns(limitedNotes);
  
  return {
    notes: limitedNotes,
    summary,
    concerns
  };
}

// ============================================================================
// Analysis Functions
// ============================================================================

function generateNotesSummary(notes: NurseNote[], patientName: { first: string; last: string }): string {
  if (notes.length === 0) {
    return `No nursing documentation available for ${patientName.last}, ${patientName.first}.`;
  }
  
  const chronologicalNotes = [...notes].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  const firstNote = chronologicalNotes[0];
  const lastNote = chronologicalNotes[chronologicalNotes.length - 1];
  const firstTime = new Date(firstNote.timestamp).toLocaleString();
  const lastTime = new Date(lastNote.timestamp).toLocaleString();
  
  // Extract key events
  const events: string[] = [];
  
  chronologicalNotes.forEach(note => {
    const text = note.text.toLowerCase();
    
    if (text.includes('pain') && (text.includes('increased') || text.includes('worse'))) {
      events.push('pain escalation reported');
    }
    if (text.includes('confus') || text.includes('altered') || text.includes('not oriented')) {
      events.push('mental status changes noted');
    }
    if (text.includes('fall') || text.includes('fell') || text.includes('near fall')) {
      events.push('fall or near-fall event');
    }
    if (text.includes('o2') || text.includes('oxygen') || text.includes('saturation')) {
      if (text.includes('drop') || text.includes('decrease') || text.includes('low')) {
        events.push('oxygen requirements changed');
      }
    }
    if (text.includes('notified') || text.includes('called') || text.includes('page')) {
      events.push('provider notification made');
    }
    if (text.includes('discharge')) {
      events.push('discharge planning mentioned');
    }
  });
  
  // Generate summary text
  let summary = `Nursing documentation for ${patientName.last}, ${patientName.first} from ${firstTime} to ${lastTime}. `;
  summary += `${notes.length} note(s) recorded by ${getUniqueAuthors(notes).join(', ')}. `;
  
  if (events.length > 0) {
    const uniqueEvents = [...new Set(events)];
    summary += `Key events: ${uniqueEvents.join(', ')}. `;
  }
  
  // Overall trend
  const categories = notes.map(n => n.category);
  const criticalCount = categories.filter(c => c === 'Critical').length;
  
  if (criticalCount > 0) {
    summary += `Contains ${criticalCount} critical documentation entries requiring immediate attention.`;
  } else if (events.length === 0) {
    summary += 'Overall stable course during this period.';
  } else {
    summary += 'Monitor for ongoing changes.';
  }
  
  return summary;
}

function detectConcerns(notes: NurseNote[]): string[] {
  const concerns: string[] = [];
  
  const criticalPatterns = [
    { pattern: /\b(confused|confusion|altered mental status|unresponsive|lethargic|not oriented)\b/i, concern: 'Altered mental status' },
    { pattern: /\b(chest pain|severe pain|pain.*10\/10|uncontrolled pain)\b/i, concern: 'Significant pain' },
    { pattern: /\b(fall|fell|near fall|on the floor)\b/i, concern: 'Fall risk/event' },
    { pattern: /\b(code|emergency|rapid response|crash cart)\b/i, concern: 'Emergency event' },
    { pattern: /\b(o2 sat.*\d+%|oxygen.*drop|hypoxia)\b/i, concern: 'Respiratory compromise' },
    { pattern: /\b(notified.*physician|called.*doctor|page.*attending)\b/i, concern: 'Provider notification required' }
  ];
  
  const warningPatterns = [
    { pattern: /\b(anxious|worried|nervous|agitated)\b/i, concern: 'Patient anxiety/distress' },
    { pattern: /\b(nausea|vomiting|unable to tolerate)\b/i, concern: 'GI intolerance' },
    { pattern: /\b(worse|declined|not improving)\b/i, concern: 'Clinical decline' },
    { pattern: /\b(weakness|fatigue|tired|exhausted)\b/i, concern: 'Functional decline' },
    { pattern: /\b(infection|rash|redness|swelling)\b/i, concern: 'Possible infection/inflammation' }
  ];
  
  notes.forEach(note => {
    const text = note.text;
    
    criticalPatterns.forEach(({ pattern, concern }) => {
      if (pattern.test(text) && !concerns.includes(concern)) {
        concerns.push(`CRITICAL: ${concern} (${new Date(note.timestamp).toLocaleTimeString()})`);
      }
    });
    
    warningPatterns.forEach(({ pattern, concern }) => {
      if (pattern.test(text) && !concerns.some(c => c.includes(concern))) {
        concerns.push(`WARNING: ${concern} (${new Date(note.timestamp).toLocaleTimeString()})`);
      }
    });
  });
  
  // Check for documentation gaps
  if (notes.length === 0) {
    concerns.push('WARNING: No nursing documentation available');
  }
  
  return concerns;
}

function getUniqueAuthors(notes: NurseNote[]): string[] {
  return [...new Set(notes.map(n => n.author))];
}
