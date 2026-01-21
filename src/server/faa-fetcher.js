/**
 * FAA/Flight Data Fetcher
 *
 * Supports multiple data sources:
 * - OpenSky Network (free, rate-limited)
 * - FAA SWIM (requires subscription)
 */

import { config } from './config.js';

/**
 * Normalize flight data to a common format
 */
export function normalizeFlightData(rawFlight, source) {
  if (source === 'opensky') {
    return normalizeOpenSkyFlight(rawFlight);
  } else if (source === 'faa') {
    return normalizeFaaFlight(rawFlight);
  }
  throw new Error(`Unknown data source: ${source}`);
}

/**
 * Normalize OpenSky Network state vector to common format
 * OpenSky state vector format:
 * [0] icao24, [1] callsign, [2] origin_country, [3] time_position,
 * [4] last_contact, [5] longitude, [6] latitude, [7] baro_altitude,
 * [8] on_ground, [9] velocity, [10] true_track, [11] vertical_rate,
 * [12] sensors, [13] geo_altitude, [14] squawk, [15] spi, [16] position_source
 */
function normalizeOpenSkyFlight(state) {
  if (!state || !state[0]) return null;

  const icao24 = state[0];
  const callsign = (state[1] || '').trim();
  const longitude = state[5];
  const latitude = state[6];
  const altitude = state[7] || state[13] || 0;  // baro or geo altitude
  const onGround = state[8];
  const velocity = state[9];
  const heading = state[10];
  const verticalRate = state[11];
  const squawk = state[14];

  // Skip if no position data
  if (longitude === null || latitude === null) return null;

  return {
    id: icao24,
    callsign: callsign || icao24,
    latitude,
    longitude,
    altitude: Math.round(altitude * 3.28084),  // meters to feet
    heading: heading || 0,
    speed: velocity ? Math.round(velocity * 1.944) : 0,  // m/s to knots
    verticalRate: verticalRate ? Math.round(verticalRate * 196.85) : 0,  // m/s to ft/min
    onGround,
    squawk,
    timestamp: Date.now(),
    source: 'opensky'
  };
}

/**
 * Normalize FAA SWIM data format (placeholder)
 */
function normalizeFaaFlight(data) {
  // FAA SWIM TFMS/STDDS format would be parsed here
  // This is a placeholder for actual FAA integration
  return {
    id: data.aircraftId || data.icaoId,
    callsign: data.callsign || data.flightId,
    latitude: data.latitude || data.position?.lat,
    longitude: data.longitude || data.position?.lon,
    altitude: data.altitude,
    heading: data.heading || data.track,
    speed: data.groundSpeed,
    verticalRate: data.verticalSpeed || 0,
    onGround: data.onGround || false,
    squawk: data.squawk,
    timestamp: Date.now(),
    source: 'faa'
  };
}

/**
 * Fetch flights from OpenSky Network
 */
export async function fetchFromOpenSky() {
  const { bounds, username, password } = config.opensky;

  const url = new URL(`${config.opensky.baseUrl}/states/all`);
  url.searchParams.set('lamin', bounds.minLat);
  url.searchParams.set('lamax', bounds.maxLat);
  url.searchParams.set('lomin', bounds.minLon);
  url.searchParams.set('lomax', bounds.maxLon);

  const headers = {};
  if (username && password) {
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    headers['Authorization'] = `Basic ${auth}`;
  }

  const response = await fetch(url.toString(), { headers });

  if (!response.ok) {
    throw new Error(`OpenSky API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.states || !Array.isArray(data.states)) {
    return [];
  }

  return data.states
    .map(state => normalizeOpenSkyFlight(state))
    .filter(flight => flight !== null);
}

/**
 * Fetch flights from FAA SWIM (placeholder)
 */
export async function fetchFromFaa() {
  if (!config.faa.endpoint || !config.faa.apiKey) {
    throw new Error('FAA credentials not configured');
  }

  const response = await fetch(config.faa.endpoint, {
    headers: {
      'Authorization': `Bearer ${config.faa.apiKey}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`FAA API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  return data.flights
    .map(flight => normalizeFaaFlight(flight))
    .filter(flight => flight !== null);
}

/**
 * Main fetch function - routes to appropriate source
 */
export async function fetchFlights() {
  const source = config.dataSource;

  if (source === 'opensky') {
    return fetchFromOpenSky();
  } else if (source === 'faa') {
    return fetchFromFaa();
  }

  throw new Error(`Unknown data source: ${source}`);
}

/**
 * Create a mock flight generator for testing
 */
export function createMockFetcher(numFlights = 100) {
  const flights = [];

  // Generate initial mock flights
  for (let i = 0; i < numFlights; i++) {
    flights.push({
      id: `MOCK${i.toString().padStart(4, '0')}`,
      callsign: `TST${Math.floor(Math.random() * 9999)}`,
      latitude: 24.5 + Math.random() * 24,   // US latitude range
      longitude: -124 + Math.random() * 57,  // US longitude range
      altitude: 5000 + Math.random() * 35000,
      heading: Math.random() * 360,
      speed: 200 + Math.random() * 400,
      verticalRate: (Math.random() - 0.5) * 2000,
      onGround: false,
      squawk: Math.floor(1000 + Math.random() * 6999).toString(),
      timestamp: Date.now(),
      source: 'mock'
    });
  }

  return async function fetchMockFlights() {
    // Update positions based on heading and speed
    const dt = 10;  // seconds since last update

    for (const flight of flights) {
      // Convert heading to radians
      const headingRad = (flight.heading * Math.PI) / 180;

      // Calculate movement (simplified)
      const speedKmH = flight.speed * 1.852;  // knots to km/h
      const distanceKm = (speedKmH * dt) / 3600;

      // Update position
      const latChange = (distanceKm / 111) * Math.cos(headingRad);
      const lonChange = (distanceKm / (111 * Math.cos(flight.latitude * Math.PI / 180))) * Math.sin(headingRad);

      flight.latitude += latChange;
      flight.longitude += lonChange;
      flight.altitude += (flight.verticalRate * dt) / 60;

      // Keep within bounds
      if (flight.latitude < 24.5 || flight.latitude > 49) {
        flight.heading = 360 - flight.heading;
      }
      if (flight.longitude < -124 || flight.longitude > -67) {
        flight.heading = 180 - flight.heading;
      }

      // Normalize heading
      flight.heading = ((flight.heading % 360) + 360) % 360;

      // Update timestamp
      flight.timestamp = Date.now();
    }

    return [...flights];
  };
}
