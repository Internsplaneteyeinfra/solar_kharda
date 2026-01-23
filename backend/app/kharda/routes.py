import os
import json
import math
import statistics
import time
import hashlib
from pathlib import Path
import ee
import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime, timedelta
from app.kharda.services import (
    get_soiling_data as calculate_soiling_data,
    get_lst_data,
    get_swir_data,
    get_ndvi_data,
    get_ndwi_data,
    get_visible_mean_data
)


try:
    from app.kharda.database import (
        get_data_statistics, 
        get_timeseries_data, 
        get_db,
        get_monthly_lst,
        check_data_availability,
        get_latest_soiling_record,
    )
    
    try:
        from app.kharda.database import insert_timeseries_data
    except ImportError:
        print("[WARN] Could not import insert_timeseries_data")
        insert_timeseries_data = None

    DB_AVAILABLE = True
except ImportError as e:
    DB_AVAILABLE = False
    insert_timeseries_data = None
    print(f"Warning: Database module not available. API will only use GEE. Error: {e}")

router = APIRouter()

# Load polygons - asset directory is in the project root
# current file: backend/app/kharda/routes.py
# root: backend/app/kharda/../../.. -> backend/.. -> root
BASE_DIR_KHARDA = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR_KHARDA.parent.parent.parent
POLYGONS_PATH = PROJECT_ROOT / "asset" / "solar_panel_polygons.geojson"
POLYGONS_PATH_STR = str(POLYGONS_PATH)

# Verify polygons file exists
if not os.path.exists(POLYGONS_PATH_STR):
    print(f"WARNING: Polygons file not found at: {POLYGONS_PATH_STR}")
else:
    print(f"Polygons file loaded from: {POLYGONS_PATH_STR}")

# Cache directory in backend root
BACKEND_ROOT = BASE_DIR_KHARDA.parent.parent
PANEL_SNAPSHOT_CACHE_DIR = BACKEND_ROOT / "panel_snapshots"
DEFAULT_SNAPSHOT_CACHE_TTL = int(os.getenv("PANEL_SNAPSHOT_CACHE_TTL", 6 * 60 * 60))

PANEL_PARAMETER_CONFIG = {
    'LST': {'unit': '°C', 'precision': 2},
    'SWIR': {'unit': 'reflectance', 'precision': 4},
    'SOILING': {'unit': '%', 'precision': 2},
    'NDVI': {'unit': '', 'precision': 4},
    'NDWI': {'unit': '', 'precision': 4},
    'VISIBLE': {'unit': 'reflectance', 'precision': 4}
}

BUCKET_LABELS = [
    ('very_low', 'Very Low'),
    ('low', 'Low'),
    ('medium', 'Medium'),
    ('high', 'High'),
    ('very_high', 'Very High')
]

class PanelQuery(BaseModel):
    panel_ids: List[int]
    parameter: str  # "LST", "SWIR", "SOILING", "NDVI", "NDWI", "VISIBLE"
    start_date: str
    end_date: str

class TimeRangeQuery(BaseModel):
    start_date: str
    end_date: str

