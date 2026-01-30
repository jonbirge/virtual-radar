/**
 * Flight Tracker Server
 * Main entry point
 */

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { config } from './config.js';
import { createApiRouter } from './api.js';
import { initDatabase, upsertFlights, pruneOldData, getStats, closeDatabase } from './database.js';
import { fetchFlights, createMockFetcher } from './faa-fetcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json());

// Serve static files from client directory
app.use(express.static(join(__dirname, '../client')));

// Mount API router
app.use('/api', createApiRouter());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Initialize database
console.log('Initializing database...');
initDatabase();

// Server-side fetching is disabled by default (client fetches directly from OpenSky)
// Enable with ENABLE_SERVER_FETCH=true for caching/proxy scenarios
const enableServerFetch = process.env.ENABLE_SERVER_FETCH === 'true';

if (enableServerFetch) {
  // Determine fetch function based on config
  let fetchFunc = fetchFlights;

  // Use mock data if configured or if we want to test without external API
  if (process.env.USE_MOCK_DATA === 'true') {
    console.log('Using mock flight data');
    fetchFunc = createMockFetcher(150);
  }

  // Fetch and store flight data
  async function updateFlightData() {
    try {
      console.log(`[${new Date().toISOString()}] Fetching flight data...`);
      const startTime = Date.now();

      const flights = await fetchFunc();
      const fetchTime = Date.now() - startTime;

      if (flights.length > 0) {
        upsertFlights(flights);
        console.log(`  Fetched ${flights.length} flights in ${fetchTime}ms`);
      } else {
        console.log('  No flights returned from API');
      }

      // Prune old data periodically
      const pruneResult = pruneOldData();
      if (pruneResult.prunedFlights > 0) {
        console.log(`  Pruned ${pruneResult.prunedFlights} stale flights`);
      }

      const stats = getStats();
      console.log(`  DB stats: ${stats.flightCount} flights, ${stats.trailPointCount} trail points`);
    } catch (error) {
      console.error('Error updating flight data:', error.message);
      if (error.message.includes('429') || error.message.includes('rate')) {
        console.log('  Rate limited - will retry on next interval');
      }
    }
  }

  // Schedule data fetching
  const fetchInterval = config.fetchIntervalSeconds;
  console.log(`Scheduling data fetch every ${fetchInterval} seconds...`);

  // Use node-cron for reliable scheduling
  const cronExpression = `*/${fetchInterval} * * * * *`;
  cron.schedule(cronExpression, updateFlightData);

  // Initial fetch
  updateFlightData();
} else {
  console.log('Server-side fetching disabled (client fetches directly from OpenSky)');
  console.log('Set ENABLE_SERVER_FETCH=true to enable server-side data caching');
}

// Start server
const server = app.listen(config.port, () => {
  console.log(`Flight Tracker server running on port ${config.port}`);
  console.log(`Mode: ${enableServerFetch ? 'Server fetching enabled' : 'Client-side fetching (default)'}`);
  if (enableServerFetch) {
    console.log(`Data source: ${config.dataSource}`);
    console.log(`API endpoints:`);
    console.log(`  GET /api/flights       - Get all active flights`);
    console.log(`  GET /api/flights/:id   - Get specific flight`);
    console.log(`  GET /api/flights/:id/trail - Get flight trail history`);
    console.log(`  GET /api/trails        - Get all trails`);
    console.log(`  GET /api/stats         - Get statistics`);
  }
  console.log(`  GET /api/config        - Get client configuration`);
  console.log(`Client UI available at http://localhost:${config.port}/`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
});

export { app, server };
