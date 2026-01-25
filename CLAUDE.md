# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

US Flight Tracker - Real-time visualization of active US flights using Cesium 3D globe with data from OpenSky Network API. Full-stack application with Node.js/Express backend and Cesium.js frontend.

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
CLIENT (Browser)                    SERVER (Node.js/Express)
├── Cesium Viewer (3D globe)        ├── REST API (/api/*)
├── Flight entity management   <--> ├── Data fetcher (OpenSky/FAA)
├── Trail visualization             ├── Scheduled updates (node-cron)
└── Interactive selection           └── SQLite database (better-sqlite3)
```

**Data Flow:**
1. Server fetches from OpenSky every N seconds (configurable via `FETCH_INTERVAL`)
2. Normalizes and upserts into SQLite database
3. Prunes stale flights (5-minute threshold)
4. Client polls `/api/flights` for updates
5. Updates Cesium entities and trail polylines

## Key Source Files

- `src/server/index.js` - Main entry point, Express setup, cron scheduling
- `src/server/api.js` - REST API routes
- `src/server/database.js` - SQLite management, schema, queries
- `src/server/faa-fetcher.js` - Data source adapters (OpenSky, mock)
- `src/server/config.js` - Server configuration from environment
- `src/client/flight-tracker.js` - Cesium visualization logic
- `src/client/config.js` - Client config (polling interval, altitude colors)

## API Endpoints

- `GET /api/flights` - All active flights (supports `?since=timestamp`)
- `GET /api/flights/:id` - Specific flight
- `GET /api/flights/:id/trail` - Trail history for flight
- `GET /api/trails` - All trails (supports `?limit=N`)
- `GET /api/stats` - Database statistics
- `GET /api/config` - Server configuration for client
- `GET /health` - Health check

## Environment Variables

Key variables in `src/server/config.js`:
- `PORT` (default: 3000)
- `DB_PATH` (default: ./data/flights.db)
- `FETCH_INTERVAL` (default: 10 seconds)
- `USE_MOCK_DATA` (default: false) - Use mock fetcher for testing
- `OPENSKY_USERNAME` / `OPENSKY_PASSWORD` (optional, for higher rate limits)
- `CESIUM_ACCESS_TOKEN` (optional, for Cesium Ion terrain/imagery)

## Database

SQLite with WAL mode. Two tables:
- `flights` - Current flight state (id, callsign, lat/lon, altitude, velocity, heading, etc.)
- `flight_trails` - Historical position points per aircraft (max 256 per flight)

## Testing

Tests are in `tests/` directory:
- `tests/unit/` - Unit tests for database and fetcher modules
- `tests/integration/` - API integration tests
- `tests/harness/` - CLI test harnesses

Mock data mode (`USE_MOCK_DATA=true`) generates 150 random flights for development without API calls.