@router.post("/api/panel-data")
async def get_panel_data(query: PanelQuery):
    if not DB_AVAILABLE:
        raise HTTPException(status_code=503, detail="Database not available")

    parameter = query.parameter.upper()
    if parameter not in PANEL_PARAMETER_CONFIG:
        raise HTTPException(status_code=400, detail=f"Unsupported parameter: {parameter}")

    start_date, end_date = normalize_date_range(
        query.start_date,
        query.end_date
    )

    print(
        f"[INFO] /api/panel-data request "
        f"panel_ids={query.panel_ids} "
        f"parameter={parameter} "
        f"start={start_date} end={end_date}"
    )

    results = []
    for panel_id in query.panel_ids:
        panel_result = {}

        if parameter == "SOILING":
            record = None
            try:
                record = get_latest_soiling_record(panel_id)
            except Exception as e:
                print(f"[ERROR] Error fetching soiling record from database for panel {panel_id}: {e}")

            if record:
                panel_result.update({
                    "parameter": "SOILING",
                    **record,
                    "source": "database"
                })
            else:
                gee_result = None

                try:
                    with open(POLYGONS_PATH_STR, "r") as f:
                        geojson = json.load(f)

                    feature = next(
                        f for f in geojson["features"]
                        if f["properties"]["panel_id"] == panel_id
                    )

                    geometry = ee.Geometry(feature["geometry"])

                    gee_result = await calculate_soiling_data(
                        geometry,
                        start_date,
                        end_date
                    )

                except Exception as e:
                    print(f"[ERROR] Soiling calculation via GEE failed for panel {panel_id}: {e}")

                if gee_result:
                    panel_result.update({
                        "parameter": "SOILING",
                        **gee_result,
                        "source": "gee"
                    })
                else:
                    panel_result.update({
                        "parameter": "SOILING",
                        "baseline_si": 1.0,
                        "current_si": 1.0,
                        "soiling_drop_percent": 0.0,
                        "unit": PANEL_PARAMETER_CONFIG["SOILING"]["unit"],
                        "status": "no_data",
                        "source": "fallback"
                    })

        # ===================== OTHER PARAMETERS =====================
        else:
            timeseries = []
            if DB_AVAILABLE:
                try:
                    print(f"[DEBUG] Fetching DB: panel={panel_id}, param={parameter}, start={start_date}, end={end_date}")
                    timeseries = get_timeseries_data(
                        panel_id,
                        parameter,
                        start_date,
                        end_date
                    )
                    print(f"[DEBUG] DB returned {len(timeseries)} records")
                except Exception as e:
                    print(f"[ERROR] Error fetching timeseries data from database for panel {panel_id}: {e}")
            else:
                print("[WARN] DB_AVAILABLE is False, skipping DB fetch")
            
            # If no data in DB, try GEE
            if not timeseries:
                print(f"[INFO] No data in DB for {parameter} (panel {panel_id}). Fetching from GEE...")
                try:
                    # Get geometry
                    with open(POLYGONS_PATH_STR, "r") as f:
                        geojson = json.load(f)
                    feature = next(
                        f for f in geojson["features"]
                        if f["properties"]["panel_id"] == panel_id
                    )
                    geometry = ee.Geometry(feature["geometry"])

                    # Call appropriate service
                    gee_data = None
                    if parameter == 'LST':
                        gee_data = await get_lst_data(geometry, start_date, end_date)
                    elif parameter == 'SWIR':
                        gee_data = await get_swir_data(geometry, start_date, end_date)
                    elif parameter == 'NDVI':
                        gee_data = await get_ndvi_data(geometry, start_date, end_date)
                    elif parameter == 'NDWI':
                        gee_data = await get_ndwi_data(geometry, start_date, end_date)
                    elif parameter == 'VISIBLE':
                        gee_data = await get_visible_mean_data(geometry, start_date, end_date)
                    
                    if gee_data and gee_data.get('timeseries'):
                        timeseries = gee_data['timeseries']
                        # Cache to DB
                        if DB_AVAILABLE and insert_timeseries_data:
                            print(f"[INFO] Caching {len(timeseries)} records to DB for {parameter} (panel {panel_id})")
                            for record in timeseries:
                                try:
                                    insert_timeseries_data(
                                        panel_id,
                                        parameter,
                                        record['date'],
                                        record['value'],
                                        record['unit']
                                    )
                                except Exception as db_err:
                                    print(f"[WARN] Failed to cache record: {db_err}")
                        elif DB_AVAILABLE and not insert_timeseries_data:
                            print(f"[WARN] Skipping cache: insert_timeseries_data not available")
                except Exception as gee_err:
                    print(f"[ERROR] GEE fetch failed for {parameter} (panel {panel_id}): {gee_err}")

            if not timeseries:
                panel_result.update({
                    "error": "No data found for requested range"
                })
                results.append(panel_result)
                continue

            config = PANEL_PARAMETER_CONFIG.get(parameter, {})
            precision = config.get("precision", 2)
            unit = timeseries[0]["unit"]

            try:
                current_value = round(float(timeseries[-1]["value"]), precision)
            except Exception:
                current_value = None

            rounded_series = []
            for entry in timeseries:
                try:
                    value = round(float(entry["value"]), precision)
                except Exception:
                    value = None

                rounded_series.append({
                    "date": entry["date"],
                    "value": value,
                    "unit": entry["unit"]
                })

            panel_result.update({
                "parameter": parameter,
                "current_value": current_value,
                "unit": unit,
                "timeseries": rounded_series,
            })

        results.append(panel_result)

    return {"results": results}


def ensure_snapshot_cache_dir():
    PANEL_SNAPSHOT_CACHE_DIR.mkdir(parents=True, exist_ok=True)

def build_snapshot_cache_path(parameter: str, start_date: str, end_date: str) -> Path:
    normalized = f"{parameter.upper()}|{start_date}|{end_date}"
    digest = hashlib.sha1(normalized.encode('utf-8')).hexdigest()
    return PANEL_SNAPSHOT_CACHE_DIR / f"{parameter.lower()}_{digest}.json"

def load_cached_snapshot(path: Path):
    if not path.exists():
        return None
    try:
        with open(path, 'r') as cache_file:
            payload = json.load(cache_file)
    except Exception:
        return None
    timestamp = payload.get('generated_at_ts')
    ttl = payload.get('cache_ttl', DEFAULT_SNAPSHOT_CACHE_TTL)
    if timestamp and (time.time() - timestamp) > ttl:
        return None
    return payload

def save_snapshot_cache(path: Path, payload: Dict):
    ensure_snapshot_cache_dir()
    payload_to_store = dict(payload)
    payload_to_store['generated_at_ts'] = time.time()
    payload_to_store['cache_ttl'] = DEFAULT_SNAPSHOT_CACHE_TTL
    with open(path, 'w') as cache_file:
        json.dump(payload_to_store, cache_file)

def normalize_date_range(start_date: str, end_date: str):
    try:
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d')
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=f"Invalid date format. Use YYYY-MM-DD. Error: {str(ve)}")

    if start_dt > end_dt:
        raise HTTPException(status_code=400, detail="start_date must be before or equal to end_date")

    if start_dt == end_dt:
        end_dt = end_dt + timedelta(days=1)

    return start_dt.strftime('%Y-%m-%d'), end_dt.strftime('%Y-%m-%d')

def percentile_from_sorted(sorted_values, quantile):
    if not sorted_values:
        return None
    if len(sorted_values) == 1:
        return sorted_values[0]
    position = quantile * (len(sorted_values) - 1)
    lower_index = math.floor(position)
    upper_index = math.ceil(position)
    if lower_index == upper_index:
        return sorted_values[int(position)]
    lower_value = sorted_values[lower_index]
    upper_value = sorted_values[upper_index]
    return lower_value + (upper_value - lower_value) * (position - lower_index)

