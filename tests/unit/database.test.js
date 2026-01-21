/**
 * Unit Tests for Database Module
 */

import { jest } from '@jest/globals';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import {
  initDatabase,
  closeDatabase,
  upsertFlight,
  upsertFlights,
  getAllFlights,
  getFlightsSince,
  getFlightTrail,
  getAllTrails,
  pruneOldData,
  getStats,
  getDatabase
} from '../../src/server/database.js';

const TEST_DB_PATH = './data/test-flights.db';

describe('Database Module', () => {
  beforeAll(() => {
    // Ensure data directory exists
    const dir = dirname(TEST_DB_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  });

  beforeEach(() => {
    // Remove existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    if (existsSync(`${TEST_DB_PATH}-wal`)) {
      unlinkSync(`${TEST_DB_PATH}-wal`);
    }
    if (existsSync(`${TEST_DB_PATH}-shm`)) {
      unlinkSync(`${TEST_DB_PATH}-shm`);
    }

    // Initialize fresh database
    initDatabase(TEST_DB_PATH);
  });

  afterEach(() => {
    closeDatabase();
  });

  afterAll(() => {
    // Cleanup test files
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    if (existsSync(`${TEST_DB_PATH}-wal`)) {
      unlinkSync(`${TEST_DB_PATH}-wal`);
    }
    if (existsSync(`${TEST_DB_PATH}-shm`)) {
      unlinkSync(`${TEST_DB_PATH}-shm`);
    }
  });

  const createTestFlight = (id, overrides = {}) => ({
    id,
    callsign: `TST${id}`,
    latitude: 37.5 + Math.random(),
    longitude: -122.5 + Math.random(),
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

  describe('initDatabase', () => {
    it('should create database file', () => {
      expect(existsSync(TEST_DB_PATH)).toBe(true);
    });

    it('should create flights table', () => {
      const db = getDatabase();
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='flights'"
      ).all();
      expect(tables).toHaveLength(1);
    });

    it('should create flight_trails table', () => {
      const db = getDatabase();
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='flight_trails'"
      ).all();
      expect(tables).toHaveLength(1);
    });
  });

  describe('upsertFlight', () => {
    it('should insert a new flight', () => {
      const flight = createTestFlight('TEST001');
      upsertFlight(flight);

      const flights = getAllFlights();
      expect(flights).toHaveLength(1);
      expect(flights[0].id).toBe('TEST001');
    });

    it('should update an existing flight', () => {
      const flight = createTestFlight('TEST001', { altitude: 30000 });
      upsertFlight(flight);

      const updatedFlight = createTestFlight('TEST001', { altitude: 35000 });
      upsertFlight(updatedFlight);

      const flights = getAllFlights();
      expect(flights).toHaveLength(1);
      expect(flights[0].altitude).toBe(35000);
    });

    it('should create trail point on insert', () => {
      const flight = createTestFlight('TEST001');
      upsertFlight(flight);

      const trail = getFlightTrail('TEST001');
      expect(trail).toHaveLength(1);
    });
  });

  describe('upsertFlights', () => {
    it('should batch insert multiple flights', () => {
      const flights = [
        createTestFlight('TEST001'),
        createTestFlight('TEST002'),
        createTestFlight('TEST003')
      ];

      const count = upsertFlights(flights);
      expect(count).toBe(3);

      const allFlights = getAllFlights();
      expect(allFlights).toHaveLength(3);
    });

    it('should handle empty array', () => {
      const count = upsertFlights([]);
      expect(count).toBe(0);
    });
  });

  describe('getAllFlights', () => {
    it('should return all active flights', () => {
      upsertFlights([
        createTestFlight('TEST001'),
        createTestFlight('TEST002')
      ]);

      const flights = getAllFlights();
      expect(flights).toHaveLength(2);
    });

    it('should not return stale flights', async () => {
      upsertFlight(createTestFlight('TEST001'));

      // Get flights with very short max age (should exclude our flight)
      const flights = getAllFlights(1);
      expect(flights).toHaveLength(0);
    });
  });

  describe('getFlightsSince', () => {
    it('should return flights updated since timestamp', async () => {
      upsertFlight(createTestFlight('TEST001'));

      const beforeTimestamp = Date.now();

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      upsertFlight(createTestFlight('TEST002'));

      const flights = getFlightsSince(beforeTimestamp);
      expect(flights).toHaveLength(1);
      expect(flights[0].id).toBe('TEST002');
    });
  });

  describe('getFlightTrail', () => {
    it('should return trail points in chronological order', async () => {
      const flight = createTestFlight('TEST001');

      // Insert multiple positions
      for (let i = 0; i < 5; i++) {
        flight.latitude += 0.1;
        flight.timestamp = Date.now() + i * 100;
        upsertFlight(flight);
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      const trail = getFlightTrail('TEST001');
      expect(trail).toHaveLength(5);

      // Check chronological order
      for (let i = 1; i < trail.length; i++) {
        expect(trail[i].timestamp).toBeGreaterThanOrEqual(trail[i - 1].timestamp);
      }
    });

    it('should respect limit parameter', () => {
      const flight = createTestFlight('TEST001');

      for (let i = 0; i < 10; i++) {
        flight.latitude += 0.1;
        upsertFlight(flight);
      }

      const trail = getFlightTrail('TEST001', 5);
      expect(trail).toHaveLength(5);
    });
  });

  describe('getAllTrails', () => {
    it('should return trails for all active flights', () => {
      const flight1 = createTestFlight('TEST001');
      const flight2 = createTestFlight('TEST002');

      for (let i = 0; i < 3; i++) {
        flight1.latitude += 0.1;
        flight2.latitude += 0.1;
        upsertFlight(flight1);
        upsertFlight(flight2);
      }

      const trails = getAllTrails();
      expect(Object.keys(trails)).toHaveLength(2);
      expect(trails['TEST001']).toBeDefined();
      expect(trails['TEST002']).toBeDefined();
    });
  });

  describe('pruneOldData', () => {
    it('should remove stale flights', () => {
      upsertFlight(createTestFlight('TEST001'));

      // Prune with very short max age
      const result = pruneOldData(1);
      expect(result.prunedFlights).toBe(1);

      const flights = getAllFlights(1000 * 60 * 60); // Large max age
      expect(flights).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const flight = createTestFlight('TEST001');

      for (let i = 0; i < 5; i++) {
        flight.latitude += 0.1;
        upsertFlight(flight);
      }

      const stats = getStats();
      expect(stats.flightCount).toBe(1);
      expect(stats.trailPointCount).toBe(5);
    });
  });
});
