/**
 * SQLite Database Module for Flight Data
 * Uses better-sqlite3 for synchronous, file-based storage
 */

import Database from 'better-sqlite3';
import { config } from './config.js';
import { dirname } from 'path';
import { mkdirSync, existsSync } from 'fs';

let db = null;

/**
 * Initialize the database and create tables
 */
export function initDatabase(dbPath = config.dbPath) {
  // Ensure data directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  // Create flights table
  db.exec(`
    CREATE TABLE IF NOT EXISTS flights (
      id TEXT PRIMARY KEY,
      callsign TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      altitude REAL NOT NULL,
      heading REAL NOT NULL,
      speed REAL NOT NULL,
      vertical_rate REAL DEFAULT 0,
      on_ground INTEGER DEFAULT 0,
      squawk TEXT,
      timestamp INTEGER NOT NULL,
      source TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Create trail history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS flight_trails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flight_id TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      altitude REAL NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (flight_id) REFERENCES flights(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_flights_updated ON flights(updated_at);
    CREATE INDEX IF NOT EXISTS idx_trails_flight_id ON flight_trails(flight_id);
    CREATE INDEX IF NOT EXISTS idx_trails_timestamp ON flight_trails(timestamp);
  `);

  // Prepare commonly used statements
  prepareStatements();

  return db;
}

// Prepared statements for better performance
const statements = {};

function prepareStatements() {
  statements.upsertFlight = db.prepare(`
    INSERT INTO flights (id, callsign, latitude, longitude, altitude, heading, speed, vertical_rate, on_ground, squawk, timestamp, source, updated_at)
    VALUES (@id, @callsign, @latitude, @longitude, @altitude, @heading, @speed, @verticalRate, @onGround, @squawk, @timestamp, @source, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      callsign = @callsign,
      latitude = @latitude,
      longitude = @longitude,
      altitude = @altitude,
      heading = @heading,
      speed = @speed,
      vertical_rate = @verticalRate,
      on_ground = @onGround,
      squawk = @squawk,
      timestamp = @timestamp,
      source = @source,
      updated_at = @updatedAt
  `);

  statements.insertTrailPoint = db.prepare(`
    INSERT INTO flight_trails (flight_id, latitude, longitude, altitude, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `);

  statements.getAllFlights = db.prepare(`
    SELECT id, callsign, latitude, longitude, altitude, heading, speed,
           vertical_rate as verticalRate, on_ground as onGround, squawk, timestamp, source
    FROM flights
    WHERE updated_at > ?
  `);

  statements.getFlightsSince = db.prepare(`
    SELECT id, callsign, latitude, longitude, altitude, heading, speed,
           vertical_rate as verticalRate, on_ground as onGround, squawk, timestamp, source
    FROM flights
    WHERE timestamp > ? AND updated_at > ?
  `);

  statements.getFlightTrail = db.prepare(`
    SELECT latitude, longitude, altitude, timestamp
    FROM flight_trails
    WHERE flight_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  statements.getAllTrails = db.prepare(`
    SELECT flight_id as flightId, latitude, longitude, altitude, timestamp
    FROM flight_trails
    WHERE flight_id IN (SELECT id FROM flights WHERE updated_at > ?)
    ORDER BY flight_id, timestamp DESC
  `);

  statements.pruneOldFlights = db.prepare(`
    DELETE FROM flights WHERE updated_at < ?
  `);

  statements.pruneOldTrails = db.prepare(`
    DELETE FROM flight_trails
    WHERE flight_id NOT IN (SELECT id FROM flights)
  `);

  statements.pruneExcessTrails = db.prepare(`
    DELETE FROM flight_trails
    WHERE id NOT IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY flight_id ORDER BY timestamp DESC) as rn
        FROM flight_trails
      ) WHERE rn <= ?
    )
  `);

  statements.getStats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM flights) as flightCount,
      (SELECT COUNT(*) FROM flight_trails) as trailPointCount
  `);
}

/**
 * Update or insert a flight
 */
export function upsertFlight(flight) {
  const now = Date.now();
  statements.upsertFlight.run({
    id: flight.id,
    callsign: flight.callsign,
    latitude: flight.latitude,
    longitude: flight.longitude,
    altitude: flight.altitude,
    heading: flight.heading,
    speed: flight.speed,
    verticalRate: flight.verticalRate || 0,
    onGround: flight.onGround ? 1 : 0,
    squawk: flight.squawk || null,
    timestamp: flight.timestamp,
    source: flight.source,
    updatedAt: now
  });

  // Add trail point
  statements.insertTrailPoint.run(
    flight.id,
    flight.latitude,
    flight.longitude,
    flight.altitude,
    flight.timestamp
  );
}

/**
 * Batch update flights (transactional)
 */
export function upsertFlights(flights) {
  const transaction = db.transaction((flightList) => {
    for (const flight of flightList) {
      upsertFlight(flight);
    }
  });

  transaction(flights);
  return flights.length;
}

/**
 * Get all active flights
 */
export function getAllFlights(maxAge = config.maxFlightAge) {
  const cutoff = Date.now() - maxAge;
  return statements.getAllFlights.all(cutoff);
}

/**
 * Get flights updated since a timestamp
 */
export function getFlightsSince(timestamp, maxAge = config.maxFlightAge) {
  const cutoff = Date.now() - maxAge;
  return statements.getFlightsSince.all(timestamp, cutoff);
}

/**
 * Get trail for a specific flight
 */
export function getFlightTrail(flightId, limit = config.maxTrailPoints) {
  const points = statements.getFlightTrail.all(flightId, limit);
  // Reverse to get chronological order
  return points.reverse();
}

/**
 * Get all trails for active flights
 */
export function getAllTrails(maxAge = config.maxFlightAge, maxPoints = config.maxTrailPoints) {
  const cutoff = Date.now() - maxAge;
  const rawTrails = statements.getAllTrails.all(cutoff);

  // Group by flight and limit points
  const trailsByFlight = {};
  for (const point of rawTrails) {
    if (!trailsByFlight[point.flightId]) {
      trailsByFlight[point.flightId] = [];
    }
    if (trailsByFlight[point.flightId].length < maxPoints) {
      trailsByFlight[point.flightId].push({
        latitude: point.latitude,
        longitude: point.longitude,
        altitude: point.altitude,
        timestamp: point.timestamp
      });
    }
  }

  // Reverse each trail to chronological order
  for (const flightId in trailsByFlight) {
    trailsByFlight[flightId].reverse();
  }

  return trailsByFlight;
}

/**
 * Remove old flights and trail points
 */
export function pruneOldData(maxAge = config.maxFlightAge) {
  const cutoff = Date.now() - maxAge;

  const flightResult = statements.pruneOldFlights.run(cutoff);
  statements.pruneOldTrails.run();
  statements.pruneExcessTrails.run(config.maxTrailPoints);

  return {
    prunedFlights: flightResult.changes
  };
}

/**
 * Get database statistics
 */
export function getStats() {
  return statements.getStats.get();
}

/**
 * Close the database
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Get the raw database instance (for testing)
 */
export function getDatabase() {
  return db;
}