def build_value_stats(value_map: Dict[str, Dict], precision: int):
    numeric_values = []
    for entry in value_map.values():
        raw_value = entry.get('value')
        if raw_value is None:
            continue
        try:
            numeric_values.append(float(raw_value))
        except (TypeError, ValueError):
            continue

    if not numeric_values:
        return {
            'count': 0,
            'min': None,
            'max': None,
            'mean': None,
            'median': None,
            'percentiles': {},
            'buckets': []
        }

    numeric_values.sort()

    def rounded(value):
        if value is None:
            return None
        return round(value, precision)

    percentiles = {
        'p10': rounded(percentile_from_sorted(numeric_values, 0.1)),
        'p25': rounded(percentile_from_sorted(numeric_values, 0.25)),
        'p50': rounded(percentile_from_sorted(numeric_values, 0.5)),
        'p75': rounded(percentile_from_sorted(numeric_values, 0.75)),
        'p90': rounded(percentile_from_sorted(numeric_values, 0.9))
    }

    buckets = []
    quantile_breaks = [0, 0.2, 0.4, 0.6, 0.8, 1]
    quantile_values = [percentile_from_sorted(numeric_values, q) for q in quantile_breaks]

    for idx, (bucket_id, label) in enumerate(BUCKET_LABELS):
        start_value = quantile_values[idx]
        end_value = quantile_values[idx + 1]
        if start_value is None or end_value is None:
            continue
        if end_value < start_value:
            end_value = start_value
        buckets.append({
            'id': bucket_id,
            'label': label,
            'min': rounded(start_value),
            'max': rounded(end_value),
            'rangeLabel': f"{rounded(start_value)} – {rounded(end_value)}"
        })

    stats = {
        'count': len(numeric_values),
        'min': rounded(numeric_values[0]),
        'max': rounded(numeric_values[-1]),
        'mean': rounded(statistics.mean(numeric_values)),
        'median': rounded(percentiles['p50']),
        'percentiles': percentiles,
        'buckets': buckets
    }

    if len(numeric_values) > 1:
        stats['stdev'] = rounded(statistics.stdev(numeric_values))
    else:
        stats['stdev'] = 0

    return stats

async def fetch_latest_satellite_ghi(lat: float, lon: float, tilt: int = 18) -> Optional[float]:
    """Fetch the latest Global Horizontal Irradiance from Open-Meteo's satellite API."""
    try:
        now = datetime.utcnow()
        # Request the last 48 hours to make sure we capture the latest completed hour
        start_date = (now - timedelta(days=2)).strftime('%Y-%m-%d')
        end_date = now.strftime('%Y-%m-%d')

        params = {
            "latitude": lat,
            "longitude": lon,
            "hourly": "shortwave_radiation",
            "models": "satellite_radiation_seamless",
            "tilt": tilt,
            "start_date": start_date,
            "end_date": end_date,
            "timeformat": "unixtime"
        }

        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://satellite-api.open-meteo.com/v1/archive",
                params=params,
                timeout=10.0
            )
            response.raise_for_status()
            payload = response.json()

        hourly = payload.get("hourly", {})
        ghi_values = hourly.get("shortwave_radiation") or []

        for value in reversed(ghi_values):
            if value is not None:
                # shortwave_radiation is already reported in W/m²
                return round(float(value), 2)
        return None
    except Exception as exc:
        print(f"Error fetching satellite GHI: {exc}")
        return None

def mask_l8l9_clouds(image):
    """Mask clouds and shadows in Landsat 8 & 9 C2 L2"""
    qa = image.select('QA_PIXEL')
    cloud_bit_mask = (1 << 3)
    cloud_shadow_bit_mask = (1 << 4)
    mask = qa.bitwiseAnd(cloud_bit_mask).eq(0).And(qa.bitwiseAnd(cloud_shadow_bit_mask).eq(0))
    return image.updateMask(mask)

def apply_lst(image):
    """Apply scaling factors and convert LST to Celsius for Landsat 8 & 9"""
    lst = image.select('ST_B10') \
        .multiply(0.00341802) \
        .add(149.0) \
        .subtract(273.15) \
        .rename('LST_C')
    return image.addBands(lst).copyProperties(image, ['system:time_start'])

def apply_modis_lst(image):
    """Convert MODIS LST to Celsius and rename to LST_C for consistency"""
    lst_c = image.select('LST_Day_1km') \
        .multiply(0.02) \
        .subtract(273.15) \
        .rename('LST_C')
    return lst_c.copyProperties(image, ['system:time_start'])

def get_landsat_lst_collection(aoi, start_date, end_date):
    """Get Landsat 8 & 9 LST collection"""
    try:
        l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2') \
            .filterBounds(aoi) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUD_COVER_LAND', 80)) \
            .map(mask_l8l9_clouds) \
            .map(apply_lst) \
            .select('LST_C')
        
        l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2') \
            .filterBounds(aoi) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUD_COVER_LAND', 80)) \
            .map(mask_l8l9_clouds) \
            .map(apply_lst) \
            .select('LST_C')
        
        return l8.merge(l9)
    except Exception as e:
        print(f'[WARNING] Error getting Landsat collection: {str(e)}')
        return None

def get_modis_lst_collection(aoi, start_date, end_date):
    """Get MODIS LST collection"""
    try:
        modis = ee.ImageCollection('MODIS/061/MOD11A2') \
            .filterBounds(aoi) \
            .filterDate(start_date, end_date) \
            .map(apply_modis_lst) \
            .select('LST_C')
        return modis
    except Exception as e:
        print(f'[WARNING] Error getting MODIS collection: {str(e)}')
        return None

