#!/usr/bin/env node

/**
 * Test Harness for FAA Data Fetcher
 *
 * This harness allows manual testing and verification of the FAA data
 * fetching functionality. It can be used to:
 * - Test OpenSky API connectivity
 * - Verify data normalization
 * - Test mock data generation
 *
 * Usage:
 *   npm run fetch:test
 *   node tests/harness/faa-fetcher-harness.js [--mock] [--count N]
 */

import {
  fetchFlights,
  fetchFromOpenSky,
  createMockFetcher,
  normalizeFlightData
} from '../../src/server/faa-fetcher.js';

const args = process.argv.slice(2);
const useMock = args.includes('--mock');
const countIdx = args.indexOf('--count');
const count = countIdx >= 0 ? parseInt(args[countIdx + 1], 10) : 5;

async function runTests() {
  console.log('='.repeat(60));
  console.log('FAA Data Fetcher Test Harness');
  console.log('='.repeat(60));
  console.log();

  // Test 1: Data Normalization
  console.log('Test 1: OpenSky Data Normalization');
  console.log('-'.repeat(40));

  const sampleOpenSkyState = [
    'abc123', 'UAL123 ', 'United States',
    Date.now() / 1000, Date.now() / 1000,
    -122.5, 37.5, 10000, false, 250, 45, 5, null, 10050, '1200', false, 0
  ];

  const normalized = normalizeFlightData(sampleOpenSkyState, 'opensky');
  console.log('Input state vector:', JSON.stringify(sampleOpenSkyState.slice(0, 8), null, 2));
  console.log('Normalized output:', JSON.stringify(normalized, null, 2));
  console.log('✓ Normalization working');
  console.log();

  // Test 2: Mock Data Generation
  console.log('Test 2: Mock Data Generation');
  console.log('-'.repeat(40));

  const mockFetcher = createMockFetcher(count);
  const mockFlights = await mockFetcher();

  console.log(`Generated ${mockFlights.length} mock flights`);
  console.log('Sample flight:', JSON.stringify(mockFlights[0], null, 2));

  // Verify mock data updates
  const mockFlights2 = await mockFetcher();
  const positionChanged =
    mockFlights[0].latitude !== mockFlights2[0].latitude ||
    mockFlights[0].longitude !== mockFlights2[0].longitude;

  console.log(`Position updates: ${positionChanged ? '✓' : '✗'}`);
  console.log();

  // Test 3: Live API Fetch (unless --mock flag)
  if (!useMock) {
    console.log('Test 3: Live OpenSky API Fetch');
    console.log('-'.repeat(40));
    console.log('Fetching live data from OpenSky Network...');

    try {
      const startTime = Date.now();
      const flights = await fetchFromOpenSky();
      const elapsed = Date.now() - startTime;

      console.log(`✓ Fetched ${flights.length} flights in ${elapsed}ms`);

      if (flights.length > 0) {
        console.log('\nSample flights:');
        for (let i = 0; i < Math.min(3, flights.length); i++) {
          const f = flights[i];
          console.log(`  ${f.callsign.padEnd(8)} | ${f.altitude.toString().padStart(6)} ft | ` +
            `${f.speed.toString().padStart(4)} kts | ${f.latitude.toFixed(4)}, ${f.longitude.toFixed(4)}`);
        }

        console.log('\nFlight altitude distribution:');
        const altBuckets = {
          'Ground (on_ground=true)': 0,
          '0-10,000 ft': 0,
          '10,000-25,000 ft': 0,
          '25,000-35,000 ft': 0,
          'Above 35,000 ft': 0
        };

        for (const f of flights) {
          if (f.onGround) altBuckets['Ground (on_ground=true)']++;
          else if (f.altitude < 10000) altBuckets['0-10,000 ft']++;
          else if (f.altitude < 25000) altBuckets['10,000-25,000 ft']++;
          else if (f.altitude < 35000) altBuckets['25,000-35,000 ft']++;
          else altBuckets['Above 35,000 ft']++;
        }

        for (const [bucket, count] of Object.entries(altBuckets)) {
          console.log(`  ${bucket.padEnd(25)}: ${count}`);
        }
      } else {
        console.log('⚠ No flights returned (may be rate limited)');
      }
    } catch (error) {
      console.log('✗ API fetch failed:', error.message);
      if (error.message.includes('429')) {
        console.log('  → Rate limited. Wait a few seconds and try again.');
      }
    }
  } else {
    console.log('Test 3: Skipped (--mock flag set)');
  }

  console.log();
  console.log('='.repeat(60));
  console.log('Test harness complete');
  console.log('='.repeat(60));
}

runTests().catch(console.error);
