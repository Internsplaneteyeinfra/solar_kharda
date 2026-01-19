# Solar Farm Dashboard

A web-based dashboard for monitoring solar farm panels with real-time data visualization using Google Earth Engine (GEE) and Sentinel images.

## Features

- **Interactive Map**: View 1955 solar panel polygons on an interactive map
- **Multiple Parameters**: Select from LST (Land Surface Temperature), SWIR (Shortwave Infrared), or Soiling Index
- **Historical Data**: Click on any panel to view historical time-series data
- **Date Range Selection**: Customize the time range for data analysis
- **Real-time Visualization**: Charts and statistics update based on selected parameters

## Project Structure

```
Kharda/
├── asset/
│   └── solar_panel_polygons.geojson    # Panel polygon data
├── backend/
│   ├── main.py                          # FastAPI backend
│   ├── requirements.txt                 # Python dependencies
│   ├── .env                             # Environment variables (GEE credentials)
│   └── credentials.json                 # GEE service account credentials
└── frontend/
    ├── src/
    │   ├── App.jsx                       # Main React component
    │   ├── components/
    │   │   ├── ControlPanel.jsx         # Left sidebar controls
    │   │   └── DataPanel.jsx            # Right panel for data display
    │   └── ...
    ├── package.json
    └── vite.config.js
```

## One-File Guide: Where Things Live

Use this section as your single reference to find any major part of the project.

### Top Level

- `asset/`
  - `solar_panel_polygons.geojson` – geometry and metadata for all panels (panel_id and properties).
  - `India_GHI_poster-map_1000x1000mm-300dpi_v20191017.tif` – static global horizontal irradiance reference map.
- `backend/`
  - All Python code and APIs for Kharda and Solar Suitability.
- `frontend/`
  - All React code, UI, and client-side logic.

---

## Backend Map (FastAPI + GEE + Database)

Entry points and application wiring:

- `backend/main.py`
  - CLI entry to run the backend (`python main.py`).
  - Creates the ASGI app by importing `app.main:app`.
- `backend/app/main.py`
  - Creates the FastAPI `app`.
  - Adds CORS middleware.
  - Calls `init_gee()` to initialise Google Earth Engine.
  - Tries to initialise the SQLite database on startup.
  - Includes routers:
    - `app.kharda.routes` – Kharda panel API.
    - `app.solar.routes` – Solar suitability analysis API.

### Backend – Common GEE Utilities

- `backend/app/common/gee.py`
  - Reads GEE credentials from `backend/credentials.json` or environment.
  - Initialises the Earth Engine client (`init_gee()`).
  - Central place to adjust GEE authentication behaviour.

### Backend – Kharda API (Panel Data)

- `backend/app/kharda/routes.py`
  - Defines the Kharda-specific API routes:
    - `GET /polygons`
      - Returns `asset/solar_panel_polygons.geojson`.
      - Used by frontend to draw panel boundaries and find panel IDs.
    - `POST /api/panel-data`
      - Request body: `panel_id`, `parameter`, `start_date`, `end_date`.
      - Parameters supported via `PANEL_PARAMETER_CONFIG`:
        - `LST`, `SWIR`, `SOILING`, `NDVI`, `NDWI`, `VISIBLE`.
      - Flow for most parameters:
        - Uses database time series (`get_timeseries_data`) to compute:
          - `current_value`
          - `unit`
          - basic statistics (mean, min, max).
      - Flow for `SOILING`:
        - Loads the geometry for `panel_id` from `solar_panel_polygons.geojson`.
        - Calls `calculate_soiling_data` (GEE-based, from `services.py`) with geometry and date range.
        - Returns:
          - `baseline_si`
          - `current_si`
          - `soiling_drop_percent`
          - `status` (e.g. `clean`, `needs_cleaning`)
          - `unit` (`%`).
      - Handles missing data by returning safe defaults when GEE or DB fails.
    - `GET /api/database/stats`
      - Returns basic statistics about what is stored in the SQLite database.
  - Also handles:
    - Path configuration for asset files.
    - Basic logging for requests and errors.

