# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

US Flight Tracker - Real-time visualization of active flights using Cesium 3D globe with data from OpenSky Network API. The client fetches flight data directly from OpenSky, filtering to the current camera view bounds.

## Commands

### Development
```bash
npm run dev                  # Start server with auto-reload (watch mode)
npm start                    # Start server (production mode)
```

### Testing
```bash
npm test                     # Run unit tests with Jest
npm run test:watch          # Watch mode for tests
npm run test:coverage       # Run tests with coverage report
npm run fetch:test          # Test FAA/OpenSky fetcher
npm run fetch:test -- --mock  # Test with mock data only
npm run api:test            # Test REST API (requires running server)
```

### Docker
```bash
docker-compose up --build                              # Production build
docker-compose -f docker-compose.dev.yml up --build   # Dev with live reload
```

## Architecture

```
CLIENT (Browser)                    OPENSKY NETWORK API
├── Cesium Viewer (3D globe)
├── Direct OpenSky fetch       ---> https://opensky-network.org/api
├── Flight entity management
├── Trail visualization
└── Interactive selection

SERVER (Node.js/Express) - Static file serving only
├── Serves client files
└── Health check endpoint
```

**Data Flow:**
1. Client computes current camera view bounding box
2. Client fetches flights directly from OpenSky API (every 15 seconds by default)
3. Normalizes OpenSky state vectors to flight objects
4. Updates Cesium entities and trail polylines
5. Removes flights no longer in view or reported

## Key Source Files

- `src/client/flight-tracker.js` - Main application: Cesium viewer, OpenSky fetching, flight visualization
- `src/client/config.js` - Client config (poll interval, OpenSky settings, altitude colors)
- `src/server/index.js` - Express server for static file serving

## Client Configuration

Key settings in `src/client/config.js`:
- `pollInterval` (default: 15000ms / 15 seconds)
- `opensky.baseUrl` - OpenSky Network API endpoint
- `opensky.defaultBounds` - Fallback bounding box when camera bounds unavailable
- `cesiumAccessToken` - Optional Cesium Ion token for terrain/imagery

## Environment Variables

Server-side:
- `PORT` (default: 3000)
- `CESIUM_ACCESS_TOKEN` (optional, passed to client via /api/config)
- `ENABLE_SERVER_FETCH` (default: false) - Set to `true` to enable server-side data fetching/caching

## Testing

Tests are in `tests/` directory:
- `tests/unit/` - Unit tests for database and fetcher modules
- `tests/integration/` - API integration tests
- `tests/harness/` - CLI test harnesses

Mock data mode (`USE_MOCK_DATA=true`) generates 150 random flights for development without API calls.
