# Quick Start: SQLite Database Setup

## Summary

I've set up SQLite database support for storing 5 years of historical data. Here's what was created:

### Files Created:
1. **`database.py`** - Database schema, connection, and query functions
2. **`migrate_historical_data.py`** - Script to fetch and store historical data
3. **`DATABASE_README.md`** - Complete documentation

### Files Modified:
1. **`main.py`** - Updated to use database when available, falls back to GEE

## Quick Start

### 1. Initialize Database (automatic on startup)
The database is automatically initialized when the API starts. The database file will be created at:
```
backend/solar_farm_data.db
```

### 2. Migrate Historical Data

**Test with a small sample first:**
```bash
cd backend
python migrate_historical_data.py --years 1 --sample 10
```

**Migrate all data (5 years):**
```bash
python migrate_historical_data.py --years 5
```

**Note:** Full migration can take several hours. The script processes in batches to avoid API rate limits.

### 3. Verify It's Working

Check database statistics:
```bash
# Start the API
python main.py

# In another terminal, check stats
curl http://localhost:8000/api/database/stats
```

## How It Works

1. **API checks database first** - If data exists, returns it immediately
2. **Falls back to GEE** - If not in database, fetches from Google Earth Engine
3. **Response includes source** - Check `"source": "database"` or `"source": "gee"` in API responses

## Database Tables

- **`panel_timeseries`** - LST, SWIR, NDVI, NDWI, VISIBLE data
- **`panel_soiling`** - Soiling index data
- **`monthly_lst`** - Monthly aggregated LST
- **`data_availability`** - Tracks what data is available

## Is SQLite Good for Hosting?

**Yes, for this project!** SQLite is perfect because:
- ✅ Single server deployment
- ✅ Read-heavy workload (most queries are reads)
- ✅ No separate database server needed
- ✅ Easy backups (just copy the .db file)
- ✅ Fast for this use case

**Consider PostgreSQL if:**
- You need multiple servers accessing the database
- Very high write concurrency
- Need advanced features (replication, etc.)

For a solar farm dashboard with ~2000 panels and 5 years of data, SQLite is ideal.

## Next Steps

1. Test migration with `--sample 10` first
2. Run full migration when ready
3. Monitor API responses - they should show `"source": "database"` once data is migrated
4. Set up regular backups of `solar_farm_data.db`

See `DATABASE_README.md` for complete documentation.