- `backend/app/kharda/services.py`
  - All Google Earth Engine computations for Kharda panel parameters.
  - Key async functions (all receive a geometry and `start_date`, `end_date`):
    - `get_lst_data(geometry, start_date, end_date)`
      - Uses Landsat 8 collection.
      - Computes land surface temperature in °C and returns a time series.
    - `get_swir_data(geometry, start_date, end_date)`
      - Uses Sentinel-2.
      - Computes a SWIR-based reflectance value and returns a time series.
    - `get_ndvi_data(geometry, start_date, end_date)`
      - Uses Sentinel-2.
      - Computes NDVI, returns time series of vegetation index values.
    - `get_ndwi_data(geometry, start_date, end_date)`
      - Uses Sentinel-2.
      - Computes NDWI, returns time series related to surface water.
    - `get_visible_mean_data(geometry, start_date, end_date)`
      - Uses Sentinel-2.
      - Computes mean visible brightness (bands B2, B3, B4).
    - `get_lst_monthly(start_date, end_date)`
      - Uses MODIS.
      - Produces a simplified monthly LST series for the general farm area.
    - `get_soiling_data(geometry, start_date, end_date)`
      - Uses Sentinel-2.
      - Computes a soiling index `(B2 + B4) / (B8 + 0.0001)`.
      - Derives:
        - `baseline_si` = max observed value in the period.
        - `current_si` = latest observed value.
        - `soiling_drop_percent` = drop from baseline in percent.
        - `status` = `'clean'` or `'needs_cleaning'`.
      - Emits helpful logs about how many valid data points were found.

- `backend/app/kharda/database.py`
  - Owns the SQLite setup and data access.
  - Functions:
    - `init_database()`
      - Creates tables if they do not exist:
        - `panel_timeseries` – generic time-series per panel and parameter.
        - `panel_soiling` – historical soiling metrics per panel and date.
    - `get_db()`
      - Context manager that yields a database connection.
    - `get_timeseries_data(panel_id, parameter, start_date, end_date)`
      - Returns the stored time series for a given panel and parameter.
    - `get_data_statistics()`
      - Summary counts per parameter, panel, and date range.
    - `get_soiling_data(panel_id, date)`
      - Direct DB access for soiling rows (used by scripts/tools).

- `backend/app/kharda/query_db.py`
  - Interactive CLI to query the SQLite database.
  - Useful to inspect what time series and soiling rows are present.

### Backend – Solar Suitability Analysis

- `backend/app/solar/routes.py`
  - Defines the Solar Suitability analysis API:
    - `POST /api/analyze`
      - Accepts a geometry payload.
      - Calls `process_analysis` to compute suitability metrics.
    - `POST /api/analyze/kml`
      - Accepts an uploaded KML file.
      - Uses `parse_kml_content` to extract a geometry.
      - Calls `process_analysis` with that geometry.
    - `POST /api/analyze/batch`
      - Accepts an array of geometries.
      - Runs `process_analysis` for each geometry.

- `backend/app/solar/analysis.py`
  - Core orchestration for Solar Suitability.
  - Calls:
    - GEE dataset helpers from `datasets.py`.
    - Scoring logic from `scoring.py`.
    - Constants from `constants.py`.
  - Produces a combined result object used by the Solar Suitability UI.

- `backend/app/solar/datasets.py`
  - Wraps GEE calls for solar-suitability inputs such as:
    - terrain and slope,
    - solar irradiance,
    - land cover,
    - distance layers.

- `backend/app/solar/scoring.py`
  - Converts raw environmental metrics into scores.
  - Implements the weighting and aggregation that yields a final suitability score.

- `backend/app/solar/schemas.py`
  - Pydantic models for:
    - `AnalysisRequest`
    - `BatchAnalysisRequest`
    - Other request/response objects.

- `backend/app/solar/constants.py`
  - Weights, thresholds, and configuration values used by the scoring logic.

### Backend – Shared Services and Utilities

- `backend/app/services/distance.py`
  - Helper functions for distance-based calculations:
    - Distances to roads, transmission lines, or other infrastructure.

- `backend/app/utils/geo_helpers.py`
  - General-purpose geometry utilities:
    - Validating and normalising GeoJSON-like geometries.
    - Conversions between coordinate formats.

- `backend/app/utils/kml_parser.py`
  - Parses KML content into internal geometry structures.
  - Used by the `/api/analyze/kml` endpoint to accept user-uploaded KML files.

