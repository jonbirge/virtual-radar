/**
 * Unit Tests for FAA Fetcher
 */

import { jest } from '@jest/globals';
import {
  normalizeFlightData,
  createMockFetcher
} from '../../src/server/faa-fetcher.js';

describe('FAA Fetcher', () => {
  describe('normalizeFlightData', () => {
    describe('OpenSky source', () => {
      it('should normalize valid OpenSky state vector', () => {
        const stateVector = [
          'abc123',    // icao24
          'UAL123 ',   // callsign (with trailing space)
          'United States',
          1699999999,  // time_position
          1699999999,  // last_contact
          -122.5,      // longitude
          37.5,        // latitude
          10000,       // baro_altitude (meters)
          false,       // on_ground
          250,         // velocity (m/s)
          45,          // true_track
          5,           // vertical_rate (m/s)
          null,        // sensors
          10050,       // geo_altitude
          '1200',      // squawk
          false,       // spi
          0            // position_source
        ];

        const result = normalizeFlightData(stateVector, 'opensky');

        expect(result).toBeDefined();
        expect(result.id).toBe('abc123');
        expect(result.callsign).toBe('UAL123');
        expect(result.latitude).toBe(37.5);
        expect(result.longitude).toBe(-122.5);
        expect(result.altitude).toBe(32808); // ~10000m in feet
        expect(result.heading).toBe(45);
        expect(result.speed).toBe(486); // ~250 m/s in knots
        expect(result.onGround).toBe(false);
        expect(result.squawk).toBe('1200');
        expect(result.source).toBe('opensky');
      });

      it('should return null for state vector without position', () => {
        const stateVector = [
          'abc123',
          'UAL123',
          'United States',
          null, null,
          null,  // no longitude
          null,  // no latitude
          10000,
          false,
          250, 45, 5, null, 10050, '1200', false, 0
        ];

        const result = normalizeFlightData(stateVector, 'opensky');
        expect(result).toBeNull();
      });

      it('should return null for empty state vector', () => {
        const result = normalizeFlightData(null, 'opensky');
        expect(result).toBeNull();
      });

      it('should use icao24 as callsign when callsign is empty', () => {
        const stateVector = [
          'abc123',
          '',  // empty callsign
          'United States',
          null, null,
          -122.5, 37.5,
          10000, false, 250, 45, 5, null, 10050, '1200', false, 0
        ];

        const result = normalizeFlightData(stateVector, 'opensky');
        expect(result.callsign).toBe('abc123');
      });

      it('should handle aircraft on ground', () => {
        const stateVector = [
          'abc123', 'UAL123', 'United States',
          null, null,
          -122.5, 37.5,
          0,      // altitude 0
          true,   // on_ground
          0, 0, 0, null, 0, '1200', false, 0
        ];

        const result = normalizeFlightData(stateVector, 'opensky');
        expect(result.onGround).toBe(true);
        expect(result.altitude).toBe(0);
      });

      it('should use geo_altitude when baro_altitude is null', () => {
        const stateVector = [
          'abc123', 'UAL123', 'United States',
          null, null,
          -122.5, 37.5,
          null,   // null baro_altitude
          false,
          250, 45, 5, null,
          5000,   // geo_altitude (meters)
          '1200', false, 0
        ];

        const result = normalizeFlightData(stateVector, 'opensky');
        expect(result.altitude).toBe(16404); // ~5000m in feet
      });
    });

    it('should throw error for unknown source', () => {
      expect(() => {
        normalizeFlightData({}, 'unknown');
      }).toThrow('Unknown data source: unknown');
    });
  });

  describe('createMockFetcher', () => {
    it('should create a fetcher that returns specified number of flights', async () => {
      const fetchMock = createMockFetcher(50);
      const flights = await fetchMock();

      expect(flights).toHaveLength(50);
    });

    it('should return flights with required fields', async () => {
      const fetchMock = createMockFetcher(5);
      const flights = await fetchMock();

      for (const flight of flights) {
        expect(flight).toHaveProperty('id');
        expect(flight).toHaveProperty('callsign');
        expect(flight).toHaveProperty('latitude');
        expect(flight).toHaveProperty('longitude');
        expect(flight).toHaveProperty('altitude');
        expect(flight).toHaveProperty('heading');
        expect(flight).toHaveProperty('speed');
        expect(flight).toHaveProperty('timestamp');
        expect(flight).toHaveProperty('source', 'mock');
      }
    });

    it('should update positions on subsequent calls', async () => {
      const fetchMock = createMockFetcher(5);

      const flights1 = await fetchMock();
      const firstPosition = { lat: flights1[0].latitude, lon: flights1[0].longitude };

      const flights2 = await fetchMock();
      const secondPosition = { lat: flights2[0].latitude, lon: flights2[0].longitude };

      // Position should have changed
      expect(secondPosition.lat).not.toBe(firstPosition.lat);
      expect(secondPosition.lon).not.toBe(firstPosition.lon);
    });

    it('should keep flights within US bounds', async () => {
      const fetchMock = createMockFetcher(100);

      // Call multiple times to simulate movement
      for (let i = 0; i < 10; i++) {
        const flights = await fetchMock();

        for (const flight of flights) {
          expect(flight.latitude).toBeGreaterThanOrEqual(20);
          expect(flight.latitude).toBeLessThanOrEqual(55);
          expect(flight.longitude).toBeGreaterThanOrEqual(-130);
          expect(flight.longitude).toBeLessThanOrEqual(-60);
        }
      }
    });
  });
});
