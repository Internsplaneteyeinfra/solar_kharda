"""
Migration script to fetch and store 5 years of historical data in SQLite.
This script fetches data from Google Earth Engine and stores it in the database.
"""
import os
import sys
import json
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
import time

# Add backend directory to path so we can import app modules
sys.path.insert(0, str(Path(__file__).parent))

from app.kharda.database import (
    init_database, insert_timeseries_data, insert_soiling_data,
    insert_monthly_lst, update_data_availability, get_data_statistics
)

from app.kharda.services import (
    get_lst_data, get_swir_data, get_soiling_data, 
    get_ndvi_data, get_ndwi_data, get_visible_mean_data,
    get_lst_monthly
)

from app.common.gee import init_gee

# Initialize Earth Engine
init_gee()

# Constants
POLYGONS_PATH = Path(__file__).parent.parent / "asset" / "solar_panel_polygons.geojson"
PARAMETERS = ['LST', 'SWIR', 'NDVI', 'NDWI', 'VISIBLE', 'SOILING']


def load_panel_ids():
    """Load all panel IDs from the GeoJSON file."""
    try:
        with open(POLYGONS_PATH, 'r') as f:
            geojson_data = json.load(f)
        
        panel_ids = []
        for feature in geojson_data.get('features', []):
            panel_id = feature.get('properties', {}).get('panel_id')
            if panel_id is not None:
                panel_ids.append(panel_id)
        
        return sorted(panel_ids)
    except Exception as e:
        print(f"Error loading panel IDs: {e}")
        return []


async def migrate_panel_parameter(panel_id: int, parameter: str, start_date: str, end_date: str):
    """Migrate data for a single panel and parameter."""
    try:
        # Load polygons to get the geometry
        with open(POLYGONS_PATH, 'r') as f:
            geojson_data = json.load(f)
        
        # Find the polygon for this panel
        target_polygon = None
        for feature in geojson_data.get('features', []):
            if feature.get('properties', {}).get('panel_id') == panel_id:
                target_polygon = feature
                break
        
        if not target_polygon:
            print(f"Panel {panel_id} not found in polygons")
            return False
        
        # Convert to EE geometry
        import ee
        coords = target_polygon['geometry']['coordinates'][0]
        ee_polygon = ee.Geometry.Polygon(coords)
        
        # Fetch data based on parameter
        if parameter == 'LST':
            data = await get_lst_data(ee_polygon, start_date, end_date)
            if data and data.get('timeseries'):
                count = 0
                for entry in data['timeseries']:
                    insert_timeseries_data(
                        panel_id, parameter, entry['date'], 
                        entry['value'], entry.get('unit', '°C')
                    )
                    count += 1
                update_data_availability(panel_id, parameter, start_date, end_date, count)
                return True
        
        elif parameter == 'SWIR':
            data = await get_swir_data(ee_polygon, start_date, end_date)
            if data and data.get('timeseries'):
                count = 0
                for entry in data['timeseries']:
                    insert_timeseries_data(
                        panel_id, parameter, entry['date'],
                        entry['value'], entry.get('unit', 'reflectance')
                    )
                    count += 1
                update_data_availability(panel_id, parameter, start_date, end_date, count)
                return True
        
        elif parameter == 'NDVI':
            data = await get_ndvi_data(ee_polygon, start_date, end_date)
            if data and data.get('timeseries'):
                count = 0
                for entry in data['timeseries']:
                    insert_timeseries_data(
                        panel_id, parameter, entry['date'],
                        entry['value'], entry.get('unit', '')
                    )
                    count += 1
                update_data_availability(panel_id, parameter, start_date, end_date, count)
                return True
        
        elif parameter == 'NDWI':
            data = await get_ndwi_data(ee_polygon, start_date, end_date)
            if data and data.get('timeseries'):
                count = 0
                for entry in data['timeseries']:
                    insert_timeseries_data(
                        panel_id, parameter, entry['date'],
                        entry['value'], entry.get('unit', '')
                    )
                    count += 1
                update_data_availability(panel_id, parameter, start_date, end_date, count)
                return True
        
        elif parameter == 'VISIBLE':
            data = await get_visible_mean_data(ee_polygon, start_date, end_date)
            if data and data.get('timeseries'):
                count = 0
                for entry in data['timeseries']:
                    insert_timeseries_data(
                        panel_id, parameter, entry['date'],
                        entry['value'], entry.get('unit', 'reflectance')
                    )
                    count += 1
                update_data_availability(panel_id, parameter, start_date, end_date, count)
                return True
        
        elif parameter == 'SOILING':
            # Soiling is calculated per year, so we need to process year by year
            start_dt = datetime.strptime(start_date, '%Y-%m-%d')
            end_dt = datetime.strptime(end_date, '%Y-%m-%d')
            
            current_year = start_dt.year
            count = 0
            while current_year <= end_dt.year:
                year_start = f"{current_year}-01-01"
                year_end = f"{current_year}-12-31"
                
                # Soiling uses baseline from Q1 and current from Q2+
                data = await get_soiling_data(ee_polygon, year_start, year_end)
                if data and data.get('soiling_drop_percent') is not None:
                    insert_soiling_data(
                        panel_id, year_end,
                        data.get('baseline_si', 0),
                        data.get('current_si', 0),
                        data.get('soiling_drop_percent', 0),
                        data.get('status', 'clean')
                    )
                    count += 1
                
                current_year += 1
                # Small delay to avoid rate limiting
                await asyncio.sleep(0.5)
            
            if count > 0:
                update_data_availability(panel_id, parameter, start_date, end_date, count)
                return True
            return False
        
        return False
    
    except Exception as e:
        print(f"Error migrating panel {panel_id}, parameter {parameter}: {e}")
        import traceback
        traceback.print_exc()
        return False


