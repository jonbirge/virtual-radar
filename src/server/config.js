/**
 * Server configuration
 */
export const config = {
  // Server settings
  port: process.env.PORT || 3000,

  // Database settings
  dbPath: process.env.DB_PATH || './data/flights.db',

  // FAA/Flight data fetch settings
  fetchIntervalSeconds: parseInt(process.env.FETCH_INTERVAL || '10', 10),

  // Data source: 'opensky' (free API) or 'faa' (requires credentials)
  dataSource: process.env.DATA_SOURCE || 'opensky',

  // OpenSky Network API settings (free tier)
  opensky: {
    baseUrl: 'https://opensky-network.org/api',
    // Bounding box for continental US
    bounds: {
      minLat: 24.396308,  // Southern tip of Florida
      maxLat: 49.384358,  // Northern border
      minLon: -125.0,     // West coast
      maxLon: -66.93457   // East coast
    },
    // Optional credentials for higher rate limits
    username: process.env.OPENSKY_USERNAME || null,
    password: process.env.OPENSKY_PASSWORD || null
  },

  // FAA SWIM settings (placeholder for actual FAA integration)
  faa: {
    endpoint: process.env.FAA_ENDPOINT || null,
    apiKey: process.env.FAA_API_KEY || null
  },

  // Data retention
  maxFlightAge: 5 * 60 * 1000,  // Remove flights not seen in 5 minutes
  maxTrailPoints: 256           // Maximum trail history per flight
};
