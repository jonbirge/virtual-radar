# US Flight Tracker

Real-time visualization of active flights in the United States using Cesium and live flight data.

## Features

- Real-time flight tracking with live position updates
- 3D globe visualization using Cesium
- Aircraft trails showing last 256 positions
- Color-coded altitude display
- Configurable polling interval
- REST API for flight data access
- File-based SQLite database (no external database required)
- Docker support for easy deployment

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (Browser)                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    Cesium Viewer                         │ │
│  │  - 3D Globe visualization                               │ │
│  │  - Aircraft entities with trails                        │ │
│  │  - Configurable polling (default: 5s)                   │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP/REST
┌──────────────────────────┴──────────────────────────────────┐
│                      Node.js Backend                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  REST API   │  │  Data       │  │  SQLite Database    │  │
│  │  /api/*     │  │  Fetcher    │  │  (file-based)       │  │
│  └─────────────┘  └──────┬──────┘  └─────────────────────┘  │
└──────────────────────────┼──────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────┴──────────────────────────────────┐
│              OpenSky Network API (or FAA SWIM)              │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Using Docker (Recommended)

```bash
# Production mode (uses live flight data)
docker-compose up --build

# Development mode (uses mock data)
docker-compose -f docker-compose.dev.yml up --build
```

Open http://localhost:3000 in your browser.

### Manual Installation

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or with mock data for testing
USE_MOCK_DATA=true npm start
```

### Development Container

Open the project in VS Code with the Dev Containers extension installed:
1. Press F1 and select "Dev Containers: Reopen in Container"
2. The container will build and start automatically

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `DB_PATH` | ./data/flights.db | SQLite database path |
| `DATA_SOURCE` | opensky | Data source: `opensky` or `faa` |
| `FETCH_INTERVAL` | 10 | Seconds between data fetches |
| `USE_MOCK_DATA` | false | Use mock data instead of live API |
| `OPENSKY_USERNAME` | - | OpenSky credentials (optional, increases rate limits) |
| `OPENSKY_PASSWORD` | - | OpenSky credentials (optional) |

### Client Configuration

Edit `src/client/config.js` or use URL parameters:

```javascript
// Poll interval (milliseconds)
ClientConfig.pollInterval = 5000;

// Maximum trail points per aircraft
ClientConfig.maxTrailPoints = 256;

// Cesium Ion access token (optional)
ClientConfig.cesiumAccessToken = 'your-token';
```

URL parameters:
- `?poll=3000` - Set poll interval to 3 seconds
- `?cesiumToken=xxx` - Set Cesium Ion token

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/flights` | GET | Get all active flights |
| `/api/flights?since=timestamp` | GET | Get flights updated since timestamp |
| `/api/flights/:id` | GET | Get specific flight |
| `/api/flights/:id/trail` | GET | Get trail history for flight |
| `/api/trails` | GET | Get all trails for active flights |
| `/api/stats` | GET | Get database statistics |
| `/api/config` | GET | Get client configuration |
| `/health` | GET | Health check |

### Example Response

```json
{
  "success": true,
  "timestamp": 1699999999999,
  "count": 2500,
  "flights": [
    {
      "id": "abc123",
      "callsign": "UAL123",
      "latitude": 37.5,
      "longitude": -122.5,
      "altitude": 35000,
      "heading": 90,
      "speed": 450,
      "verticalRate": 0,
      "onGround": false,
      "squawk": "1200",
      "timestamp": 1699999999000,
      "source": "opensky"
    }
  ]
}
```

## Testing

### Unit Tests

```bash
npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Test Harnesses

```bash
# Test FAA data fetcher
npm run fetch:test

# Test with mock data only
npm run fetch:test -- --mock

# Test REST API (requires running server)
npm start &
npm run api:test
```

## Data Sources

### OpenSky Network (Default)

Free tier API providing real aircraft data. Rate limits apply:
- Anonymous: 10 requests/minute
- Authenticated: 60 requests/minute

Register at https://opensky-network.org for higher rate limits.

### FAA SWIM (Placeholder)

The code includes placeholder support for FAA's System Wide Information Management (SWIM) data feeds. SWIM requires:
- FAA subscription
- Valid API credentials
- Appropriate data authorization

Set `DATA_SOURCE=faa` and configure `FAA_ENDPOINT` and `FAA_API_KEY` environment variables.

## Altitude Color Coding

| Color | Altitude Range |
|-------|---------------|
| Gray | On ground |
| Green | < 10,000 ft |
| Yellow | 10,000 - 25,000 ft |
| Orange | 25,000 - 35,000 ft |
| Red | > 35,000 ft |

## License

MIT