- `backend/migrate_historical_data.py`
  - One-off script to populate `solar_farm_data.db` from historical sources.
  - Fills `panel_timeseries` and `panel_soiling` tables.

---

## Frontend Map (React Application)
  
Top-level entry files:

- `frontend/src/main.jsx`
  - Vite/React entry point.
  - Renders the main `App` component.
- `frontend/src/App.jsx`
  - Main application component.
  - Sets up:
    - Map view, polygons, and click handling.
    - Panel selection and history panes.
    - Parameter selection (`LST`, `SWIR`, `SOILING`, `NDVI`, `NDWI`, `VISIBLE`).
    - Date range selection for panel analysis.
    - Integration with:
      - `services/panels.js` for per-panel metrics.
      - `services/parameterSnapshots.js` for parameter snapshots.
    - Layout of:
      - `ControlPanel` (left side).
      - `DataPanel` (right side).
      - `ComparePanel`, `FilterPanel`, `WeatherBanner`.

### Frontend – Shared Services

- `frontend/src/services/panels.js`
  - Core service for fetching data per panel.
  - `getPanelById(panelId, options)`
    - Normalises the panel ID and finds its polygon from `polygons`.
    - Computes a centroid for display.
    - Sends `POST` requests to `${apiBase}/api/panel-data` for each parameter.
    - Returns an object containing:
      - `id`, `name`, `location`, `metadata`, `properties`.
      - `metrics` keyed by parameter (`LST`, `SWIR`, `SOILING`, etc.).

- `frontend/src/services/parameterSnapshots.js`
  - Fetches parameter-level snapshots for ranges (for the filter panel).
  - Talks to backend snapshot endpoints where available.

### Frontend – Core Dashboard Components

All paths below are under `frontend/src/components/`.

- `ControlPanel.jsx`
  - Left-side panel for:
    - Parameter selection.
    - Date range selection.
    - Filter and compare toggles.
- `DataPanel.jsx`
  - Right-side panel that shows detailed data for the selected panel.
  - Renders:
    - Current metric values.
    - Charts/time series (where available).
    - Special layout for `SOILING`:
      - Shows baseline, current, drop %, and status badge.
- `FilterPanel.jsx`
  - UI for filtering panels based on parameter snapshots.
  - Uses `fetchParameterSnapshot` from `parameterSnapshots.js`.
- `ComparePanel.jsx`
  - Allows selecting two panels (A and B).
  - Fetches data for both via `/api/panel-data` and compares them.
- `WeatherBanner.jsx`
  - Displays current weather or summary info at the top of the map.

### Frontend – Solar Suitability Feature

- `SolarAnalyzer.jsx`
  - Wrapper component for the Solar Suitability workflow.
  - Manages the UI flow to:
    - Draw or upload areas.
    - Trigger backend analysis.
    - Display the result.

- `SolarSuitability.jsx`
  - Main component for interactive Solar Suitability analysis.
  - Key responsibilities:
    - Lets user draw/select an area on the map.
    - Calls backend endpoints:
      - `POST http://localhost:8000/api/analyze` for single geometry.
      - `POST http://localhost:8000/api/analyze/batch` for multiple geometries.
    - Receives raw analysis data from the backend.
    - Calculates a final score (0–10) in `calculateFinalScore(rawData)`.
    - Updates the UI labels:
      - “Highly Suitable” or “Not Suitable”.
    - Integrates subcomponents from `components/solarSuitability/`:
      - `Header.jsx`, `MapOptionsCard.jsx`, `UploadCard.jsx`,
      - `ResultsSection.jsx`, `FilterPanel.jsx`, `DataPanel.jsx`.

- `components/solarSuitability/*`
  - `Header.jsx` – Title and main controls.
  - `MapOptionsCard.jsx` – Map layer toggles and drawing tools.
  - `UploadCard.jsx` – UI for uploading KML files.
  - `ResultsSection.jsx` – Shows detailed suitability metrics and explanation.
  - `FilterPanel.jsx` – Filters for Solar Suitability view.
  - `DataPanel.jsx` – Detailed metrics for each analysed sub-area.
  - `solarSuitability.css` – Styling for the full flow.

### Frontend – Miscellaneous UI Components

- `ThreeCards.jsx` / `ThreeCards.css`
  - Landing-style cards for high-level navigation or summaries.