@router.get("/api/weather")
async def get_weather():
    """Get current weather data from Open-Meteo API, with GHI from Earth Engine"""
    try:
        # Get location from polygons (using first polygon center)
        with open(POLYGONS_PATH_STR, 'r') as f:
            geojson_data = json.load(f)
        
        if not geojson_data.get('features'):
            raise HTTPException(status_code=404, detail="No polygons found")
        
        # Get first polygon for GHI calculation
        first_polygon_feature = geojson_data['features'][0]
        first_polygon = first_polygon_feature['geometry']['coordinates'][0]
        lon = sum(coord[0] for coord in first_polygon) / len(first_polygon)
        lat = sum(coord[1] for coord in first_polygon) / len(first_polygon)
        
        # Open-Meteo API endpoint for weather data (excluding GHI)
        url = "https://api.open-meteo.com/v1/forecast"
        
        params = {
            "latitude": lat,
            "longitude": lon,
            "hourly": "temperature_2m,relative_humidity_2m,windspeed_10m,cloudcover,shortwave_radiation",
            "daily": "temperature_2m_max,temperature_2m_min",
            "current": "temperature_2m,relative_humidity_2m,cloudcover,wind_speed_10m",
            "timezone": "auto",
            "past_days": 1,
            "forecast_days": 1,
            "windspeed_unit": "kmh"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=10.0)
            response.raise_for_status()
            data = response.json()
        
        # Extract current values
        current = data.get('current', {})
        hourly = data.get('hourly', {})
        daily = data.get('daily', {})
        
        # Get latest hourly data
        times = hourly.get('time', [])
        if not times:
            raise HTTPException(status_code=500, detail="No hourly data available")
        
        latest_idx = len(times) - 1
        latest_time = times[latest_idx]
        
        # Extract latest values
        temps = hourly.get('temperature_2m', [])
        humidities = hourly.get('relative_humidity_2m', [])
        windspeeds = hourly.get('windspeed_10m', [])
        cloud = hourly.get('cloudcover', [])
        
        temp_min = min(daily.get('temperature_2m_min', [0])) if daily.get('temperature_2m_min') else None
        temp_max = max(daily.get('temperature_2m_max', [0])) if daily.get('temperature_2m_max') else None
        humidity = current.get('relative_humidity_2m')
        if humidity is None and latest_idx < len(humidities):
            humidity = humidities[latest_idx]

        windspeed = current.get('wind_speed_10m')
        if windspeed is None and latest_idx < len(windspeeds):
            windspeed = windspeeds[latest_idx]

        current_temp = current.get('temperature_2m', temps[latest_idx] if latest_idx < len(temps) else None)
        cloudcover_current = current.get('cloudcover')
        if cloudcover_current is None and latest_idx < len(cloud):
            cloudcover_current = cloud[latest_idx]
        
        # Get latest GHI from Open-Meteo satellite API
        ghi = await fetch_latest_satellite_ghi(lat, lon)

        latest = {
            "date": latest_time,
            "temp_min": round(temp_min, 1) if temp_min is not None else None,
            "temp_max": round(temp_max, 1) if temp_max is not None else None,
            "temp_current": round(current_temp, 1) if current_temp is not None else None,
            "humidity": round(humidity, 1) if humidity is not None else None,
            "windspeed": round(windspeed, 1) if windspeed is not None else None,
            "ghi": ghi,
            "cloudcover": round(cloudcover_current, 1) if cloudcover_current is not None else None
        }

        return {
            "latest": latest,
            "hourly": {
                "time": times,
                "temperature_2m": temps,
                "relative_humidity_2m": humidities,
                "windspeed_10m": windspeeds,
                "cloudcover": cloud
            }
        }
    
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"Open-Meteo API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/polygons")
async def get_polygons():
    """Return the GeoJSON file with all polygons"""
    if os.path.exists(POLYGONS_PATH_STR):
        return FileResponse(POLYGONS_PATH_STR, media_type="application/json")
    raise HTTPException(status_code=404, detail="Polygons file not found")

@router.get("/api/database/stats")
async def get_database_stats_route():
    """Get database statistics"""
    if not DB_AVAILABLE:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        stats = get_data_statistics()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting database stats: {str(e)}")

