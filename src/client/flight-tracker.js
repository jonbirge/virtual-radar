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
    this.lastTimestamp = 0;
    this.pollTimer = null;
    this.showTrails = true;
    this.showLabels = true;

    this.init();
  }

  async init() {
    try {
      // Set Cesium Ion token if provided
      if (this.config.cesiumAccessToken) {
        Cesium.Ion.defaultAccessToken = this.config.cesiumAccessToken;
      }

      // Initialize Cesium viewer
      this.viewer = new Cesium.Viewer('cesiumContainer', {
        terrainProvider: await Cesium.createWorldTerrainAsync(),
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
      });

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
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/config`);
      const data = await response.json();

      if (data.success) {
        document.getElementById('dataSource').textContent = data.config.dataSource;
        this.updatePollIntervalDisplay();
      }
    } catch (error) {
      console.warn('Could not fetch server config:', error);
    }
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

  async fetchFlights() {
    try {
      // Fetch flights updated since last timestamp
      const url = this.lastTimestamp
        ? `${this.config.apiBaseUrl}/flights?since=${this.lastTimestamp}`
        : `${this.config.apiBaseUrl}/flights`;

      const response = await fetch(url);
      const data = await response.json();

      if (!data.success) {
        console.error('API error:', data.error);
        return;
      }

      // Update timestamp for next fetch
      this.lastTimestamp = data.timestamp;

      // Process flights
      const currentFlightIds = new Set();

      for (const flight of data.flights) {
        currentFlightIds.add(flight.id);
        this.updateFlight(flight);
      }

      // On first load (no since param), remove any flights not in current data
      if (!url.includes('since=')) {
        this.removeStaleFlights(currentFlightIds);
      }

      // Update stats display
      document.getElementById('flightCount').textContent = this.entities.size;
      document.getElementById('lastUpdate').textContent =
        new Date().toLocaleTimeString();

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

    if (this.entities.has(flight.id)) {
      // Update existing entity
      const entity = this.entities.get(flight.id);
      entity.position = position;
      entity.point.color = this.getAltitudeColor(flight.altitude, flight.onGround);
      entity.properties = flight;

      // Update label
      if (entity.label) {
        entity.label.text = flight.callsign;
        entity.label.show = this.showLabels;
      }
    } else {
      // Create new entity
      const entity = this.viewer.entities.add({
        id: flight.id,
        position: position,
        point: {
          pixelSize: this.config.aircraft.pointSize,
          color: this.getAltitudeColor(flight.altitude, flight.onGround),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        label: {
          text: flight.callsign,
          font: '12px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -12),
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
      // Create new polyline entity
      const entity = this.viewer.entities.add({
        id: `trail-${flightId}`,
        polyline: {
          positions: positions,
          width: this.config.aircraft.trail.width,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.2,
            color: Cesium.Color.CYAN.withAlpha(this.config.aircraft.trail.opacity)
          }),
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

    detailsDiv.innerHTML = `
      <div><span class="detail-label">Callsign:</span> ${flight.callsign || 'N/A'}</div>
      <div><span class="detail-label">ICAO ID:</span> ${flight.id || 'N/A'}</div>
      <div><span class="detail-label">Altitude:</span> ${flight.altitude ? flight.altitude.toLocaleString() + ' ft' : 'N/A'}</div>
      <div><span class="detail-label">Speed:</span> ${flight.speed ? flight.speed + ' kts' : 'N/A'}</div>
      <div><span class="detail-label">Heading:</span> ${flight.heading ? Math.round(flight.heading) + '°' : 'N/A'}</div>
      <div><span class="detail-label">V/S:</span> ${flight.verticalRate ? flight.verticalRate + ' ft/min' : 'N/A'}</div>
      <div><span class="detail-label">Squawk:</span> ${flight.squawk || 'N/A'}</div>
      <div><span class="detail-label">On Ground:</span> ${flight.onGround ? 'Yes' : 'No'}</div>
    `;
  }
}

// Initialize tracker when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.flightTracker = new FlightTracker(ClientConfig);
});
