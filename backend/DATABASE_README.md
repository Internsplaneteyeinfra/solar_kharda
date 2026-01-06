# SQLite Database for Historical Data

This document explains how to use SQLite to store and retrieve 5 years of historical solar panel data.

## Overview

The application uses SQLite to store historical data fetched from Google Earth Engine. This provides:
- **Faster response times** - Data is retrieved from local database instead of fetching from GEE
- **Reduced API calls** - Historical data is cached locally
- **Offline capability** - Once migrated, data can be accessed without GEE connection
- **Cost savings** - Reduces GEE API usage

## Database Schema

The database consists of 4 main tables:

### 1. `panel_timeseries`
Stores time series data for parameters: LST, SWIR, NDVI, NDWI, VISIBLE

```sql
CREATE TABLE panel_timeseries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    panel_id INTEGER NOT NULL,
    parameter TEXT NOT NULL,
    date TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(panel_id, parameter, date)
)
```

### 2. `panel_soiling`
Stores soiling index data (special structure)

```sql
CREATE TABLE panel_soiling (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    panel_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    baseline_si REAL,
    current_si REAL,
    soiling_drop_percent REAL,
    unit TEXT DEFAULT '%',
    status TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(panel_id, date)
)
```

### 3. `monthly_lst`
Stores monthly aggregated LST data

```sql
CREATE TABLE monthly_lst (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL UNIQUE,
    value REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
```

### 4. `data_availability`
Tracks which data is available for each panel/parameter

```sql
CREATE TABLE data_availability (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    panel_id INTEGER NOT NULL,
    parameter TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    record_count INTEGER DEFAULT 0,
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(panel_id, parameter)
)
```

## Migration Process

### Step 1: Run the Migration Script

To fetch and store 5 years of historical data:

```bash
cd backend
python migrate_historical_data.py --years 5
```

**Options:**
- `--years N`: Number of years to fetch (default: 5)
- `--sample N`: Only migrate N panels (useful for testing)
- `--monthly-only`: Only migrate monthly LST data (faster)

**Example for testing:**
```bash
# Test with 10 panels first
python migrate_historical_data.py --years 1 --sample 10
```

### Step 2: Monitor Progress

The migration script will:
1. Initialize the database schema
2. Fetch data from Google Earth Engine
3. Store it in SQLite
4. Show progress and statistics

**Note:** The migration can take several hours for all panels and 5 years of data. The script processes panels in batches to avoid overwhelming the GEE API.

### Step 3: Verify Data

Check database statistics:
```bash
# Via API
curl http://localhost:8000/api/database/stats

# Or using Python
python -c "from database import get_data_statistics; import json; print(json.dumps(get_data_statistics(), indent=2))"
```

## How the API Uses the Database

The API automatically checks the database first before fetching from GEE:

1. **Request comes in** → API checks if data exists in database
2. **If found** → Returns data from database (fast)
3. **If not found** → Falls back to GEE (slower, but ensures data availability)

The response includes a `source` field indicating where data came from:
- `"source": "database"` - Data from SQLite
- `"source": "gee"` - Data from Google Earth Engine

## Database Location

The SQLite database file is stored at:
```
backend/solar_farm_data.db
```

This file can be:
- **Backed up** - Simply copy the `.db` file
- **Moved** - Transfer to another server
- **Shared** - Multiple instances can use the same database (read-only)

## SQLite for Hosting

### Is SQLite Suitable for Production?

**Pros:**
- ✅ Zero configuration - No database server needed
- ✅ Fast for read-heavy workloads
- ✅ Perfect for single-server deployments
- ✅ Easy backups (just copy the file)
- ✅ Low resource usage

**Cons:**
- ❌ Not ideal for high-concurrency writes
- ❌ Limited to single server (no distributed access)
- ❌ No built-in replication
- ❌ File size limits (though rarely an issue)

### Recommendations

**Use SQLite if:**
- Single server deployment
- Read-heavy workload (most queries are reads)
- Small to medium dataset (< 100GB)
- Simple deployment requirements

**Consider PostgreSQL/MySQL if:**
- Multiple servers need database access
- High write concurrency
- Need advanced features (replication, sharding)
- Large team with database administrators

### For This Project

SQLite is **perfectly suitable** for this solar farm dashboard because:
1. **Read-heavy** - Most operations are reading historical data
2. **Single server** - Backend runs on one server
3. **Moderate size** - 5 years of data for ~2000 panels is manageable
4. **Simple deployment** - No need for separate database server

## Maintenance

### Backup Database
```bash
# Simple backup
cp backend/solar_farm_data.db backend/solar_farm_data.db.backup

# Or use SQLite backup command
sqlite3 backend/solar_farm_data.db ".backup 'backend/solar_farm_data.db.backup'"
```

### Check Database Size
```bash
ls -lh backend/solar_farm_data.db
```

### Vacuum Database (reclaim space)
```bash
sqlite3 backend/solar_farm_data.db "VACUUM;"
```

### Query Database Directly
```bash
sqlite3 backend/solar_farm_data.db

# Example queries
SELECT COUNT(*) FROM panel_timeseries;
SELECT parameter, COUNT(*) FROM panel_timeseries GROUP BY parameter;
SELECT MIN(date), MAX(date) FROM panel_timeseries;
```

## Troubleshooting

### Database locked errors
- Only one process should write to SQLite at a time
- The migration script handles this automatically
- If issues occur, ensure only one migration is running

### Out of disk space
- SQLite databases can grow large
- Monitor disk space during migration
- Consider migrating in batches if needed

### Slow queries
- Ensure indexes are created (they are created automatically)
- Use `EXPLAIN QUERY PLAN` to analyze queries
- Consider vacuuming if database is fragmented

## Next Steps

1. **Run initial migration** with a small sample to test
2. **Monitor the process** to ensure it's working correctly
3. **Run full migration** for all panels and 5 years
4. **Verify API responses** are using database when available
5. **Set up regular backups** of the database file

## Example Usage

```python
from database import (
    get_timeseries_data, 
    get_soiling_data,
    get_data_statistics
)

# Get LST data for panel 1
lst_data = get_timeseries_data(
    panel_id=1,
    parameter='LST',
    start_date='2020-01-01',
    end_date='2024-12-31'
)

# Get database statistics
stats = get_data_statistics()
print(f"Total records: {sum(stats['timeseries_counts'].values())}")
```




