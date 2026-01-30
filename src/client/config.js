/**
 * Client Configuration
 */

const ClientConfig = {
  // API endpoint (relative to current host)
  apiBaseUrl: '/api',

  // Polling interval in milliseconds (default 10 seconds)
  pollInterval: 10000,

  // Maximum trail points to keep per aircraft
  maxTrailPoints: 256,

  // Cesium Ion access token (get free token at https://cesium.com/ion/tokens)
  // Leave empty to use default Cesium assets
  cesiumAccessToken: '',

  // Default camera position (centered on US)
  defaultView: {
    longitude: -98.5795,  // Center of continental US
    latitude: 39.8283,
    height: 5000000       // 5000km up
  },

  // OpenSky Network API settings
  opensky: {
    baseUrl: 'https://opensky-network.org/api',
    // Default bounding box for continental US (used when camera bounds can't be computed)
    defaultBounds: {
      minLat: 24.396308,
      maxLat: 49.384358,
      minLon: -125.0,
      maxLon: -66.93457
    }
  },

  // Aircraft display settings
  aircraft: {
    // Size of aircraft point in pixels
    pointSize: 6,

    // FAA radar-style colors based on altitude (in feet)
    altitudeColors: {
      ground: '#666666',      // On ground - dim gray
      low: '#00cc00',         // < 10,000 ft - green
      medium: '#00ff66',      // 10,000 - 25,000 ft - bright green
      high: '#33ff99',        // 25,000 - 35,000 ft - cyan-green
      cruise: '#66ffcc'       // > 35,000 ft - cyan
    },

    // Trail settings
    trail: {
      width: 1.5,
      opacity: 0.4
    }
  }
};

// Allow configuration override from URL params
(function() {
  const params = new URLSearchParams(window.location.search);

  if (params.has('poll')) {
    ClientConfig.pollInterval = parseInt(params.get('poll'), 10);
  }

  if (params.has('cesiumToken')) {
    ClientConfig.cesiumAccessToken = params.get('cesiumToken');
  }
})();