- `Header.jsx` / `Header.css`
  - Top navigation header.
- `UploadCard.jsx` / `UploadCard.css`
  - Generic upload UI component.
- `Login.jsx` / `Login.css`
  - Login form component.
- `MapOptionsCard.jsx`, `ResultsSection.jsx`, `WeatherBanner.jsx`
  - Reusable UI blocks used across modes.

### Frontend – Styles and Assets

- `frontend/src/styles/global.css`
  - Global style resets and base theme.
- `frontend/src/styles/App.css` and `frontend/src/App.css`
  - Layout and component styles for the main dashboard.
- `frontend/src/assets/images/*`
  - Static images for banners and background.
- `frontend/src/assets/videos/*`
  - Static video assets.

---

With this file you can:

- Start at this README.
- Decide whether you need:
  - Backend (API/GEE/DB) logic, or
  - Frontend (React/UI) logic.
- Jump directly to the correct file and function based on the descriptions above.

## Setup Instructions

### Prerequisites

- Python 3.8 or higher
- Node.js 16 or higher
- npm or yarn
- Google Earth Engine account with service account credentials

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment (recommended):
   ```bash
   python -m venv venv
   
   # On Windows:
   venv\Scripts\activate
   
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Set up GEE credentials:
   - Copy your `.env` file to the `backend` directory with your GEE credentials:
     ```
     GEE_CLIENT_EMAIL="your-service-account@project.iam.gserviceaccount.com"
     GEE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
     ```
   - Alternatively, place your `credentials.json` file in the `backend` directory

5. Run the backend server:
   ```bash
   python main.py
   ```
   
   Or using uvicorn directly:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

   The API will be available at `http://localhost:8000`

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

   The frontend will be available at `http://localhost:3000`

## Usage

1. **Select Parameter**: Choose from LST, SWIR, or Soiling Index from the left panel
2. **Set Date Range**: Select start and end dates for the analysis period
3. **Click Panel**: Click on any panel on the map to view its data
4. **View Data**: The right panel will display:
   - Current value (for LST and SWIR)
   - Historical time-series chart
   - Status information (for Soiling Index)

## API Endpoints

### GET `/polygons`
Returns the GeoJSON file with all panel polygons

### POST `/api/panel-data`
Get historical data for a specific panel

**Request Body:**
```json
{
  "panel_id": 0,
  "parameter": "LST",
  "start_date": "2024-01-01",
  "end_date": "2024-12-31"
}
```

**Response:**
```json
{
  "parameter": "LST",
  "current_value": 45.2,
  "unit": "°C",
  "timeseries": [
    {
      "date": "2024-01-01",
      "value": 42.5,
      "unit": "°C"
    }
  ]
}
```

## Parameters

### LST (Land Surface Temperature)
- **Dataset**: MODIS Terra MOD11A2
- **Resolution**: 1km
- **Unit**: °C
- **Time Range**: Historical data from 2020 to present

### SWIR (Shortwave Infrared)
- **Dataset**: Sentinel-2 Surface Reflectance
- **Resolution**: 10m
- **Unit**: Reflectance
- **Cloud Filter**: < 20% cloud coverage

### Soiling Index
- **Dataset**: Sentinel-2 Surface Reflectance Harmonized
- **Resolution**: 10m
- **Calculation**: (B2 + B4) / (B8 + 0.0001)
- **Status**: Clean or Needs Cleaning (>15% drop)

## Troubleshooting

### Backend Issues

- **GEE Initialization Error**: Ensure your credentials are correctly set in `.env` or `credentials.json`
- **Polygon File Not Found**: Make sure `solar_panel_polygons.geojson` is in the `asset` directory
- **Port Already in Use**: Change the port in `main.py` or use `--port` flag with uvicorn

### Frontend Issues

- **Map Not Loading**: Check that Leaflet CSS is loaded (should be automatic)
- **API Connection Error**: Verify backend is running on port 8000
- **CORS Errors**: Check backend CORS settings in `main.py`

## Development

To modify the application:

- **Backend**: Edit `backend/main.py` for API endpoints and GEE processing logic
- **Frontend**: Edit React components in `frontend/src/`
- **Styling**: Modify CSS files in `frontend/src/`

## License

This project is for internal use only.

author- prachi kasar