async def migrate_monthly_lst(start_date: str, end_date: str):
    """Migrate monthly aggregated LST data."""
    try:
        data = await get_lst_monthly(start_date, end_date)
        if data and data.get('series'):
            for entry in data['series']:
                insert_monthly_lst(entry['month'], entry['value'])
            print(f"Migrated {len(data['series'])} monthly LST records")
            return True
        return False
    except Exception as e:
        print(f"Error migrating monthly LST: {e}")
        return False


async def migrate_all_data(years: int = 5, sample_panels: int = None):
    """
    Migrate historical data for all panels.
    
    Args:
        years: Number of years of historical data to fetch (default: 5)
        sample_panels: If specified, only migrate this many panels (for testing)
    """
    print("=" * 60)
    print("Starting Historical Data Migration")
    print("=" * 60)
    
    # Initialize database
    print("\n1. Initializing database...")
    init_database()
    
    # Calculate date range
    end_date = datetime.now()
    start_date = end_date - timedelta(days=years * 365)
    start_date_str = start_date.strftime('%Y-%m-%d')
    end_date_str = end_date.strftime('%Y-%m-%d')
    
    print(f"\n2. Date range: {start_date_str} to {end_date_str} ({years} years)")
    
    # Load panel IDs
    print("\n3. Loading panel IDs...")
    panel_ids = load_panel_ids()
    if sample_panels:
        panel_ids = panel_ids[:sample_panels]
        print(f"   (Using sample of {sample_panels} panels)")
    print(f"   Found {len(panel_ids)} panels")
    
    # Migrate monthly LST first (faster, aggregated data)
    print("\n4. Migrating monthly LST data...")
    await migrate_monthly_lst(start_date_str, end_date_str)
    
    # Migrate panel data
    print(f"\n5. Migrating panel data for {len(panel_ids)} panels...")
    print(f"   Parameters: {', '.join(PARAMETERS)}")
    
    total_tasks = len(panel_ids) * len(PARAMETERS)
    completed = 0
    failed = 0
    
    # Process in batches to avoid overwhelming the API
    batch_size = 5  # Process 5 panels at a time
    delay_between_batches = 2  # seconds
    
    for i in range(0, len(panel_ids), batch_size):
        batch = panel_ids[i:i + batch_size]
        print(f"\n   Processing batch {i // batch_size + 1} (panels {i+1}-{min(i+batch_size, len(panel_ids))})...")
        
        for panel_id in batch:
            for parameter in PARAMETERS:
                try:
                    success = await migrate_panel_parameter(
                        panel_id, parameter, start_date_str, end_date_str
                    )
                    if success:
                        completed += 1
                    else:
                        failed += 1
                    
                    # Progress update
                    if (completed + failed) % 10 == 0:
                        print(f"   Progress: {completed + failed}/{total_tasks} tasks completed")
                    
                    # Small delay between requests
                    await asyncio.sleep(0.5)
                
                except Exception as e:
                    print(f"   Error with panel {panel_id}, {parameter}: {e}")
                    failed += 1
                    await asyncio.sleep(1)  # Longer delay on error
        
        # Delay between batches
        if i + batch_size < len(panel_ids):
            print(f"   Waiting {delay_between_batches} seconds before next batch...")
            await asyncio.sleep(delay_between_batches)
    
    # Print summary
    print("\n" + "=" * 60)
    print("Migration Complete!")
    print("=" * 60)
    print(f"Total tasks: {total_tasks}")
    print(f"Completed: {completed}")
    print(f"Failed: {failed}")
    
    # Print database statistics
    print("\nDatabase Statistics:")
    stats = get_data_statistics()
    print(f"  Timeseries records: {stats.get('timeseries_counts', {})}")
    print(f"  Soiling records: {stats.get('soiling_count', 0)}")
    print(f"  Unique panels (timeseries): {stats.get('unique_panels_timeseries', 0)}")
    print(f"  Unique panels (soiling): {stats.get('unique_panels_soiling', 0)}")
    if 'date_range' in stats:
        print(f"  Date range: {stats['date_range']['min']} to {stats['date_range']['max']}")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Migrate historical data to SQLite')
    parser.add_argument('--years', type=int, default=5, help='Number of years of data to fetch (default: 5)')
    parser.add_argument('--sample', type=int, help='Only migrate this many panels (for testing)')
    parser.add_argument('--monthly-only', action='store_true', help='Only migrate monthly LST data')
    
    args = parser.parse_args()
    
    if args.monthly_only:
        # Initialize database
        init_database()
        end_date = datetime.now()
        start_date = end_date - timedelta(days=args.years * 365)
        asyncio.run(migrate_monthly_lst(start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')))
    else:
        asyncio.run(migrate_all_data(years=args.years, sample_panels=args.sample))
