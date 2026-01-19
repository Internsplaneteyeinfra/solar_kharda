# Kharda Backend (FastAPI) – Unified Kharda + Solar

## Overview

- **Project name:** Kharda
- **Backend:** Single FastAPI application under `backend/`
- **Frontends:** One or more React apps in separate folders (not touched here)
- **Earth Engine:** Google Earth Engine (GEE) is used for all remote sensing and solar suitability analysis
- **Datastore:** SQLite database `backend/solar_farm_data.db` for historical panel data

This backend now **unifies**:
- The original **Kharda** API (weather, panel statistics, database access)
- The converted **Solar** suitability API (originally Node.js, then converted to FastAPI)

There is **only one FastAPI app** and **one GEE initialization point**.

---

## Folder Structure (Backend)

From the repository root:

```text
backend/
  main.py
  requirements.txt
  solar_farm_data.db
  start.bat
  start.sh
  app/
    __init__.py
    main.py              (FastAPI application factory)
    common/
      __init__.py
      gee.py             (Centralized GEE initialization)
    kharda/
      __init__.py
      routes.py          (Kharda API endpoints)
      database.py        (Database models and operations)
      query_db.py        (Database query utility)
      services.py        (GEE data fetching services)
    services/
      distance.py        (Business logic for distance calculations)
    solar/
      __init__.py
      routes.py          (Solar suitability endpoints)
      analysis.py        (Core analysis workflow)
      scoring.py         (Suitability scoring logic)
      datasets.py        (GEE dataset operations)
      constants.py       (Configuration constants)
      schemas.py         (Pydantic models)
      seismic_zones.json (Seismic data)
    utils/
      geo_helpers.py     (Generic geometry utilities)
      kml_parser.py      (KML parsing utilities)
  migrate_historical_data.py
  DATABASE_README.md
  QUICK_START_DATABASE.md
  ACCESS_DATABASE.md
```

### Key Components

- **`backend/main.py`**
  - Entry point for running the server.
  - Usage: `python main.py` or `uvicorn app.main:app`.

- **`backend/app/main.py`**
  - Defines the FastAPI application (`app`).
  - Configures CORS, initializes GEE, and includes routers.

- **`backend/app/common/gee.py`**
  - **Only** Earth Engine initializer for the running backend.
  - Reads GEE credentials from `backend/credentials.json` or environment variables.

- **`backend/app/kharda/`**
  - Contains Kharda-specific API logic.
  - `routes.py`: Weather endpoints, polygon retrieval, database stats.
  - `services.py`: Functions to fetch data from GEE (LST, SWIR, etc.).
  - `database.py`: SQLite schema and CRUD operations.

- **`backend/app/solar/`**
  - Contains Solar suitability logic.
  - `routes.py`: Endpoints for solar suitability analysis (`/api/analyze`, `/api/analyze/kml`).
  - `analysis.py`: Orchestrates analysis using GEE, Overpass, and seismic data.

- **`backend/app/services/` & `backend/app/utils/`**
  - `services/distance.py`: Specific distance calculation logic (e.g., to roads/power lines).
  - `utils/geo_helpers.py`: Generic geometry helper functions.
  - `utils/kml_parser.py`: Robust KML parsing and geometry extraction.

### Database

The SQLite database (`solar_farm_data.db`) stores historical panel data.
- Use `python migrate_historical_data.py` to populate it.
- Use `python -m app.kharda.query_db` to interactively query it.

## Running the Backend

1.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

2.  **Start the Server:**
    ```bash
    python main.py
    ```
    Or manually:
    ```bash
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    ```

3.  **API Documentation:**
    - Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
    - ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)
