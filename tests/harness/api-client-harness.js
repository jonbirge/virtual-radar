#!/usr/bin/env node

/**
 * Test Harness for REST API Client
 *
 * This harness tests the REST API endpoints to verify proper operation
 * of the flight data API. It requires the server to be running.
 *
 * Usage:
 *   npm run api:test
 *   node tests/harness/api-client-harness.js [--url http://localhost:3000]
 */

const args = process.argv.slice(2);
const urlIdx = args.indexOf('--url');
const baseUrl = urlIdx >= 0 ? args[urlIdx + 1] : 'http://localhost:3000';

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.lastTimestamp = 0;
  }

  async request(endpoint) {
    const response = await fetch(`${this.baseUrl}${endpoint}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  async getConfig() {
    return this.request('/api/config');
  }

  async getStats() {
    return this.request('/api/stats');
  }

  async getFlights(since = null) {
    const url = since ? `/api/flights?since=${since}` : '/api/flights';
    return this.request(url);
  }

  async getFlight(id) {
    return this.request(`/api/flights/${id}`);
  }

  async getFlightTrail(id, limit = null) {
    const url = limit
      ? `/api/flights/${id}/trail?limit=${limit}`
      : `/api/flights/${id}/trail`;
    return this.request(url);
  }

  async getAllTrails() {
    return this.request('/api/trails');
  }

  async healthCheck() {
    return this.request('/health');
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('REST API Client Test Harness');
  console.log('='.repeat(60));
  console.log(`Server URL: ${baseUrl}`);
  console.log();

  const client = new ApiClient(baseUrl);
  const results = { passed: 0, failed: 0, skipped: 0 };

  async function test(name, fn) {
    process.stdout.write(`Testing: ${name}... `);
    try {
      await fn();
      console.log('✓ PASS');
      results.passed++;
    } catch (error) {
      console.log(`✗ FAIL: ${error.message}`);
      results.failed++;
    }
  }

  // Test 1: Health Check
  await test('Health check endpoint', async () => {
    const data = await client.healthCheck();
    if (data.status !== 'ok') throw new Error('Unexpected health status');
    if (!data.timestamp) throw new Error('Missing timestamp');
  });

  // Test 2: Get Configuration
  await test('Get client configuration', async () => {
    const data = await client.getConfig();
    if (!data.success) throw new Error('API returned failure');
    if (!data.config.recommendedPollInterval) throw new Error('Missing poll interval');
    if (!data.config.maxTrailPoints) throw new Error('Missing max trail points');
    console.log(`    Poll interval: ${data.config.recommendedPollInterval}ms`);
  });

  // Test 3: Get Statistics
  await test('Get database statistics', async () => {
    const data = await client.getStats();
    if (!data.success) throw new Error('API returned failure');
    if (typeof data.stats.flightCount !== 'number') throw new Error('Missing flight count');
    console.log(`    Flights: ${data.stats.flightCount}, Trail points: ${data.stats.trailPointCount}`);
  });

  // Test 4: Get All Flights
  let sampleFlightId = null;
  await test('Get all flights', async () => {
    const data = await client.getFlights();
    if (!data.success) throw new Error('API returned failure');
    if (!Array.isArray(data.flights)) throw new Error('Flights is not an array');
    console.log(`    Found ${data.count} flights`);

    if (data.flights.length > 0) {
      sampleFlightId = data.flights[0].id;

      // Validate flight structure
      const f = data.flights[0];
      const required = ['id', 'callsign', 'latitude', 'longitude', 'altitude', 'heading', 'speed'];
      for (const field of required) {
        if (f[field] === undefined) throw new Error(`Missing field: ${field}`);
      }
    }
  });

  // Test 5: Get Flights Since Timestamp
  await test('Get flights since timestamp', async () => {
    // Get flights from 1 second ago
    const since = Date.now() - 1000;
    const data = await client.getFlights(since);
    if (!data.success) throw new Error('API returned failure');
    console.log(`    Updated flights: ${data.count}`);
  });

  // Test 6: Get Specific Flight (if available)
  if (sampleFlightId) {
    await test(`Get specific flight (${sampleFlightId})`, async () => {
      const data = await client.getFlight(sampleFlightId);
      if (!data.success) throw new Error('API returned failure');
      if (!data.flight) throw new Error('Missing flight data');
      if (data.flight.id !== sampleFlightId) throw new Error('Wrong flight returned');
    });
  } else {
    console.log('Testing: Get specific flight... ⊘ SKIP (no flights available)');
    results.skipped++;
  }

  // Test 7: Get Non-existent Flight
  await test('Get non-existent flight (should 404)', async () => {
    try {
      await client.getFlight('NONEXISTENT_FLIGHT_ID_12345');
      throw new Error('Expected 404 error');
    } catch (error) {
      if (!error.message.includes('404')) throw error;
    }
  });

  // Test 8: Get Flight Trail (if available)
  if (sampleFlightId) {
    await test(`Get flight trail (${sampleFlightId})`, async () => {
      const data = await client.getFlightTrail(sampleFlightId);
      if (!data.success) throw new Error('API returned failure');
      if (!Array.isArray(data.trail)) throw new Error('Trail is not an array');
      console.log(`    Trail points: ${data.count}`);

      if (data.trail.length > 0) {
        const point = data.trail[0];
        if (point.latitude === undefined) throw new Error('Missing latitude');
        if (point.longitude === undefined) throw new Error('Missing longitude');
        if (point.altitude === undefined) throw new Error('Missing altitude');
      }
    });

    await test('Get flight trail with limit', async () => {
      const data = await client.getFlightTrail(sampleFlightId, 5);
      if (!data.success) throw new Error('API returned failure');
      if (data.trail.length > 5) throw new Error('Limit not respected');
    });
  } else {
    console.log('Testing: Get flight trail... ⊘ SKIP (no flights available)');
    console.log('Testing: Get flight trail with limit... ⊘ SKIP (no flights available)');
    results.skipped += 2;
  }

  // Test 9: Get All Trails
  await test('Get all trails', async () => {
    const data = await client.getAllTrails();
    if (!data.success) throw new Error('API returned failure');
    if (typeof data.trails !== 'object') throw new Error('Trails is not an object');
    console.log(`    Flights with trails: ${data.count}`);
  });

  // Test 10: Polling Simulation
  await test('Polling simulation (3 iterations)', async () => {
    let lastTimestamp = 0;

    for (let i = 0; i < 3; i++) {
      const data = lastTimestamp
        ? await client.getFlights(lastTimestamp)
        : await client.getFlights();

      lastTimestamp = data.timestamp;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });

  // Summary
  console.log();
  console.log('='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  console.log(`  Passed:  ${results.passed}`);
  console.log(`  Failed:  ${results.failed}`);
  console.log(`  Skipped: ${results.skipped}`);
  console.log('='.repeat(60));

  if (results.failed > 0) {
    process.exit(1);
  }
}

// Check if server is available before running tests
async function main() {
  console.log(`Checking server availability at ${baseUrl}...`);

  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
    console.log('Server is running!\n');
    await runTests();
  } catch (error) {
    console.error(`\n✗ Cannot connect to server at ${baseUrl}`);
    console.error(`  Error: ${error.message}`);
    console.error('\nMake sure the server is running:');
    console.error('  npm start');
    console.error('  # or');
    console.error('  docker-compose up');
    process.exit(1);
  }
}

main();