@router.get("/api/all-panels-lst")
async def get_all_panels_lst(start_date: str, end_date: str):
    """Get LST values for all panels using the SQLite database with z-score hotspot detection."""
    try:
        try:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d')
            end_dt = datetime.strptime(end_date, '%Y-%m-%d')
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=f"Invalid date format. Use YYYY-MM-DD format. Error: {str(ve)}")

        if start_dt > end_dt:
            raise HTTPException(status_code=400, detail="start_date must be before or equal to end_date")

        if (end_dt - start_dt).days < 1:
            end_dt = start_dt + timedelta(days=1)
            end_date = end_dt.strftime('%Y-%m-%d')

        print(f"[DEBUG] Fetching all-panels LST from database for {start_date} to {end_date}")

        if not DB_AVAILABLE:
            raise HTTPException(status_code=503, detail="Database not available for all-panels LST")

        panel_ids = get_all_panel_ids()
        if not panel_ids:
            return {"panel_lst": {}, "panel_z_scores": {}, "global_stats": {"mean": None, "stddev": None}}

        panel_lst_map = {}
        lst_values = []

        for pid in panel_ids:
            try:
                series = get_timeseries_data(pid, "LST", start_date, end_date)
            except Exception as e:
                print(f"[WARNING] Failed to get LST timeseries for panel {pid}: {e}")
                continue

            if not series:
                continue

            values = []
            for entry in series:
                try:
                    values.append(float(entry["value"]))
                except Exception:
                    continue

            if not values:
                continue

            mean_val = statistics.mean(values)
            panel_lst_map[pid] = mean_val
            lst_values.append(mean_val)

        if not lst_values:
            return {"panel_lst": {}, "panel_z_scores": {}, "global_stats": {"mean": None, "stddev": None}}

        global_mean = statistics.mean(lst_values)
        global_std = statistics.stdev(lst_values) if len(lst_values) > 1 else 0

        panel_z_scores = {}
        if global_std > 0:
            for pid, val in panel_lst_map.items():
                z_score = (val - global_mean) / global_std
                panel_z_scores[pid] = round(z_score, 2)
        else:
            for pid in panel_lst_map:
                panel_z_scores[pid] = 0

        return {
            "panel_lst": {int(k): round(v, 2) for k, v in panel_lst_map.items()},
            "panel_z_scores": panel_z_scores,
            "global_stats": {
                "mean": round(global_mean, 2),
                "stddev": round(global_std, 2),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] General error in all-panels-lst DB flow: {e}")
        raise HTTPException(status_code=500, detail="Failed to compute all-panels LST")

@router.get("/api/lst-monthly")
async def get_lst_monthly(start_date: str, end_date: str):
    """Return monthly mean LST (°C) across all panels using Landsat 8 & 9 and MODIS"""
    # Try database first
    if DB_AVAILABLE:
        try:
            db_data = get_monthly_lst(start_date, end_date)
            if db_data:
                return {'series': db_data, 'source': 'database'}
        except Exception as db_error:
            print(f"Database query failed, falling back to GEE: {db_error}")
    
    try:
        # Validate dates
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d')
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        
        if start_dt > end_dt:
            raise HTTPException(status_code=400, detail="start_date must be before or equal to end_date")
        
        # Cap dates to today if they're in the future
        if start_dt > today:
            print(f'[WARNING] Start date {start_date} is in the future, capping to today')
            start_dt = today
            start_date = start_dt.strftime('%Y-%m-%d')
        if end_dt > today:
            print(f'[WARNING] End date {end_date} is in the future, capping to today')
            end_dt = today
            end_date = end_dt.strftime('%Y-%m-%d')
        
        # Ensure we have at least one day of range
        if start_dt == end_dt:
            end_dt = end_dt + timedelta(days=1)
        
        # If start is still after end after capping, return empty
        if start_dt >= end_dt:
            print(f'[WARNING] Date range invalid after capping: {start_date} to {end_date}')
            return { 'series': [] }
        
        print(f'[DEBUG] Processing monthly LST for date range: {start_date} to {end_date}')

        # Load polygons
        try:
            with open(POLYGONS_PATH_STR, 'r') as f:
                geojson_data = json.load(f)
        except Exception as file_error:
            print(f'Error loading polygons file: {str(file_error)}')
            return { 'series': [] }

        features_list = []
        try:
            for feature in geojson_data.get('features', []):
                try:
                    coords = feature['geometry']['coordinates'][0]
                    # Validate polygon has at least 3 points
                    if len(coords) < 3:
                        print(f'[WARNING] Skipping polygon with less than 3 points: {len(coords)} points')
                        continue
                    # Validate coordinates are valid (not empty, have x and y)
                    if not all(len(coord) >= 2 for coord in coords):
                        print(f'[WARNING] Skipping polygon with invalid coordinates')
                        continue
                    ee_polygon = ee.Geometry.Polygon(coords)
                    features_list.append(ee.Feature(ee_polygon))
                except Exception as feat_error:
                    print(f'[WARNING] Error processing feature: {str(feat_error)}')
                    continue
        except Exception as poly_error:
            print(f'Error processing polygons: {str(poly_error)}')
            return { 'series': [] }

        if not features_list:
            print(f'[WARNING] No valid polygons found after validation')
            return { 'series': [] }

        try:
            polygons_fc = ee.FeatureCollection(features_list)
            # Use union of all polygons to get AOI bounds, with error handling
            try:
                aoi = polygons_fc.geometry().bounds()
            except Exception as bounds_error:
                # Fallback: use first polygon's bounds
                print(f'[WARNING] Error computing bounds from all polygons, using first polygon: {bounds_error}')
                if features_list:
                    aoi = features_list[0].geometry().bounds()
                else:
                    return { 'series': [] }
        except Exception as ee_init_error:
            print(f'Error creating FeatureCollection: {str(ee_init_error)}')
            return { 'series': [] }

        # Helper to get monthly mean across panels
        def month_entry(start_dt_py: datetime):
            try:
                month_start = start_dt_py.replace(day=1)
                if month_start.month == 12:
                    next_month = month_start.replace(year=month_start.year + 1, month=1, day=1)
                else:
                    next_month = month_start.replace(month=month_start.month + 1, day=1)

                start_str = month_start.strftime('%Y-%m-%d')
                end_str = next_month.strftime('%Y-%m-%d')

                # Get Landsat collection
                landsat_collection = get_landsat_lst_collection(aoi, start_str, end_str)
                
                # Get MODIS collection
                modis_collection = get_modis_lst_collection(aoi, start_str, end_str)
                
                # Process collections separately to avoid type incompatibility when merging
                values = []
                weights = []
                
                # Process Landsat if available
                if landsat_collection is not None:
                    try:
                        landsat_count = landsat_collection.size().getInfo()
                        if landsat_count > 0:
                            landsat_mean = landsat_collection.mean().select('LST_C')
                            landsat_value = landsat_mean.reduceRegion(
                                reducer=ee.Reducer.mean(),
                                geometry=polygons_fc.geometry(),
                                scale=30,
                                maxPixels=1e9,
                                bestEffort=True
                            ).getInfo()
                            lst_val = landsat_value.get('LST_C')
                            if lst_val is not None:
                                values.append(float(lst_val))
                                weights.append(landsat_count)
                    except Exception as landsat_error:
                        print(f'[WARNING] Month {month_start.strftime("%Y-%m")}: Error processing Landsat: {str(landsat_error)}')
                
                # Process MODIS if available
                if modis_collection is not None:
                    try:
                        modis_count = modis_collection.size().getInfo()
                        if modis_count > 0:
                            modis_mean = modis_collection.mean().select('LST_C')
                            modis_value = modis_mean.reduceRegion(
                                reducer=ee.Reducer.mean(),
                                geometry=polygons_fc.geometry(),
                                scale=30,
                                maxPixels=1e9,
                                bestEffort=True
                            ).getInfo()
                            lst_val = modis_value.get('LST_C')
                            if lst_val is not None:
                                values.append(float(lst_val))
                                weights.append(modis_count)
                    except Exception as modis_error:
                        print(f'[WARNING] Month {month_start.strftime("%Y-%m")}: Error processing MODIS: {str(modis_error)}')
                
                if not values:
                    print(f'[WARNING] Month {month_start.strftime("%Y-%m")}: No valid LST values from any source')
                    return None
                
                # Calculate weighted average if we have multiple sources
                if len(values) > 1:
                    total_weight = sum(weights)
                    weighted_value = sum(v * w for v, w in zip(values, weights)) / total_weight
                    print(f'[DEBUG] Month {month_start.strftime("%Y-%m")}: Weighted average from {len(values)} sources (weights: {weights})')
                else:
                    weighted_value = values[0]
                
                print(f'[DEBUG] Month {month_start.strftime("%Y-%m")}: LST value = {weighted_value:.2f}°C')
                return {
                    'month': month_start.strftime('%Y-%m'),
                    'value': round(weighted_value, 2)
                }
            except Exception as e:
                print(f'Error processing month {start_dt_py.strftime("%Y-%m")}: {str(e)}')
                return None

        # Iterate months
        series = []
        cursor = start_dt.replace(day=1)
        max_iterations = 120
        iteration = 0
        
        while cursor <= end_dt and iteration < max_iterations:
            try:
                entry = month_entry(cursor)
                if entry is not None:
                    series.append(entry)
            except Exception as month_error:
                print(f'Skipping month {cursor.strftime("%Y-%m")}: {str(month_error)}')
                pass
            
            # Increment one month
            if cursor.month == 12:
                cursor = cursor.replace(year=cursor.year + 1, month=1, day=1)
            else:
                cursor = cursor.replace(month=cursor.month + 1, day=1)
            iteration += 1

        result = { 'series': series }
        if DB_AVAILABLE:
            result['source'] = 'gee'
        return result
    except HTTPException as he:
        raise he
    except Exception as e:
        import traceback
        print('Error in get_lst_monthly:', e)
        print(traceback.format_exc())
        return { 'series': [], 'source': 'none' }


def load_panel_feature_collection():
    try:
        with open(POLYGONS_PATH_STR, 'r') as f:
            geojson_data = json.load(f)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error loading polygons file: {str(exc)}")

    features = []
    panel_ids = []
    for feature in geojson_data.get('features', []):
        panel_id = feature.get('properties', {}).get('panel_id')
        geometry = feature.get('geometry')
        if panel_id is None or geometry is None:
            continue

        if geometry.get('type') == 'Polygon':
            coords = geometry.get('coordinates', [])
            if coords and len(coords) > 0:
                ring = coords[0]
                if len(ring) < 3:
                    continue
                if not all(len(coord) >= 2 for coord in ring):
                    continue

        try:
            ee_geom = ee.Geometry(geometry)
        except Exception:
            continue
        features.append(ee.Feature(ee_geom, {'panel_id': panel_id}))
        panel_ids.append(panel_id)

    if not features:
        raise HTTPException(status_code=500, detail="No valid panel polygons available.")

    polygons_fc = ee.FeatureCollection(features)
    return polygons_fc, panel_ids


def create_ring_feature_collection(polygons_fc, buffer_meters=30):
    def build_ring(feature):
        geom = feature.geometry()
        buffered = geom.buffer(buffer_meters)
        ring = buffered.difference(geom)
        ring_area = ee.Number(ring.area(1))
        safe_ring = ee.Geometry(ee.Algorithms.If(ring_area.lte(0), buffered, ring))
        panel_id = feature.get('panel_id')
        return ee.Feature(safe_ring, {'panel_id': panel_id})

    return polygons_fc.map(build_ring)


def reduce_image_to_panels(image, polygons_fc, scale, band_names=None):
    if image is None:
        return []
    target_image = image.select(band_names) if band_names else image
    reduced = target_image.reduceRegions(
        collection=polygons_fc,
        reducer=ee.Reducer.mean(),
        scale=scale,
        maxPixels=1e13,
        tileScale=4,
    )
    try:
        data = reduced.getInfo()
        return data.get('features', [])
    except Exception as error:
        print(f"[ERROR] reduce_image_to_panels failed: {error}")
        return []


def features_to_value_map(features, value_field, unit, precision, extra_fields=None):
    results = {}
    extra_fields = extra_fields or []
    for feature in features:
        props = feature.get('properties', {})
        panel_id = props.get('panel_id')
        if panel_id is None:
            continue
        raw_value = props.get(value_field)
        if raw_value is None:
            continue
        try:
            numeric_value = round(float(raw_value), precision)
        except (TypeError, ValueError):
            continue
        entry = {'value': numeric_value, 'unit': unit}
        for field in extra_fields:
            if props.get(field) is not None:
                entry[field] = props.get(field)
        results[str(panel_id)] = entry
    return results


def aggregate_lst_snapshot(polygons_fc, start_date, end_date):
    aoi = polygons_fc.geometry().bounds()
    landsat_collection = get_landsat_lst_collection(aoi, start_date, end_date)
    modis_collection = get_modis_lst_collection(aoi, start_date, end_date)
    all_collections = [coll for coll in [landsat_collection, modis_collection] if coll is not None]
    if not all_collections:
        return {}
    if len(all_collections) == 1:
        lst_collection = all_collections[0].select('LST_C').map(lambda img: img.toFloat())
    else:
        normalized_collections = [
            coll.select('LST_C').map(lambda img: img.toFloat()) for coll in all_collections
        ]
        lst_collection = normalized_collections[0]
        for coll in normalized_collections[1:]:
            lst_collection = lst_collection.merge(coll)
    count = lst_collection.size().getInfo()
    if count == 0:
        return {}
    latest_image = lst_collection.sort('system:time_start', False).first()
    features = reduce_image_to_panels(latest_image.select(['LST_C']), polygons_fc, 30)
    return features_to_value_map(
        features,
        'LST_C',
        PANEL_PARAMETER_CONFIG['LST']['unit'],
        PANEL_PARAMETER_CONFIG['LST']['precision'],
    )


def aggregate_swir_snapshot(polygons_fc, start_date, end_date):
    farm_geometry = polygons_fc.geometry()
    s2_collection = (
        ee.ImageCollection('COPERNICUS/S2_SR')
        .filterDate(start_date, end_date)
        .filterBounds(farm_geometry)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
        .select('B11')
    )
    count = s2_collection.size().getInfo()
    if count == 0:
        return {}
    median_img = s2_collection.median().select(['B11'], ['SWIR'])
    features = reduce_image_to_panels(median_img, polygons_fc, 10, ['SWIR'])
    return features_to_value_map(
        features,
        'SWIR',
        PANEL_PARAMETER_CONFIG['SWIR']['unit'],
        PANEL_PARAMETER_CONFIG['SWIR']['precision'],
    )


def aggregate_ndvi_snapshot(polygons_fc, start_date, end_date):
    farm_geometry = polygons_fc.geometry()
    s2_collection = (
        ee.ImageCollection('COPERNICUS/S2_SR')
        .filterDate(start_date, end_date)
        .filterBounds(farm_geometry)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
        .select(['B4', 'B8'])
    )
    count = s2_collection.size().getInfo()
    if count == 0:
        return {}

    def add_ndvi(img):
        ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI')
        return ndvi.copyProperties(img, ['system:time_start'])

    ndvi_collection = s2_collection.map(add_ndvi)
    mean_ndvi = ndvi_collection.mean()
    ring_fc = create_ring_feature_collection(polygons_fc)
    features = reduce_image_to_panels(mean_ndvi, ring_fc, 10, ['NDVI'])
    return features_to_value_map(
        features,
        'NDVI',
        PANEL_PARAMETER_CONFIG['NDVI']['unit'],
        PANEL_PARAMETER_CONFIG['NDVI']['precision'],
    )


def aggregate_ndwi_snapshot(polygons_fc, start_date, end_date):
    farm_geometry = polygons_fc.geometry()
    s2_collection = (
        ee.ImageCollection('COPERNICUS/S2_SR')
        .filterDate(start_date, end_date)
        .filterBounds(farm_geometry)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
        .select(['B3', 'B8'])
    )
    count = s2_collection.size().getInfo()
    if count == 0:
        return {}

    def add_ndwi(img):
        ndwi = img.normalizedDifference(['B3', 'B8']).rename('NDWI')
        return ndwi.copyProperties(img, ['system:time_start'])

    ndwi_collection = s2_collection.map(add_ndwi)
    mean_ndwi = ndwi_collection.mean()
    features = reduce_image_to_panels(mean_ndwi, polygons_fc, 10, ['NDWI'])
    return features_to_value_map(
        features,
        'NDWI',
        PANEL_PARAMETER_CONFIG['NDWI']['unit'],
        PANEL_PARAMETER_CONFIG['NDWI']['precision'],
    )


def aggregate_visible_snapshot(polygons_fc, start_date, end_date):
    farm_geometry = polygons_fc.geometry()
    s2_collection = (
        ee.ImageCollection('COPERNICUS/S2_SR')
        .filterDate(start_date, end_date)
        .filterBounds(farm_geometry)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
        .select(['B2', 'B3', 'B4'])
    )
    count = s2_collection.size().getInfo()
    if count == 0:
        return {}

    def add_vis_mean(img):
        vis = img.expression(
            '((B2 + B3 + B4) / 3)',
            {'B2': img.select('B2'), 'B3': img.select('B3'), 'B4': img.select('B4')},
        ).rename('VISIBLE')
        return vis.copyProperties(img, ['system:time_start'])

    vis_collection = s2_collection.map(add_vis_mean)
    median_vis = vis_collection.median()
    features = reduce_image_to_panels(median_vis, polygons_fc, 10, ['VISIBLE'])
    return features_to_value_map(
        features,
        'VISIBLE',
        PANEL_PARAMETER_CONFIG['VISIBLE']['unit'],
        PANEL_PARAMETER_CONFIG['VISIBLE']['precision'],
    )


def aggregate_soiling_snapshot(polygons_fc, start_date, end_date):
    year = start_date[:4]
    baseline_start = f"{year}-01-01"
    baseline_end = f"{year}-03-31"
    current_start = f"{year}-04-01"

    farm_geometry = polygons_fc.geometry()

    s2_baseline = (
        ee.ImageCollection('COPERNICUS/S2_SR')
        .select(['B2', 'B4', 'B8'])
        .filterDate(baseline_start, baseline_end)
        .filterBounds(farm_geometry)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
    )

    s2_current = (
        ee.ImageCollection('COPERNICUS/S2_SR')
        .select(['B2', 'B4', 'B8'])
        .filterDate(current_start, end_date)
        .filterBounds(farm_geometry)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
    )

    baseline_count = s2_baseline.size().getInfo()
    current_count = s2_current.size().getInfo()
    if baseline_count == 0 or current_count == 0:
        return {}

    def make_si(img):
        return img.expression(
            '(B2 + B4) / (B8 + 0.0001)',
            {'B2': img.select('B2'), 'B4': img.select('B4'), 'B8': img.select('B8')},
        ).rename('SI')

    baseline_si = make_si(s2_baseline.median()).rename('baseline_si')
    current_si = make_si(s2_current.median()).rename('current_si')
    drop = (
        baseline_si.subtract(current_si)
        .divide(baseline_si.add(1e-6))
        .multiply(100)
        .rename('soiling_drop_percent')
    )
    combined = baseline_si.addBands(current_si).addBands(drop)
    features = reduce_image_to_panels(
        combined, polygons_fc, 10, ['baseline_si', 'current_si', 'soiling_drop_percent']
    )

    results = {}
    precision = PANEL_PARAMETER_CONFIG['SOILING']['precision']
    for feature in features:
        props = feature.get('properties', {})
        panel_id = props.get('panel_id')
        if panel_id is None:
            continue
        drop_value = props.get('soiling_drop_percent')
        if drop_value is None:
            continue
        baseline_value = props.get('baseline_si')
        current_value = props.get('current_si')
        entry = {
            'value': round(float(drop_value), precision),
            'unit': PANEL_PARAMETER_CONFIG['SOILING']['unit'],
            'baseline_si': round(float(baseline_value), 4) if baseline_value is not None else None,
            'current_si': round(float(current_value), 4) if current_value is not None else None,
            'status': 'needs_cleaning' if abs(float(drop_value)) > 15 else 'clean',
        }
        results[str(panel_id)] = entry
    return results


PARAMETER_AGGREGATORS = {
    'LST': aggregate_lst_snapshot,
    'SWIR': aggregate_swir_snapshot,
    'SOILING': aggregate_soiling_snapshot,
    'NDVI': aggregate_ndvi_snapshot,
    'NDWI': aggregate_ndwi_snapshot,
    'VISIBLE': aggregate_visible_snapshot,
}


def compute_parameter_snapshot(parameter, start_date, end_date):
    polygons_fc, panel_ids = load_panel_feature_collection()
    aggregator = PARAMETER_AGGREGATORS.get(parameter)
    if aggregator is None:
        raise HTTPException(status_code=400, detail=f"Unsupported parameter {parameter}")
    values = aggregator(polygons_fc, start_date, end_date)
    precision = PANEL_PARAMETER_CONFIG[parameter]['precision']
    stats = build_value_stats(values, precision)
    payload = {
        'parameter': parameter,
        'unit': PANEL_PARAMETER_CONFIG[parameter]['unit'],
        'start_date': start_date,
        'end_date': end_date,
        'panel_total': len(panel_ids),
        'value_count': len(values),
        'values': values,
        'stats': stats,
        'generated_at': datetime.utcnow().isoformat() + 'Z',
    }
    return payload


@router.get("/api/panel-parameter-snapshot")
async def get_panel_parameter_snapshot(parameter: str, start_date: str, end_date: str, force_refresh: bool = False):
    if not parameter:
        raise HTTPException(status_code=400, detail="Parameter is required.")
    normalized_parameter = parameter.strip().upper()
    if normalized_parameter not in PANEL_PARAMETER_CONFIG:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid parameter. Use one of: {', '.join(PANEL_PARAMETER_CONFIG.keys())}",
        )
    normalized_start, normalized_end = normalize_date_range(start_date, end_date)
    cache_path = build_snapshot_cache_path(normalized_parameter, normalized_start, normalized_end)
    if not force_refresh:
        cached = load_cached_snapshot(cache_path)
        if cached:
            return cached
    payload = compute_parameter_snapshot(normalized_parameter, normalized_start, normalized_end)
    save_snapshot_cache(cache_path, payload)
    return payload
