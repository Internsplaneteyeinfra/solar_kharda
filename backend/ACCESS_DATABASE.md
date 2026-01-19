# How to Access Your SQLite Database

There are several ways to access and query your SQLite database. Here are the most common methods:

## Method 1: Using the Python Query Script (Recommended)

I've created a simple Python script that makes it easy to query your database:

```bash
cd backend
python query_db.py
```

This script provides:
- Database statistics
- Table structures
- Example queries
- Interactive SQL query mode

## Method 2: Using SQLite Command Line

SQLite comes with a command-line tool. On Windows, you may need to download it or use it through Python.

### Using Python's built-in SQLite:
```bash
cd backend
python -c "import sqlite3; conn = sqlite3.connect('solar_farm_data.db'); cursor = conn.cursor(); cursor.execute('SELECT name FROM sqlite_master WHERE type=\"table\"'); print([row[0] for row in cursor.fetchall()])"
```

### Direct SQLite CLI (if installed):
```bash
cd backend
sqlite3 solar_farm_data.db
```

Once in SQLite CLI, you can run queries:
```sql
.tables                    -- List all tables
.schema                    -- Show database schema
SELECT * FROM panel_timeseries LIMIT 10;
.exit                      -- Exit
```

## Method 3: Using DB Browser for SQLite (GUI Tool)

**DB Browser for SQLite** is a free, open-source GUI tool:

1. **Download**: https://sqlitebrowser.org/
2. **Install** the application
3. **Open** the database:
   - File → Open Database
   - Navigate to: `C:\Users\Abhijit.Aher\Desktop\Kharda\backend\solar_farm_data.db`
4. **Browse** tables, run queries, and view data visually

## Method 4: Using VS Code Extension

If you use VS Code:

1. **Install** the "SQLite" extension by alexcvzz
2. **Open** the database file: `backend/solar_farm_data.db`
3. **Right-click** on the file → "Open Database"
4. **Query** using the SQL editor

## Method 5: Using Python Scripts

Create your own Python scripts to query the database:

```python
from app.kharda.database import get_db_connection, get_timeseries_data

# Get connection
conn = get_db_connection()
cursor = conn.cursor()

# Run a query
cursor.execute("SELECT * FROM panel_timeseries WHERE panel_id = 1 LIMIT 10")
rows = cursor.fetchall()
for row in rows:
    print(row)

# Or use helper functions
data = get_timeseries_data(panel_id=1, parameter='LST', 
                          start_date='2020-01-01', end_date='2024-12-31')
print(data)
```

## Common Queries

### View all tables:
```sql
SELECT name FROM sqlite_master WHERE type='table';
```

### Count records by parameter:
```sql
SELECT parameter, COUNT(*) as count 
FROM panel_timeseries 
GROUP BY parameter;
```

### Get data for a specific panel:
```sql
SELECT * FROM panel_timeseries 
WHERE panel_id = 1 AND parameter = 'LST' 
ORDER BY date DESC 
LIMIT 10;
```

### Get date range:
```sql
SELECT MIN(date) as start_date, MAX(date) as end_date 
FROM panel_timeseries;
```

### Count unique panels:
```sql
SELECT COUNT(DISTINCT panel_id) FROM panel_timeseries;
```

### View soiling data:
```sql
SELECT * FROM panel_soiling LIMIT 10;
```

### View monthly LST:
```sql
SELECT * FROM monthly_lst ORDER BY month;
```

## Database Location

Your database is located at:
```
C:\Users\Abhijit.Aher\Desktop\Kharda\backend\solar_farm_data.db
```

## Quick Access Commands

### Check if database exists:
```bash
cd backend
python -c "from pathlib import Path; from app.kharda.database import DB_PATH; print('Exists' if Path(DB_PATH).exists() else 'Not found'); print(DB_PATH)"
```

### Get database size:
```bash
cd backend
python -c "from pathlib import Path; from app.kharda.database import DB_PATH; size = Path(DB_PATH).stat().st_size / (1024*1024); print(f'{size:.2f} MB')"
```

### View database statistics via API:
```bash
curl http://localhost:8000/api/database/stats
```

## Tips

1. **Backup before making changes**: Always backup your database before running UPDATE or DELETE queries
2. **Use transactions**: Wrap multiple queries in transactions for safety
3. **Index usage**: The database has indexes on common query fields (panel_id, parameter, date)
4. **Read-only queries**: Use SELECT queries to explore data without risk

## Troubleshooting

### Database locked error:
- Close any other connections to the database
- Ensure only one process is writing at a time

### Database not found:
- Run the migration script first: `python migrate_historical_data.py --years 5`

### Permission errors:
- Ensure you have read/write permissions to the backend directory




