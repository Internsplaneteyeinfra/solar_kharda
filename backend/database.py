"""
SQLite database module for storing historical panel data.
"""
import sqlite3
import os
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any
from contextlib import contextmanager

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "solar_farm_data.db"

# Parameter types that support time series
TIMESERIES_PARAMETERS = ['LST', 'SWIR', 'NDVI', 'NDWI', 'VISIBLE']
# Parameters with special structure
SPECIAL_PARAMETERS = ['SOILING']


def get_db_connection():
    """Get a database connection."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row  # Enable column access by name
    return conn


@contextmanager
def get_db():
    """Context manager for database connections."""
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_database():
    """Initialize the database schema."""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Table for time series data (LST, SWIR, NDVI, NDWI, VISIBLE)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS panel_timeseries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                panel_id INTEGER NOT NULL,
                parameter TEXT NOT NULL,
                date TEXT NOT NULL,
                value REAL NOT NULL,
                unit TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(panel_id, parameter, date)
            )
        """)
        
        # Table for soiling data (special structure)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS panel_soiling (
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
        """)
        
        # Table for monthly aggregated LST data
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS monthly_lst (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month TEXT NOT NULL UNIQUE,
                value REAL NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Table to track data availability
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS data_availability (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                panel_id INTEGER NOT NULL,
                parameter TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                record_count INTEGER DEFAULT 0,
                last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(panel_id, parameter)
            )
        """)
        
        # Create indexes for better query performance
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_timeseries_panel_param_date 
            ON panel_timeseries(panel_id, parameter, date)
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_timeseries_date 
            ON panel_timeseries(date)
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_soiling_panel_date 
            ON panel_soiling(panel_id, date)
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_monthly_lst_month 
            ON monthly_lst(month)
        """)
        
        print(f"Database initialized at {DB_PATH}")


def insert_timeseries_data(panel_id: int, parameter: str, date: str, value: float, unit: str):
    """Insert time series data for a panel."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO panel_timeseries 
            (panel_id, parameter, date, value, unit)
            VALUES (?, ?, ?, ?, ?)
        """, (panel_id, parameter, date, value, unit))


def insert_soiling_data(panel_id: int, date: str, baseline_si: float, current_si: float, 
                       soiling_drop_percent: float, status: str):
    """Insert soiling data for a panel."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO panel_soiling 
            (panel_id, date, baseline_si, current_si, soiling_drop_percent, unit, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (panel_id, date, baseline_si, current_si, soiling_drop_percent, '%', status))


def insert_monthly_lst(month: str, value: float):
    """Insert monthly aggregated LST data."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO monthly_lst (month, value)
            VALUES (?, ?)
        """, (month, value))


def get_timeseries_data(panel_id: int, parameter: str, start_date: str, end_date: str) -> List[Dict]:
    """Get time series data for a panel within a date range."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT date, value, unit
            FROM panel_timeseries
            WHERE panel_id = ? AND parameter = ? 
            AND date >= ? AND date <= ?
            ORDER BY date ASC
        """, (panel_id, parameter, start_date, end_date))
        
        rows = cursor.fetchall()
        return [
            {
                'date': row['date'],
                'value': row['value'],
                'unit': row['unit']
            }
            for row in rows
        ]


def get_soiling_data(panel_id: int, date: str) -> Optional[Dict]:
    """Get soiling data for a panel."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT date, baseline_si, current_si, soiling_drop_percent, unit, status
            FROM panel_soiling
            WHERE panel_id = ? AND date = ?
            ORDER BY date DESC
            LIMIT 1
        """, (panel_id, date))
        
        row = cursor.fetchone()
        if row:
            return {
                'baseline_si': row['baseline_si'],
                'current_si': row['current_si'],
                'soiling_drop_percent': row['soiling_drop_percent'],
                'unit': row['unit'],
                'status': row['status']
            }
        return None


def get_monthly_lst(start_date: str, end_date: str) -> List[Dict]:
    """Get monthly LST data within a date range."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT month, value
            FROM monthly_lst
            WHERE month >= ? AND month <= ?
            ORDER BY month ASC
        """, (start_date[:7], end_date[:7]))
        
        rows = cursor.fetchall()
        return [
            {
                'month': row['month'],
                'value': row['value']
            }
            for row in rows
        ]


def update_data_availability(panel_id: int, parameter: str, start_date: str, end_date: str, record_count: int):
    """Update data availability tracking."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO data_availability 
            (panel_id, parameter, start_date, end_date, record_count, last_updated)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (panel_id, parameter, start_date, end_date, record_count))


def check_data_availability(panel_id: int, parameter: str, start_date: str, end_date: str) -> bool:
    """Check if data exists in database for the given range."""
    with get_db() as conn:
        cursor = conn.cursor()
        if parameter == 'SOILING':
            cursor.execute("""
                SELECT COUNT(*) as count
                FROM panel_soiling
                WHERE panel_id = ? AND date >= ? AND date <= ?
            """, (panel_id, start_date, end_date))
        else:
            cursor.execute("""
                SELECT COUNT(*) as count
                FROM panel_timeseries
                WHERE panel_id = ? AND parameter = ? 
                AND date >= ? AND date <= ?
            """, (panel_id, parameter, start_date, end_date))
        
        row = cursor.fetchone()
        return row['count'] > 0 if row else False


def get_all_panel_ids() -> List[int]:
    """Get all panel IDs from the database."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT DISTINCT panel_id FROM panel_timeseries
            UNION
            SELECT DISTINCT panel_id FROM panel_soiling
        """)
        return [row['panel_id'] for row in cursor.fetchall()]


def get_data_statistics() -> Dict[str, Any]:
    """Get database statistics."""
    with get_db() as conn:
        cursor = conn.cursor()
        
        stats = {}
        
        # Count records by parameter
        cursor.execute("""
            SELECT parameter, COUNT(*) as count
            FROM panel_timeseries
            GROUP BY parameter
        """)
        stats['timeseries_counts'] = {row['parameter']: row['count'] for row in cursor.fetchall()}
        
        # Count soiling records
        cursor.execute("SELECT COUNT(*) as count FROM panel_soiling")
        stats['soiling_count'] = cursor.fetchone()['count']
        
        # Count unique panels
        cursor.execute("""
            SELECT COUNT(DISTINCT panel_id) as count FROM panel_timeseries
        """)
        stats['unique_panels_timeseries'] = cursor.fetchone()['count']
        
        cursor.execute("""
            SELECT COUNT(DISTINCT panel_id) as count FROM panel_soiling
        """)
        stats['unique_panels_soiling'] = cursor.fetchone()['count']
        
        # Date ranges
        cursor.execute("""
            SELECT MIN(date) as min_date, MAX(date) as max_date
            FROM panel_timeseries
        """)
        date_range = cursor.fetchone()
        if date_range and date_range['min_date']:
            stats['date_range'] = {
                'min': date_range['min_date'],
                'max': date_range['max_date']
            }
        
        return stats




