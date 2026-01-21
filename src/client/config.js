/**
 * Client Configuration
 */

const ClientConfig = {
  // API endpoint (relative to current host)
  apiBaseUrl: '/api',

  // Polling interval in milliseconds (default 5 seconds)
  pollInterval: 5000,

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

  // Aircraft display settings
  aircraft: {
    // Size of aircraft point in pixels
    pointSize: 8,

    // Colors based on altitude (in feet)
    altitudeColors: {
      ground: '#888888',      // On ground
      low: '#00ff00',         // < 10,000 ft
      medium: '#ffff00',      // 10,000 - 25,000 ft
      high: '#ff8800',        // 25,000 - 35,000 ft
      cruise: '#ff0000'       // > 35,000 ft
    },

    // Trail settings
    trail: {
      width: 2,
      opacity: 0.7
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
