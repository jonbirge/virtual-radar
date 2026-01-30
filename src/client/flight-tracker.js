/**
 * Flight Tracker - Cesium Visualization
 */

class FlightTracker {
  constructor(config) {
    this.config = config;
    this.viewer = null;
    this.entities = new Map();      // flightId -> Cesium.Entity
    this.trails = new Map();        // flightId -> array of positions
    this.trailEntities = new Map(); // flightId -> Cesium.Entity (polyline)
    this.pollTimer = null;
    this.showTrails = true;
    this.showLabels = true;
    this.lastFetchTime = 0;

    this.init();
  }

  /**
   * Format altitude as flight level with climb/descent indicator
   * @param {number} altitude - Altitude in feet
   * @param {number} verticalRate - Vertical rate in ft/min
   * @returns {string} Formatted flight level (e.g., "FL290 ↑")
   */
  formatFlightLevel(altitude, verticalRate) {
    if (altitude < 1000) {
      // Below 1000 ft, show actual altitude
      const arrow = this.getVerticalArrow(verticalRate);
      return `${Math.round(altitude)}${arrow}`;
    }
    // Convert to flight level (divide by 100)
    const fl = Math.round(altitude / 100);
    const flStr = fl.toString().padStart(3, '0');
    const arrow = this.getVerticalArrow(verticalRate);
    return `FL${flStr}${arrow}`;
  }

  /**
   * Get unicode arrow for vertical rate
   * @param {number} verticalRate - Vertical rate in ft/min
   * @returns {string} Arrow character
   */
  getVerticalArrow(verticalRate) {
    if (!verticalRate || Math.abs(verticalRate) < 100) {
      return '';  // Level flight (less than 100 ft/min)
    }
    return verticalRate > 0 ? '↑' : '↓';
  }

