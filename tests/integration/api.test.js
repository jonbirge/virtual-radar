/**
 * Integration Tests for REST API
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { dirname } from 'path';

import { createApiRouter } from '../../src/server/api.js';
import {
  initDatabase,
  closeDatabase,
  upsertFlight,
  upsertFlights
} from '../../src/server/database.js';

const TEST_DB_PATH = './data/test-api-flights.db';

describe('REST API', () => {
  let app;

  const createTestFlight = (id, overrides = {}) => ({
    id,
    callsign: `TST${id}`,
    latitude: 37.5,
    longitude: -122.5,
    altitude: 35000,
    heading: 90,
    speed: 450,
    verticalRate: 0,
    onGround: false,
    squawk: '1200',
    timestamp: Date.now(),
    source: 'test',
    ...overrides
  });

  beforeAll(() => {
    const dir = dirname(TEST_DB_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  });

  beforeEach(() => {
    // Cleanup database files
    [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`].forEach(file => {
      if (existsSync(file)) unlinkSync(file);
    });

    initDatabase(TEST_DB_PATH);

    // Create Express app with API router
    app = express();
    app.use('/api', createApiRouter());
  });

  afterEach(() => {
    closeDatabase();
  });

  afterAll(() => {
    [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`].forEach(file => {
      if (existsSync(file)) unlinkSync(file);
    });
  });

  describe('GET /api/flights', () => {
    it('should return empty array when no flights', async () => {
      const res = await request(app).get('/api/flights');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.flights).toHaveLength(0);
      expect(res.body.count).toBe(0);
    });

    it('should return all flights', async () => {
      upsertFlights([
        createTestFlight('TEST001'),
        createTestFlight('TEST002'),
        createTestFlight('TEST003')
      ]);

      const res = await request(app).get('/api/flights');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.flights).toHaveLength(3);
      expect(res.body.count).toBe(3);
      expect(res.body.timestamp).toBeDefined();
    });

    it('should return flights since timestamp', async () => {
      upsertFlight(createTestFlight('TEST001'));

      const beforeTimestamp = Date.now();
      await new Promise(resolve => setTimeout(resolve, 10));

      upsertFlight(createTestFlight('TEST002'));

      const res = await request(app)
        .get('/api/flights')
        .query({ since: beforeTimestamp });

      expect(res.status).toBe(200);
      expect(res.body.flights).toHaveLength(1);
      expect(res.body.flights[0].id).toBe('TEST002');
    });

    it('should include required flight fields', async () => {
      upsertFlight(createTestFlight('TEST001'));

      const res = await request(app).get('/api/flights');
      const flight = res.body.flights[0];

      expect(flight).toHaveProperty('id');
      expect(flight).toHaveProperty('callsign');
      expect(flight).toHaveProperty('latitude');
      expect(flight).toHaveProperty('longitude');
      expect(flight).toHaveProperty('altitude');
      expect(flight).toHaveProperty('heading');
      expect(flight).toHaveProperty('speed');
      expect(flight).toHaveProperty('verticalRate');
      expect(flight).toHaveProperty('onGround');
      expect(flight).toHaveProperty('timestamp');
      expect(flight).toHaveProperty('source');
    });
  });

  describe('GET /api/flights/:id', () => {
    it('should return specific flight', async () => {
      upsertFlights([
        createTestFlight('TEST001'),
        createTestFlight('TEST002')
      ]);

      const res = await request(app).get('/api/flights/TEST001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.flight.id).toBe('TEST001');
    });

    it('should return 404 for non-existent flight', async () => {
      const res = await request(app).get('/api/flights/NONEXISTENT');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Flight not found');
    });
  });

  describe('GET /api/flights/:id/trail', () => {
    it('should return flight trail', async () => {
      const flight = createTestFlight('TEST001');

      // Create multiple positions
      for (let i = 0; i < 5; i++) {
        flight.latitude += 0.1;
        flight.timestamp = Date.now() + i * 100;
        upsertFlight(flight);
      }

      const res = await request(app).get('/api/flights/TEST001/trail');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.flightId).toBe('TEST001');
      expect(res.body.trail).toHaveLength(5);
      expect(res.body.count).toBe(5);
    });

    it('should respect limit parameter', async () => {
      const flight = createTestFlight('TEST001');

      for (let i = 0; i < 10; i++) {
        flight.latitude += 0.1;
        upsertFlight(flight);
      }

      const res = await request(app)
        .get('/api/flights/TEST001/trail')
        .query({ limit: 3 });

      expect(res.body.trail).toHaveLength(3);
    });

    it('should return trail points with required fields', async () => {
      upsertFlight(createTestFlight('TEST001'));

      const res = await request(app).get('/api/flights/TEST001/trail');
      const point = res.body.trail[0];

      expect(point).toHaveProperty('latitude');
      expect(point).toHaveProperty('longitude');
      expect(point).toHaveProperty('altitude');
      expect(point).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/trails', () => {
    it('should return all trails', async () => {
      const flight1 = createTestFlight('TEST001');
      const flight2 = createTestFlight('TEST002');

      for (let i = 0; i < 3; i++) {
        flight1.latitude += 0.1;
        flight2.latitude += 0.1;
        upsertFlight(flight1);
        upsertFlight(flight2);
      }

      const res = await request(app).get('/api/trails');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
      expect(res.body.trails['TEST001']).toBeDefined();
      expect(res.body.trails['TEST002']).toBeDefined();
    });
  });

  describe('GET /api/stats', () => {
    it('should return database statistics', async () => {
      const flight = createTestFlight('TEST001');

      for (let i = 0; i < 5; i++) {
        flight.latitude += 0.1;
        upsertFlight(flight);
      }

      const res = await request(app).get('/api/stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.stats.flightCount).toBe(1);
      expect(res.body.stats.trailPointCount).toBe(5);
      expect(res.body.stats.dataSource).toBeDefined();
      expect(res.body.stats.fetchInterval).toBeDefined();
    });
  });

  describe('GET /api/config', () => {
    it('should return client configuration', async () => {
      const res = await request(app).get('/api/config');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.config).toHaveProperty('recommendedPollInterval');
      expect(res.body.config).toHaveProperty('maxTrailPoints');
      expect(res.body.config).toHaveProperty('dataSource');
    });
  });
});
