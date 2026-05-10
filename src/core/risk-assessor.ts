/**
 * MedBridge Clinical Risk Assessment Engine
 * Analyzes patient data for critical trends and escalation triggers
 */

import type { 
  PatientRecord, 
  VitalSign, 
  NurseNote, 
  LabResult,
  RiskAssessment, 
  RiskTrigger 
} from '../types/index.js';

// ============================================================================
// Risk Thresholds
// ============================================================================

const VITAL_THRESHOLDS = {
  heartRate: { min: 60, max: 100, criticalMin: 50, criticalMax: 120 },
  systolicBP: { min: 90, max: 140, criticalMin: 85, criticalMax: 180 },
  diastolicBP: { min: 60, max: 90, criticalMin: 50, criticalMax: 110 },
  temperature: { min: 36.0, max: 37.5, criticalMin: 35.0, criticalMax: 39.0 },
  oxygenSaturation: { min: 95, criticalMin: 90 },
  respiratoryRate: { min: 12, max: 20, criticalMin: 8, criticalMax: 30 }
};

const LAB_THRESHOLDS: Record<string, { high?: number; criticalHigh?: number; low?: number; criticalLow?: number }> = {
  'WBC': { high: 11.0, criticalHigh: 15.0, low: 4.0, criticalLow: 3.0 },
  'Lactate': { high: 2.2, criticalHigh: 4.0 },
  'Creatinine': { high: 1.3, criticalHigh: 2.0 },
  'Hemoglobin': { low: 12.0, criticalLow: 8.0, high: 16.0 },
  'eGFR': { low: 60, criticalLow: 30 },
  'CRP': { high: 10, criticalHigh: 100 }
};

// ============================================================================
// Risk Assessment Functions
// ============================================================================

export function assessPatientRisk(record: PatientRecord): RiskAssessment {
  const now = new Date().toISOString();
  
  const vitalsTriggers = assessVitals(record.vitals);
  const notesTriggers = assessNotes(record.notes);
  const labsTriggers = assessLabs(record.labResults || []);
  
  const allTriggers = [...vitalsTriggers, ...notesTriggers, ...labsTriggers];
  
  const vitalsRisk = calculateRiskLevel(vitalsTriggers);
  const notesRisk = calculateRiskLevel(notesTriggers);
  const overallRisk = determineOverallRisk(vitalsRisk, notesRisk, allTriggers);
  
  const recommendations = generateRecommendations(allTriggers, overallRisk, record);
  
  return {
    patientId: record.patient.id,
    timestamp: now,
    overallRisk,
    vitalsRisk,
    notesRisk,
    triggers: allTriggers,
    recommendations
  };
}