  async init() {
    try {
      // Fetch server config (may contain Cesium token from environment)
      // This is optional - the app works without a backend server
      if (!this.config.cesiumAccessToken) {
        try {
          const resp = await fetch('/api/config');
          if (resp.ok) {
            const data = await resp.json();
            if (data.success && data.config.cesiumAccessToken) {
              this.config.cesiumAccessToken = data.config.cesiumAccessToken;
            }
          }
          // Silently ignore failures - expected when deployed as static files
        } catch (e) {
          // Expected when running without a backend server (static deployment)
        }
      }

      // Set Cesium Ion token if provided
      if (this.config.cesiumAccessToken) {
        Cesium.Ion.defaultAccessToken = this.config.cesiumAccessToken;
      }

      // Initialize Cesium viewer
      const viewerOptions = {
        animation: false,
        timeline: false,
        fullscreenButton: false,
        vrButton: false,
        geocoder: false,
        homeButton: true,
        navigationHelpButton: false,
        sceneModePicker: true,
        baseLayerPicker: true,
        selectionIndicator: true,
        infoBox: true
      };

      if (this.config.cesiumAccessToken) {
        viewerOptions.terrainProvider = await Cesium.createWorldTerrainAsync();
      }

      this.viewer = new Cesium.Viewer('cesiumContainer', viewerOptions);

      // Replace default imagery with Stadia Smooth Dark as the base layer
      const imageryLayers = this.viewer.imageryLayers;
      imageryLayers.removeAll();
      imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({
          url: this.config.stadia.url,
          credit: new Cesium.Credit(this.config.stadia.credit, true),
          minimumLevel: 0,
          maximumLevel: 20
        })
      );

      // Set initial camera position
      this.viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          this.config.defaultView.longitude,
          this.config.defaultView.latitude,
          this.config.defaultView.height
        )
      });

      // Handle entity selection
      this.viewer.selectedEntityChanged.addEventListener((entity) => {
        this.onEntitySelected(entity);
      });

      // Fetch server configuration
      await this.fetchServerConfig();

      // Setup UI controls
      this.setupControls();

      // Start polling
      await this.fetchFlights();
      this.startPolling();

      // Hide loading overlay
      document.getElementById('loading').classList.add('hidden');
    } catch (error) {
      console.error('Failed to initialize:', error);
      document.querySelector('#loading p').textContent =
        'Failed to initialize. Check console for details.';
    }
  }

  async fetchServerConfig() {
    // Data comes directly from OpenSky
    document.getElementById('dataSource').textContent = 'OpenSky (direct)';
    this.updatePollIntervalDisplay();
  }

  setupControls() {
    // Trail visibility toggle
    const showTrailsCheckbox = document.getElementById('showTrails');
    showTrailsCheckbox.addEventListener('change', (e) => {
      this.showTrails = e.target.checked;
      this.updateTrailVisibility();
    });

    // Label visibility toggle
    const showLabelsCheckbox = document.getElementById('showLabels');
    showLabelsCheckbox.addEventListener('change', (e) => {
      this.showLabels = e.target.checked;
      this.updateLabelVisibility();
    });

    // Poll interval selector
    const intervalSelect = document.getElementById('intervalSelect');
    intervalSelect.value = this.config.pollInterval.toString();
    intervalSelect.addEventListener('change', (e) => {
      this.config.pollInterval = parseInt(e.target.value, 10);
      this.restartPolling();
      this.updatePollIntervalDisplay();
    });

    this.updatePollIntervalDisplay();
  }

  updatePollIntervalDisplay() {
    document.getElementById('pollInterval').textContent =
      `${this.config.pollInterval / 1000}s`;
  }

  startPolling() {
    this.pollTimer = setInterval(() => this.fetchFlights(), this.config.pollInterval);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  restartPolling() {
    this.stopPolling();
    this.startPolling();
  }

  /**
   * Get the current camera view bounds (lat/lon bounding box)
   */
  getViewBounds() {
    try {
      const canvas = this.viewer.scene.canvas;
      const ellipsoid = this.viewer.scene.globe.ellipsoid;

      // Get corner positions of the view
      const corners = [
        new Cesium.Cartesian2(0, 0),
        new Cesium.Cartesian2(canvas.width, 0),
        new Cesium.Cartesian2(0, canvas.height),
        new Cesium.Cartesian2(canvas.width, canvas.height),
        new Cesium.Cartesian2(canvas.width / 2, 0),
        new Cesium.Cartesian2(canvas.width / 2, canvas.height),
        new Cesium.Cartesian2(0, canvas.height / 2),
        new Cesium.Cartesian2(canvas.width, canvas.height / 2)
      ];

      let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
      let validCorners = 0;

      for (const corner of corners) {
        const ray = this.viewer.camera.getPickRay(corner);
        if (!ray) continue;

        const intersection = this.viewer.scene.globe.pick(ray, this.viewer.scene);
        if (!intersection) continue;

        const cartographic = ellipsoid.cartesianToCartographic(intersection);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);
        const lon = Cesium.Math.toDegrees(cartographic.longitude);

        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        validCorners++;
      }

      // If we couldn't get enough valid corners, return default bounds
      if (validCorners < 2) {
        return this.config.opensky.defaultBounds;
      }

      // Clamp to valid ranges
      minLat = Math.max(-90, minLat);
      maxLat = Math.min(90, maxLat);
      minLon = Math.max(-180, minLon);
      maxLon = Math.min(180, maxLon);

      return { minLat, maxLat, minLon, maxLon };
    } catch (e) {
      console.warn('Could not compute view bounds:', e);
      return this.config.opensky.defaultBounds;
    }
  }

  /**
   * Normalize OpenSky state vector to common flight format
   * OpenSky state vector format:
   * [0] icao24, [1] callsign, [2] origin_country, [3] time_position,
   * [4] last_contact, [5] longitude, [6] latitude, [7] baro_altitude,
   * [8] on_ground, [9] velocity, [10] true_track, [11] vertical_rate,
   * [12] sensors, [13] geo_altitude, [14] squawk, [15] spi, [16] position_source
   */
  normalizeOpenSkyFlight(state) {
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
      timestamp: Date.now()
    };
  }

  async fetchFlights() {
    try {
      // Get current view bounds
      const bounds = this.getViewBounds();

      // Build OpenSky API URL with bounding box
      const url = new URL(`${this.config.opensky.baseUrl}/states/all`);
      url.searchParams.set('lamin', bounds.minLat);
      url.searchParams.set('lamax', bounds.maxLat);
      url.searchParams.set('lomin', bounds.minLon);
      url.searchParams.set('lomax', bounds.maxLon);

      const response = await fetch(url.toString());

      if (!response.ok) {
        console.error(`OpenSky API error: ${response.status} ${response.statusText}`);
        return;
      }

      const data = await response.json();

      if (!data.states || !Array.isArray(data.states)) {
        // No flights in this region
        this.removeStaleFlights(new Set());
        document.getElementById('flightCount').textContent = '0';
        document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
        return;
      }

      // Process flights
      const currentFlightIds = new Set();

      for (const state of data.states) {
        const flight = this.normalizeOpenSkyFlight(state);
        if (flight) {
          currentFlightIds.add(flight.id);
          this.updateFlight(flight);
        }
      }

      // Remove flights no longer in view or no longer reported
      this.removeStaleFlights(currentFlightIds);

      // Update stats display
      document.getElementById('flightCount').textContent = this.entities.size;
      document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
      this.lastFetchTime = Date.now();

    } catch (error) {
      console.error('Failed to fetch flights:', error);
    }
  }

  updateFlight(flight) {
    const position = Cesium.Cartesian3.fromDegrees(
      flight.longitude,
      flight.latitude,
      flight.altitude * 0.3048  // feet to meters
    );

    // Update or add trail
    this.updateTrail(flight.id, position, flight.altitude);

    // Build radar-style data block label
    const flightLevel = this.formatFlightLevel(flight.altitude, flight.verticalRate);
    const labelText = `${flight.callsign}\n${flightLevel}`;

    if (this.entities.has(flight.id)) {
      // Update existing entity
      const entity = this.entities.get(flight.id);
      entity.position = position;
      entity.point.color = this.getAltitudeColor(flight.altitude, flight.onGround);
      entity.properties = flight;

      // Update label with callsign and flight level
      if (entity.label) {
        entity.label.text = labelText;
        entity.label.show = this.showLabels;
      }
    } else {
      // Create new entity with radar-style appearance
      const entity = this.viewer.entities.add({
        id: flight.id,
        position: position,
        point: {
          pixelSize: this.config.aircraft.pointSize,
          color: this.getAltitudeColor(flight.altitude, flight.onGround),
          outlineColor: Cesium.Color.fromCssColorString('#00ff00').withAlpha(0.5),
          outlineWidth: 1,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        label: {
          text: labelText,
          font: '11px "Courier New", "Lucida Console", Monaco, monospace',
          fillColor: Cesium.Color.fromCssColorString('#00ff00'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.TOP,
          horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
          pixelOffset: new Cesium.Cartesian2(8, -4),
          show: this.showLabels,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        properties: flight
      });

      this.entities.set(flight.id, entity);
    }
  }

  updateTrail(flightId, position, altitude) {
    // Get or create trail array
    if (!this.trails.has(flightId)) {
      this.trails.set(flightId, []);
    }

    const trail = this.trails.get(flightId);

    // Add new position
    trail.push({
      position: position,
      altitude: altitude
    });

    // Trim to max points
    while (trail.length > this.config.maxTrailPoints) {
      trail.shift();
    }

    // Update or create trail polyline
    this.updateTrailEntity(flightId);
  }

  updateTrailEntity(flightId) {
    const trail = this.trails.get(flightId);
    if (!trail || trail.length < 2) return;

    const positions = trail.map(p => p.position);

    if (this.trailEntities.has(flightId)) {
      // Update existing polyline
      const entity = this.trailEntities.get(flightId);
      entity.polyline.positions = positions;
      entity.polyline.show = this.showTrails;
    } else {
      // Create new polyline entity with semi-transparent radar-style trail
      const entity = this.viewer.entities.add({
        id: `trail-${flightId}`,
        polyline: {
          positions: positions,
          width: this.config.aircraft.trail.width,
          material: Cesium.Color.fromCssColorString('#00ff00').withAlpha(this.config.aircraft.trail.opacity),
          clampToGround: false,
          show: this.showTrails
        }
      });

      this.trailEntities.set(flightId, entity);
    }
  }

  removeStaleFlights(currentFlightIds) {
    // Remove flights that are no longer active
    for (const [flightId, entity] of this.entities) {
      if (!currentFlightIds.has(flightId)) {
        this.viewer.entities.remove(entity);
        this.entities.delete(flightId);

        // Remove trail
        const trailEntity = this.trailEntities.get(flightId);
        if (trailEntity) {
          this.viewer.entities.remove(trailEntity);
          this.trailEntities.delete(flightId);
        }
        this.trails.delete(flightId);
      }
    }
  }

  getAltitudeColor(altitude, onGround) {
    const colors = this.config.aircraft.altitudeColors;

    if (onGround) {
      return Cesium.Color.fromCssColorString(colors.ground);
    } else if (altitude < 10000) {
      return Cesium.Color.fromCssColorString(colors.low);
    } else if (altitude < 25000) {
      return Cesium.Color.fromCssColorString(colors.medium);
    } else if (altitude < 35000) {
      return Cesium.Color.fromCssColorString(colors.high);
    } else {
      return Cesium.Color.fromCssColorString(colors.cruise);
    }
  }

  updateTrailVisibility() {
    for (const [, entity] of this.trailEntities) {
      entity.polyline.show = this.showTrails;
    }
  }

  updateLabelVisibility() {
    for (const [, entity] of this.entities) {
      if (entity.label) {
        entity.label.show = this.showLabels;
      }
    }
  }

  onEntitySelected(entity) {
    const selectedFlightDiv = document.getElementById('selectedFlight');
    const detailsDiv = document.getElementById('flightDetails');

    if (!entity || !entity.properties) {
      selectedFlightDiv.style.display = 'none';
      return;
    }

    const flight = entity.properties;

    // Check if it's a trail entity (skip those)
    if (entity.id && entity.id.startsWith('trail-')) {
      selectedFlightDiv.style.display = 'none';
      return;
    }

    selectedFlightDiv.style.display = 'block';

    // Format altitude as flight level
    const flightLevel = flight.altitude ? this.formatFlightLevel(flight.altitude, flight.verticalRate) : 'N/A';

    // Format vertical rate with arrow
    let vsDisplay = 'N/A';
    if (flight.verticalRate) {
      const arrow = this.getVerticalArrow(flight.verticalRate);
      vsDisplay = `${flight.verticalRate > 0 ? '+' : ''}${flight.verticalRate} ${arrow}`;
    }

    detailsDiv.innerHTML = `
      <div><span class="detail-label">CALLSIGN:</span> ${flight.callsign || 'N/A'}</div>
      <div><span class="detail-label">ICAO:</span> ${flight.id || 'N/A'}</div>
      <div><span class="detail-label">ALT:</span> ${flightLevel}</div>
      <div><span class="detail-label">GS:</span> ${flight.speed ? flight.speed + ' KTS' : 'N/A'}</div>
      <div><span class="detail-label">HDG:</span> ${flight.heading ? Math.round(flight.heading).toString().padStart(3, '0') + '°' : 'N/A'}</div>
      <div><span class="detail-label">VS:</span> ${vsDisplay}</div>
      <div><span class="detail-label">SQUAWK:</span> ${flight.squawk || '----'}</div>
      <div><span class="detail-label">GND:</span> ${flight.onGround ? 'YES' : 'NO'}</div>
    `;
  }
}

// Initialize tracker when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.flightTracker = new FlightTracker(ClientConfig);
});
