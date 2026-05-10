/**
 * MedBridge SHARP Context Handler
 * Manages FHIR context propagation and PHI-safe data access
 */

import type { SHARPContext, FHIRHeaders } from '../types/index.js';

/**
 * Extract SHARP context from incoming request headers
 * Ensures PHI never enters agent prompts - only session state
 */
export function extractSHARPContext(headers: Record<string, string>): SHARPContext | null {
  const fhirServerUrl = headers['x-fhir-server-url'] || headers['X-FHIR-Server-URL'];
  const fhirAccessToken = headers['x-fhir-access-token'] || headers['X-FHIR-Access-Token'];
  const patientId = headers['x-patient-id'] || headers['X-Patient-ID'];
  const apiKey = headers['x-api-key'] || headers['X-API-Key'];

  if (!fhirServerUrl || !fhirAccessToken || !patientId || !apiKey) {
    return null;
  }

  return {
    fhirServerUrl,
    fhirAccessToken,
    patientId,
    apiKey
  };
}

/**
 * Validate SHARP context for completeness
 */
export function validateSHARPContext(context: SHARPContext): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!context.fhirServerUrl || !isValidUrl(context.fhirServerUrl)) {
    errors.push('Invalid or missing FHIR server URL');
  }

  if (!context.fhirAccessToken || context.fhirAccessToken.length < 10) {
    errors.push('Invalid or missing FHIR access token');
  }

  if (!context.patientId || context.patientId.trim() === '') {
    errors.push('Missing patient ID');
  }

  if (!context.apiKey || context.apiKey.length < 8) {
    errors.push('Invalid or missing API key');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Convert SHARP context to FHIR request headers
 */
export function toFHIRHeaders(context: SHARPContext): FHIRHeaders {
  return {
    'X-FHIR-Server-URL': context.fhirServerUrl,
    'X-FHIR-Access-Token': context.fhirAccessToken,
    'X-Patient-ID': context.patientId,
    'X-API-Key': context.apiKey
  };
}

/**
 * Create headers for direct FHIR HTTP requests
 */
export function createFHIRRequestHeaders(context: SHARPContext): Record<string, string> {
  return {
    'Authorization': `Bearer ${context.fhirAccessToken}`,
    'Accept': 'application/fhir+json',
    'Content-Type': 'application/fhir+json',
    'X-API-Key': context.apiKey
  };
}

/**
 * Sanitize context for logging (removes sensitive tokens)
 */
export function sanitizeForLogging(context: SHARPContext): Record<string, string> {
  return {
    fhirServerUrl: context.fhirServerUrl,
    patientId: context.patientId,
    apiKeyPrefix: context.apiKey.substring(0, 4) + '...',
    tokenPrefix: context.fhirAccessToken.substring(0, 8) + '...'
  };
}

/**
 * Check if string is valid URL
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generic FHIR resource fetcher
 * Makes actual HTTP requests to FHIR server
 */
export async function fetchFHIRResource<T>(
  context: SHARPContext,
  resourceType: string,
  resourceId?: string,
  queryParams?: Record<string, string>
): Promise<T | null> {
  // Build FHIR URL
  const baseUrl = context.fhirServerUrl.replace(/\/$/, '');
  let url = `${baseUrl}/${resourceType}`;
  
  if (resourceId) {
    url += `/${resourceId}`;
  }
  
  if (queryParams && Object.keys(queryParams).length > 0) {
    const params = new URLSearchParams(queryParams);
    url += `?${params.toString()}`;
  }

  // Make actual HTTP request to FHIR server
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${context.fhirAccessToken}`,
      'Accept': 'application/fhir+json',
      'Content-Type': 'application/fhir+json'
    }
  });
  
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`FHIR error ${response.status}: ${response.statusText}`);
  }
  
  return await response.json() as T;
}

/**
 * Context middleware for Express routes
 * Attaches SHARP context to request object
 */
export function sharpContextMiddleware(
  req: { headers: Record<string, string>; sharpContext?: SHARPContext },
  res: { status: (code: number) => { json: (data: unknown) => void } },
  next: () => void
): void {
  const context = extractSHARPContext(req.headers);
  
  if (!context) {
    res.status(401).json({
      error: 'Missing SHARP context headers',
      required: ['X-FHIR-Server-URL', 'X-FHIR-Access-Token', 'X-Patient-ID', 'X-API-Key']
    });
    return;
  }

  const validation = validateSHARPContext(context);
  if (!validation.valid) {
    res.status(400).json({
      error: 'Invalid SHARP context',
      details: validation.errors
    });
    return;
  }

  req.sharpContext = context;
  next();
}