function assessVitals(vitals: VitalSign[]): RiskTrigger[] {
  const triggers: RiskTrigger[] = [];
  
  if (vitals.length === 0) return triggers;
  
  // Check latest vitals
  const latest = vitals[vitals.length - 1];
  
  // Heart rate
  if (latest.heartRate !== undefined) {
    if (latest.heartRate > VITAL_THRESHOLDS.heartRate.criticalMax) {
      triggers.push(createTrigger('VITALS', 'CRITICAL', `Severe tachycardia: ${latest.heartRate} bpm`, latest.heartRate, VITAL_THRESHOLDS.heartRate.criticalMax, latest.timestamp));
    } else if (latest.heartRate > VITAL_THRESHOLDS.heartRate.max) {
      triggers.push(createTrigger('VITALS', 'HIGH', `Tachycardia: ${latest.heartRate} bpm`, latest.heartRate, VITAL_THRESHOLDS.heartRate.max, latest.timestamp));
    } else if (latest.heartRate < VITAL_THRESHOLDS.heartRate.criticalMin) {
      triggers.push(createTrigger('VITALS', 'CRITICAL', `Severe bradycardia: ${latest.heartRate} bpm`, latest.heartRate, VITAL_THRESHOLDS.heartRate.criticalMin, latest.timestamp));
    } else if (latest.heartRate < VITAL_THRESHOLDS.heartRate.min) {
      triggers.push(createTrigger('VITALS', 'MODERATE', `Bradycardia: ${latest.heartRate} bpm`, latest.heartRate, VITAL_THRESHOLDS.heartRate.min, latest.timestamp));
    }
  }
  
  // Blood pressure
  if (latest.systolicBP !== undefined) {
    if (latest.systolicBP > VITAL_THRESHOLDS.systolicBP.criticalMax) {
      triggers.push(createTrigger('VITALS', 'CRITICAL', `Severe hypertension: ${latest.systolicBP}/${latest.diastolicBP} mmHg`, latest.systolicBP, VITAL_THRESHOLDS.systolicBP.criticalMax, latest.timestamp));
    } else if (latest.systolicBP > VITAL_THRESHOLDS.systolicBP.max) {
      triggers.push(createTrigger('VITALS', 'HIGH', `Hypertension: ${latest.systolicBP} mmHg systolic`, latest.systolicBP, VITAL_THRESHOLDS.systolicBP.max, latest.timestamp));
    } else if (latest.systolicBP < VITAL_THRESHOLDS.systolicBP.criticalMin) {
      triggers.push(createTrigger('VITALS', 'CRITICAL', `Severe hypotension: ${latest.systolicBP} mmHg systolic`, latest.systolicBP, VITAL_THRESHOLDS.systolicBP.criticalMin, latest.timestamp));
    }
  }
  
  // Temperature
  if (latest.temperature !== undefined) {
    if (latest.temperature > VITAL_THRESHOLDS.temperature.criticalMax) {
      triggers.push(createTrigger('VITALS', 'CRITICAL', `High fever: ${latest.temperature}°C`, latest.temperature, VITAL_THRESHOLDS.temperature.criticalMax, latest.timestamp));
    } else if (latest.temperature > VITAL_THRESHOLDS.temperature.max) {
      triggers.push(createTrigger('VITALS', 'HIGH', `Fever: ${latest.temperature}°C`, latest.temperature, VITAL_THRESHOLDS.temperature.max, latest.timestamp));
    } else if (latest.temperature < VITAL_THRESHOLDS.temperature.criticalMin) {
      triggers.push(createTrigger('VITALS', 'CRITICAL', `Hypothermia: ${latest.temperature}°C`, latest.temperature, VITAL_THRESHOLDS.temperature.criticalMin, latest.timestamp));
    }
  }
  
  // Oxygen saturation
  if (latest.oxygenSaturation !== undefined) {
    if (latest.oxygenSaturation < VITAL_THRESHOLDS.oxygenSaturation.criticalMin) {
      triggers.push(createTrigger('VITALS', 'CRITICAL', `Severe hypoxia: ${latest.oxygenSaturation}%`, latest.oxygenSaturation, VITAL_THRESHOLDS.oxygenSaturation.criticalMin, latest.timestamp));
    } else if (latest.oxygenSaturation < VITAL_THRESHOLDS.oxygenSaturation.min) {
      triggers.push(createTrigger('VITALS', 'HIGH', `Hypoxia: ${latest.oxygenSaturation}%`, latest.oxygenSaturation, VITAL_THRESHOLDS.oxygenSaturation.min, latest.timestamp));
    }
  }
  
  // Check for trends (if multiple readings)
  if (vitals.length >= 2) {
    const trend = analyzeVitalTrends(vitals);
    if (trend.worsening) {
      triggers.push(createTrigger('VITALS', 'MODERATE', `Deteriorating vital signs trend: ${trend.description}`, undefined, undefined, latest.timestamp));
    }
  }
  
  return triggers;
}

function assessNotes(notes: NurseNote[]): RiskTrigger[] {
  const triggers: RiskTrigger[] = [];
  
  const criticalKeywords = [
    'confused', 'confusion', 'altered mental status', 'unresponsive',
    'chest pain', 'severe pain', 'fall', 'fell', 'near fall',
    'code', 'emergency', 'rapid response', 'critical'
  ];
  
  const concernKeywords = [
    'anxious', 'worried', 'concerning', 'declined', 'worse',
    'increased pain', 'nausea', 'vomiting', 'shortness of breath'
  ];
  
  notes.forEach(note => {
    const text = note.text.toLowerCase();
    
    criticalKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        triggers.push(createTrigger('NOTES', 'CRITICAL', `Critical finding in note: "${keyword}" - ${note.author}`, undefined, undefined, note.timestamp));
      }
    });
    
    concernKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        triggers.push(createTrigger('NOTES', 'MODERATE', `Concern in note: "${keyword}" - ${note.author}`, undefined, undefined, note.timestamp));
      }
    });
  });
  
  return triggers;
}

function assessLabs(labs: LabResult[]): RiskTrigger[] {
  const triggers: RiskTrigger[] = [];
  
  labs.forEach(lab => {
    const thresholds = LAB_THRESHOLDS[lab.testName];
    if (!thresholds) return;
    
    // Check critical values first
    if (thresholds.criticalHigh !== undefined && lab.value > thresholds.criticalHigh) {
      triggers.push(createTrigger('LABS', 'CRITICAL', `Critical ${lab.testName}: ${lab.value} ${lab.unit}`, lab.value, thresholds.criticalHigh, lab.timestamp));
    } else if (thresholds.criticalLow !== undefined && lab.value < thresholds.criticalLow) {
      triggers.push(createTrigger('LABS', 'CRITICAL', `Critical low ${lab.testName}: ${lab.value} ${lab.unit}`, lab.value, thresholds.criticalLow, lab.timestamp));
    } else if (thresholds.high !== undefined && lab.value > thresholds.high) {
      triggers.push(createTrigger('LABS', 'HIGH', `Elevated ${lab.testName}: ${lab.value} ${lab.unit}`, lab.value, thresholds.high, lab.timestamp));
    } else if (thresholds.low !== undefined && lab.value < thresholds.low) {
      triggers.push(createTrigger('LABS', 'MODERATE', `Low ${lab.testName}: ${lab.value} ${lab.unit}`, lab.value, thresholds.low, lab.timestamp));
    }
  });
  
  return triggers;
}

