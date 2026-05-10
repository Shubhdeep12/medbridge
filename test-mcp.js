/**
 * MedBridge MCP Server Test Script
 * Demonstrates all 4 tools with synthetic patient data
 */

const BASE_URL = 'http://localhost:3000';

async function testEndpoint(endpoint, method, body = null, headers = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(url, options);
    return await response.json();
  } catch (error) {
    return { error: error.message };
  }
}

async function runTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                 MedBridge MCP Test Suite                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Test 1: Health Check
  console.log('1. Health Check');
  console.log('─'.repeat(60));
  const health = await testEndpoint('/health', 'GET');
  console.log(JSON.stringify(health, null, 2));
  console.log();

  // Test 2: Server Info
  console.log('2. Server Information');
  console.log('─'.repeat(60));
  const info = await testEndpoint('/', 'GET');
  console.log(JSON.stringify(info, null, 2));
  console.log();

  // Test 3: Tools List
  console.log('3. MCP Tools List');
  console.log('─'.repeat(60));
  const toolsList = await testEndpoint('/mcp', 'POST', {
    jsonrpc: '2.0',
    id: '1',
    method: 'tools/list'
  });
  console.log(JSON.stringify(toolsList, null, 2));
  console.log();

  // Test 4: Get Patient Vitals (P1001 - John Doe with deteriorating condition)
  console.log('4. Get Patient Vitals (P1001 - John Doe)');
  console.log('─'.repeat(60));
  const vitals = await testEndpoint('/mcp', 'POST', {
    jsonrpc: '2.0',
    id: '2',
    method: 'tools/call',
    params: {
      name: 'get_patient_vitals',
      arguments: {
        patientId: 'P1001',
        sinceHours: 24
      }
    }
  });
  console.log(JSON.stringify(vitals, null, 2));
  console.log();

  // Test 5: Get Nurse Notes (P1001)
  console.log('5. Get Recent Nurse Notes (P1001 - John Doe)');
  console.log('─'.repeat(60));
  const notes = await testEndpoint('/mcp', 'POST', {
    jsonrpc: '2.0',
    id: '3',
    method: 'tools/call',
    params: {
      name: 'get_recent_nurse_notes',
      arguments: {
        patientId: 'P1001',
        limit: 5
      }
    }
  });
  console.log(JSON.stringify(notes, null, 2));
  console.log();

  // Test 6: Handover Summary (P1001 - CRITICAL case)
  console.log('6. Handover Summary (P1001 - CRITICAL Risk)');
  console.log('─'.repeat(60));
  const summary1 = await testEndpoint('/mcp', 'POST', {
    jsonrpc: '2.0',
    id: '4',
    method: 'tools/call',
    params: {
      name: 'handover_summary',
      arguments: {
        patientId: 'P1001',
        includeRecommendations: true
      }
    }
  });
  console.log(JSON.stringify(summary1, null, 2));
  console.log();

  // Test 7: Handover Summary (P1002 - MODERATE case)
  console.log('7. Handover Summary (P1002 - Jane Smith, MODERATE Risk)');
  console.log('─'.repeat(60));
  const summary2 = await testEndpoint('/mcp', 'POST', {
    jsonrpc: '2.0',
    id: '5',
    method: 'tools/call',
    params: {
      name: 'handover_summary',
      arguments: {
        patientId: 'P1002',
        includeRecommendations: true
      }
    }
  });
  console.log(JSON.stringify(summary2, null, 2));
  console.log();

  // Test 8: Handover Summary (P1003 - documentation gap detection)
  console.log('8. Handover Summary (P1003 - Carlos Ruiz, Documentation Gap Detection)');
  console.log('─'.repeat(60));
  const summary3 = await testEndpoint('/mcp', 'POST', {
    jsonrpc: '2.0',
    id: '6',
    method: 'tools/call',
    params: {
      name: 'handover_summary',
      arguments: {
        patientId: 'P1003',
        includeRecommendations: true
      }
    }
  });
  console.log(JSON.stringify(summary3, null, 2));
  console.log();

  // Test 9: Escalate Critical Case
  console.log('9. Escalate to Attending (P1001 - CRITICAL)');
  console.log('─'.repeat(60));
  const escalation = await testEndpoint('/mcp', 'POST', {
    jsonrpc: '2.0',
    id: '7',
    method: 'tools/call',
    params: {
      name: 'escalate_to_attending',
      arguments: {
        patientId: 'P1001',
        level: 'CRITICAL',
        message: 'Patient showing deteriorating mental status, rising BP (155/95), fever 38.9°C, and hypoxia. Confusion noted in nursing documentation. Immediate physician evaluation required.',
        reasonCode: '386372009'
      }
    }
  });
  console.log(JSON.stringify(escalation, null, 2));
  console.log();

  // Test 10: Invalid Patient
  console.log('10. Error Handling - Invalid Patient ID');
  console.log('─'.repeat(60));
  const error = await testEndpoint('/mcp', 'POST', {
    jsonrpc: '2.0',
    id: '8',
    method: 'tools/call',
    params: {
      name: 'get_patient_vitals',
      arguments: {
        patientId: 'INVALID_ID'
      }
    }
  });
  console.log(JSON.stringify(error, null, 2));
  console.log();

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                      Tests Complete                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { runTests, testEndpoint };