function analyzeVitalTrends(vitals: VitalSign[]): { worsening: boolean; description: string } {
  if (vitals.length < 2) return { worsening: false, description: '' };
  
  const first = vitals[0];
  const last = vitals[vitals.length - 1];
  
  const concerns: string[] = [];
  
  if (last.heartRate && first.heartRate && last.heartRate > first.heartRate * 1.2) {
    concerns.push('heart rate increased >20%');
  }
  
  if (last.systolicBP && first.systolicBP && last.systolicBP > first.systolicBP * 1.1) {
    concerns.push('BP rising');
  }
  
  if (last.oxygenSaturation && first.oxygenSaturation && last.oxygenSaturation < first.oxygenSaturation - 3) {
    concerns.push('O2 sat declining');
  }
  
  if (last.temperature && first.temperature && last.temperature > first.temperature + 1.0) {
    concerns.push('temperature rising');
  }
  
  return {
    worsening: concerns.length > 0,
    description: concerns.join(', ')
  };
}

function createTrigger(
  category: RiskTrigger['category'],
  severity: RiskTrigger['severity'],
  description: string,
  value?: number,
  threshold?: number,
  timestamp?: string
): RiskTrigger {
  return {
    category,
    severity,
    description,
    value,
    threshold,
    timestamp: timestamp || new Date().toISOString()
  };
}

function calculateRiskLevel(triggers: RiskTrigger[]): 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' {
  if (triggers.some(t => t.severity === 'CRITICAL')) return 'CRITICAL';
  if (triggers.some(t => t.severity === 'HIGH')) return 'HIGH';
  if (triggers.some(t => t.severity === 'MODERATE')) return 'MODERATE';
  return 'LOW';
}

function determineOverallRisk(
  vitalsRisk: RiskAssessment['overallRisk'],
  notesRisk: RiskAssessment['overallRisk'],
  allTriggers: RiskTrigger[]
): RiskAssessment['overallRisk'] {
  const risks = [vitalsRisk, notesRisk];
  
  if (risks.includes('CRITICAL')) return 'CRITICAL';
  if (risks.includes('HIGH')) return 'HIGH';
  if (allTriggers.length >= 3) return 'HIGH';
  if (risks.includes('MODERATE')) return 'MODERATE';
  return 'LOW';
}

function generateRecommendations(triggers: RiskTrigger[], overallRisk: RiskAssessment['overallRisk'], record: PatientRecord): string[] {
  const recommendations: string[] = [];
  
  if (overallRisk === 'CRITICAL') {
    recommendations.push('Immediate physician evaluation required');
    recommendations.push('Consider rapid response activation');
    recommendations.push('Continuous monitoring essential');
  } else if (overallRisk === 'HIGH') {
    recommendations.push('Notify attending physician within 1 hour');
    recommendations.push('Increase monitoring frequency to q2h');
    recommendations.push('Prepare for possible escalation');
  } else if (overallRisk === 'MODERATE') {
    recommendations.push('Continue current monitoring');
    recommendations.push('Reassess in 4 hours');
  } else {
    recommendations.push('Continue routine monitoring');
    recommendations.push('Standard handover protocol');
  }
  
  // Specific recommendations based on triggers
  if (triggers.some(t => t.category === 'VITALS' && t.description.includes('fever'))) {
    recommendations.push('Consider blood cultures if fever persists');
  }
  
  if (triggers.some(t => t.category === 'NOTES' && t.description.includes('fall'))) {
    recommendations.push('Implement fall precautions protocol');
    recommendations.push('Physical therapy consultation recommended');
  }
  
  if (triggers.some(t => t.category === 'LABS' && t.description.includes('Lactate'))) {
    recommendations.push('Sepsis workup recommended');
    recommendations.push('Repeat lactate in 4 hours');
  }
  
  // Check for documentation gaps
  const hasFallsRisk = triggers.some(t => t.category === 'NOTES' && t.description.toLowerCase().includes('fall'));
  const planMentionsFalls = record.patient.plan.toLowerCase().includes('fall');
  if (hasFallsRisk && !planMentionsFalls) {
    recommendations.push('CRITICAL: Falls risk identified but not in care plan - update immediately');
  }
  
  return recommendations;
}
