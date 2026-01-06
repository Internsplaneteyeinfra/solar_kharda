import os
import json
import math
import statistics
import time
import hashlib
from pathlib import Path

import ee
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime, timedelta
import dotenv

# Import database module
try:
    from database import (
        init_database, get_timeseries_data, get_soiling_data,
        get_monthly_lst, check_data_availability, get_data_statistics
    )
    DB_AVAILABLE = True
except ImportError:
    DB_AVAILABLE = False
    print("Warning: Database module not available. API will only use GEE.")

# Load environment variables
dotenv.load_dotenv()

app = FastAPI(title="Solar Farm Dashboard API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173","*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Earth Engine
try:
    credentials_path = os.path.join(os.path.dirname(__file__), "credentials.json")
    if os.path.exists(credentials_path):
        # Load from credentials.json file
        with open(credentials_path, 'r') as f:
            creds_dict = json.load(f)
        credentials = ee.ServiceAccountCredentials(
            email=creds_dict.get("client_email"),
            key_data=creds_dict.get("private_key")
        )
        ee.Initialize(credentials)
    elif os.getenv("GEE_CLIENT_EMAIL") and os.getenv("GEE_PRIVATE_KEY"):
        # Try with env vars
        credentials = ee.ServiceAccountCredentials(
            email=os.getenv("GEE_CLIENT_EMAIL"),
            key_data=os.getenv("GEE_PRIVATE_KEY").replace("\\n", "\n")
        )
        ee.Initialize(credentials)
    else:
        print("Warning: No credentials found. Please set up GEE credentials.")
    print("Earth Engine initialized successfully")
except Exception as e:
    print(f"Error initializing Earth Engine: {e}")

# Load polygons - using absolute path to asset directory
BASE_DIR = Path(__file__).resolve().parent
POLYGONS_PATH = BASE_DIR.parent / "asset" / "solar_panel_polygons.geojson"
# Convert to string for compatibility
POLYGONS_PATH = str(POLYGONS_PATH)

# Verify polygons file exists
if not os.path.exists(POLYGONS_PATH):
    print(f"WARNING: Polygons file not found at: {POLYGONS_PATH}")
    print(f"Please ensure the GeoJSON file exists in the asset directory.")
else:
    print(f"Polygons file loaded from: {POLYGONS_PATH}")

PANEL_SNAPSHOT_CACHE_DIR = BASE_DIR / "panel_snapshots"
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
    panel_id: int
    parameter: str  # "LST", "SWIR", "SOILING", "NDVI", "NDWI", "VISIBLE"
    start_date: str
    end_date: str

class TimeRangeQuery(BaseModel):
    start_date: str
    end_date: str

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

@app.get("/")
async def root():
    return {"message": "Solar Farm Dashboard API", "database_available": DB_AVAILABLE}

@app.on_event("startup")
async def startup_event():
    """Initialize database on startup."""
    if DB_AVAILABLE:
        try:
            init_database()
            print("Database initialized successfully")
        except Exception as e:
            print(f"Warning: Could not initialize database: {e}")

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

@app.get("/api/weather")
async def get_weather():
    """Get current weather data from Open-Meteo API, with GHI from Earth Engine"""
    try:
        # Get location from polygons (using first polygon center)
        with open(POLYGONS_PATH, 'r') as f:
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

@app.get("/polygons")
async def get_polygons():
    """Return the GeoJSON file with all polygons"""
    if os.path.exists(POLYGONS_PATH):
        return FileResponse(POLYGONS_PATH, media_type="application/json")
    raise HTTPException(status_code=404, detail="Polygons file not found")

@app.get("/api/database/stats")
async def get_database_stats():
    """Get database statistics"""
    if not DB_AVAILABLE:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        stats = get_data_statistics()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting database stats: {str(e)}")

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

@app.get("/api/all-panels-lst")
async def get_all_panels_lst(start_date: str, end_date: str):
    """Get LST values for all panels using Landsat 8 & 9 and MODIS with z-score hotspot detection"""
    try:
        # Validate date range
        try:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d')
            end_dt = datetime.strptime(end_date, '%Y-%m-%d')
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=f"Invalid date format. Use YYYY-MM-DD format. Error: {str(ve)}")
        
        if start_dt > end_dt:
            raise HTTPException(status_code=400, detail="start_date must be before or equal to end_date")
        
        # Ensure we have at least one day of range (same as panel-data endpoint)
        if (end_dt - start_dt).days < 1:
            end_dt = start_dt + timedelta(days=1)
            end_date = end_dt.strftime('%Y-%m-%d')
        
        print(f'[DEBUG] Processing LST for date range: {start_date} to {end_date} (no date capping - same as panel-data endpoint)')
        
        # Load polygons
        try:
            with open(POLYGONS_PATH, 'r') as f:
                geojson_data = json.load(f)
        except Exception as file_error:
            print(f'Error loading polygons file: {str(file_error)}')
            return {"panel_lst": {}, "panel_z_scores": {}, "global_stats": {"mean": None, "stddev": None}}
        
        # Create FeatureCollection from all polygons
        features_list = []
        try:
            for feature in geojson_data.get('features', []):
                try:
                    panel_id = feature.get('properties', {}).get('panel_id')
                    if panel_id is not None:
                        coords = feature['geometry']['coordinates'][0]
                        # Validate polygon has at least 3 points
                        if len(coords) < 3:
                            print(f'[WARNING] Skipping panel {panel_id}: polygon has less than 3 points ({len(coords)} points)')
                            continue
                        # Validate coordinates are valid
                        if not all(len(coord) >= 2 for coord in coords):
                            print(f'[WARNING] Skipping panel {panel_id}: invalid coordinates')
                            continue
                        ee_polygon = ee.Geometry.Polygon(coords)
                        feat = ee.Feature(ee_polygon, {'panel_id': panel_id})
                        features_list.append(feat)
                except Exception as feat_error:
                    print(f'[WARNING] Error processing polygon feature: {str(feat_error)}')
                    continue
        except Exception as poly_error:
            print(f'Error processing polygons: {str(poly_error)}')
            return {"panel_lst": {}, "panel_z_scores": {}, "global_stats": {"mean": None, "stddev": None}}
        
        if not features_list:
            return {"panel_lst": {}, "panel_z_scores": {}, "global_stats": {"mean": None, "stddev": None}}
        
        try:
            polygons_fc = ee.FeatureCollection(features_list)
            
            # Get AOI bounds
            aoi = polygons_fc.geometry().bounds()
            
            # Get Landsat 8 & 9 collection
            landsat_collection = get_landsat_lst_collection(aoi, start_date, end_date)
            
            # Get MODIS collection
            modis_collection = get_modis_lst_collection(aoi, start_date, end_date)
            
            # Merge both collections (if available)
            all_collections = []
            if landsat_collection is not None:
                all_collections.append(landsat_collection)
            if modis_collection is not None:
                all_collections.append(modis_collection)
            
            if not all_collections:
                print(f'[WARNING] No LST collections available for date range {start_date} to {end_date}')
                return {"panel_lst": {}, "panel_z_scores": {}, "global_stats": {"mean": None, "stddev": None}}
            
            # Merge all available collections
            # Ensure both collections have compatible types by selecting LST_C band and casting to float
            if len(all_collections) == 1:
                # Cast each image in the collection to float
                lst_collection = all_collections[0].select('LST_C').map(lambda img: img.toFloat())
            else:
                # Cast all collections to float before merging to avoid type incompatibility
                normalized_collections = [
                    coll.select('LST_C').map(lambda img: img.toFloat()) 
                    for coll in all_collections
                ]
                lst_collection = normalized_collections[0]
                for coll in normalized_collections[1:]:
                    lst_collection = lst_collection.merge(coll)
            
            # Check if collection has images
            try:
                count = lst_collection.size().getInfo()
                # Safely get counts for each source
                landsat_count = 0
                modis_count = 0
                if landsat_collection is not None:
                    try:
                        landsat_count = landsat_collection.size().getInfo()
                    except:
                        pass
                if modis_collection is not None:
                    try:
                        modis_count = modis_collection.size().getInfo()
                    except:
                        pass
                print(f'[DEBUG] Total LST collection size: {count} images (Landsat: {landsat_count}, MODIS: {modis_count}) for date range {start_date} to {end_date}')
            except Exception as count_error:
                print(f'[ERROR] Error getting collection size: {str(count_error)}')
                import traceback
                print(f'[ERROR] Traceback: {traceback.format_exc()}')
                return {"panel_lst": {}, "panel_z_scores": {}, "global_stats": {"mean": None, "stddev": None}}
            
            if count == 0:
                print(f'[INFO] No images found in collection for date range {start_date} to {end_date}')
                return {"panel_lst": {}, "panel_z_scores": {}, "global_stats": {"mean": None, "stddev": None}}
            
            # Use median composite - gives more data points by combining multiple images
            # Median is more robust than mean and gives better coverage
            median_lst = lst_collection.median().select('LST_C')
            
            # Calculate Mean LST for each panel using median composite
            try:
                panels_with_lst = median_lst.reduceRegions(
                    collection=polygons_fc,
                    reducer=ee.Reducer.mean(),
                    scale=30,
                    tileScale=4,
                    maxPixels=1e9,
                    bestEffort=True
                )
                print(f'[DEBUG] Using median composite for LST calculation (more data points than latest image)')
                
                # Get ALL panel data first (before filtering) to debug
                try:
                    all_panels_data = panels_with_lst.getInfo()
                    all_features = all_panels_data.get("features", [])
                    print(f'[DEBUG] Got {len(all_features)} total panels from reduceRegions (before filtering)')
                    
                    # Debug: Check what properties we have
                    if len(all_features) > 0:
                        first_feat_all = all_features[0]
                        props_all = first_feat_all.get("properties", {})
                        print(f'[DEBUG] First panel (all data) - properties keys: {list(props_all.keys())}')
                        print(f'[DEBUG] First panel (all data) - panel_id: {props_all.get("panel_id")}, mean: {props_all.get("mean")}')
                        # Check a few more to see if mean is null for all
                        null_count = 0
                        for i, feat in enumerate(all_features[:10]):
                            mean_val = feat.get("properties", {}).get("mean")
                            if mean_val is None:
                                null_count += 1
                        print(f'[DEBUG] First 10 panels - {null_count} have null mean, {10 - null_count} have values')
                except Exception as all_data_error:
                    print(f'[ERROR] Error getting all panels data: {str(all_data_error)}')
                    import traceback
                    print(f'[ERROR] Traceback: {traceback.format_exc()}')
                
                # Filter out nulls
                panels_with_lst_filtered = panels_with_lst.filter(ee.Filter.notNull(['mean']))
                
                # Get filtered panel data
                try:
                    panels_data = panels_with_lst_filtered.getInfo()
                    features_list = panels_data.get("features", [])
                    print(f'[DEBUG] Got {len(features_list)} panels with non-null LST data from reduceRegions (after filtering)')
                    
                    # Debug: print first feature structure if available
                    if len(features_list) > 0:
                        first_feat = features_list[0]
                        props = first_feat.get("properties", {})
                        print(f'[DEBUG] First panel (filtered) - properties: {props}')
                    else:
                        print(f'[WARNING] All panels have null mean values after reduceRegions!')
                        # Try processing without filtering to see if we can get any data
                        print(f'[DEBUG] Attempting to process without null filtering...')
                        features_list = all_features
                except Exception as data_error:
                    print(f'[ERROR] Error getting panels data: {str(data_error)}')
                    import traceback
                    print(f'[ERROR] Traceback: {traceback.format_exc()}')
                    return {"panel_lst": {}, "panel_z_scores": {}, "global_stats": {"mean": None, "stddev": None}}
                
                # Process panel data first to get values
                panel_lst_data = {}
                panel_values = []
                
                for idx, feat in enumerate(features_list):
                    try:
                        props = feat.get('properties', {})
                        panel_id = props.get('panel_id')
                        # Try both 'mean' and 'LST_C' property names (reduceRegions might use band name)
                        mean_lst_val = props.get('mean') or props.get('LST_C')
                        
                        # Only log first few for debugging
                        if idx < 5:
                            print(f'[DEBUG] Feature {idx}: panel_id={panel_id}, mean={mean_lst_val}, all_props={list(props.keys())}')
                            print(f'[DEBUG] Feature {idx} property values: mean={props.get("mean")}, LST_C={props.get("LST_C")}')
                        
                        # Handle both string and numeric panel_ids
                        if panel_id is not None:
                            panel_id_str = str(panel_id)  # Convert to string for consistency
                            if mean_lst_val is not None:
                                panel_lst_data[panel_id_str] = round(mean_lst_val, 2)
                                panel_values.append(mean_lst_val)
                                if idx < 5:
                                    print(f'[DEBUG] Panel {panel_id_str}: LST = {round(mean_lst_val, 2)}°C')
                            else:
                                if idx < 5:
                                    print(f'[WARNING] Panel {panel_id_str} has null mean value (checked both "mean" and "LST_C")')
                        else:
                            if idx < 5:
                                print(f'[WARNING] Feature {idx} has no panel_id')
                    except Exception as panel_error:
                        print(f'[ERROR] Error processing panel data at index {idx}: {str(panel_error)}')
                        import traceback
                        print(f'[ERROR] Traceback: {traceback.format_exc()}')
                        continue
                
                print(f'[DEBUG] Processed {len(panel_lst_data)} panels with valid LST values')
                
                # Calculate global statistics from the values we collected
                if len(panel_values) > 0:
                    import statistics
                    global_mean = statistics.mean(panel_values)
                    global_stddev = statistics.stdev(panel_values) if len(panel_values) > 1 else 0.0
                    print(f'[DEBUG] Global stats - Mean: {round(global_mean, 2)}°C, StdDev: {round(global_stddev, 2)}°C')
                    
                    # Calculate z-scores
                    panel_z_scores = {}
                    if global_stddev > 0:
                        for panel_id, mean_lst_val in panel_lst_data.items():
                            z_score = (mean_lst_val - global_mean) / global_stddev
                            panel_z_scores[panel_id] = round(z_score, 3)
                    else:
                        print(f'[WARNING] StdDev is 0, cannot calculate z-scores')
                else:
                    print(f'[WARNING] No panel values found - cannot calculate stats')
                    global_mean = None
                    global_stddev = None
                    panel_z_scores = {}
                
                return {
                    "panel_lst": panel_lst_data,
                    "panel_z_scores": panel_z_scores,
                    "global_stats": {
                        "mean": round(global_mean, 2) if global_mean else None,
                        "stddev": round(global_stddev, 2) if global_stddev else None
                    }
                }
            except Exception as reduce_error:
                print(f'[ERROR] Error in reduceRegions: {str(reduce_error)}')
                import traceback
                print(f'[ERROR] Traceback: {traceback.format_exc()}')
                return {"panel_lst": {}, "panel_z_scores": {}, "global_stats": {"mean": None, "stddev": None}}
        except Exception as ee_error:
            print(f'[ERROR] Error in Earth Engine operations: {str(ee_error)}')
            import traceback
            print(f'[ERROR] Traceback: {traceback.format_exc()}')
            return {"panel_lst": {}, "panel_z_scores": {}, "global_stats": {"mean": None, "stddev": None}}
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error in get_all_panels_lst: {str(e)}")
        print(f"Traceback: {error_details}")
        # Return empty data instead of 500 error to prevent frontend errors
        return {
            "panel_lst": {},
            "panel_z_scores": {},
            "global_stats": {
                "mean": None,
                "stddev": None
            }
        }

def load_panel_feature_collection():
    try:
        with open(POLYGONS_PATH, 'r') as f:
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
        
        # Validate polygon geometry before creating EE geometry
        if geometry.get('type') == 'Polygon':
            coords = geometry.get('coordinates', [])
            if coords and len(coords) > 0:
                ring = coords[0]  # First ring (exterior ring)
                if len(ring) < 3:
                    print(f"[WARNING] Skipping panel {panel_id}: polygon has less than 3 points ({len(ring)} points)")
                    continue
                if not all(len(coord) >= 2 for coord in ring):
                    print(f"[WARNING] Skipping panel {panel_id}: invalid coordinates")
                    continue
        
        try:
            ee_geom = ee.Geometry(geometry)
        except Exception as geom_error:
            print(f"[WARNING] Error creating geometry for panel {panel_id}: {geom_error}")
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
        tileScale=4
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
    # Ensure both collections have compatible types by selecting LST_C band and casting to float
    if len(all_collections) == 1:
        # Cast each image in the collection to float
        lst_collection = all_collections[0].select('LST_C').map(lambda img: img.toFloat())
    else:
        # Cast all collections to float before merging to avoid type incompatibility
        normalized_collections = [
            coll.select('LST_C').map(lambda img: img.toFloat()) 
            for coll in all_collections
        ]
        lst_collection = normalized_collections[0]
        for coll in normalized_collections[1:]:
            lst_collection = lst_collection.merge(coll)
    count = lst_collection.size().getInfo()
    if count == 0:
        return {}
    latest_image = lst_collection.sort('system:time_start', False).first()
    features = reduce_image_to_panels(latest_image.select(['LST_C']), polygons_fc, 30)
    return features_to_value_map(features, 'LST_C', PANEL_PARAMETER_CONFIG['LST']['unit'], PANEL_PARAMETER_CONFIG['LST']['precision'])

def aggregate_swir_snapshot(polygons_fc, start_date, end_date):
    farm_geometry = polygons_fc.geometry()
    s2_collection = ee.ImageCollection("COPERNICUS/S2_SR") \
        .filterDate(start_date, end_date) \
        .filterBounds(farm_geometry) \
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
        .select('B11')
    count = s2_collection.size().getInfo()
    if count == 0:
        return {}
    median_img = s2_collection.median().select(['B11'], ['SWIR'])
    features = reduce_image_to_panels(median_img, polygons_fc, 10, ['SWIR'])
    return features_to_value_map(features, 'SWIR', PANEL_PARAMETER_CONFIG['SWIR']['unit'], PANEL_PARAMETER_CONFIG['SWIR']['precision'])

def aggregate_ndvi_snapshot(polygons_fc, start_date, end_date):
    farm_geometry = polygons_fc.geometry()
    s2_collection = ee.ImageCollection('COPERNICUS/S2_SR') \
        .filterDate(start_date, end_date) \
        .filterBounds(farm_geometry) \
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
        .select(['B4', 'B8'])
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
    return features_to_value_map(features, 'NDVI', PANEL_PARAMETER_CONFIG['NDVI']['unit'], PANEL_PARAMETER_CONFIG['NDVI']['precision'])

def aggregate_ndwi_snapshot(polygons_fc, start_date, end_date):
    farm_geometry = polygons_fc.geometry()
    s2_collection = ee.ImageCollection('COPERNICUS/S2_SR') \
        .filterDate(start_date, end_date) \
        .filterBounds(farm_geometry) \
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
        .select(['B3', 'B8'])
    count = s2_collection.size().getInfo()
    if count == 0:
        return {}
    def add_ndwi(img):
        ndwi = img.normalizedDifference(['B3', 'B8']).rename('NDWI')
        return ndwi.copyProperties(img, ['system:time_start'])
    ndwi_collection = s2_collection.map(add_ndwi)
    mean_ndwi = ndwi_collection.mean()
    features = reduce_image_to_panels(mean_ndwi, polygons_fc, 10, ['NDWI'])
    return features_to_value_map(features, 'NDWI', PANEL_PARAMETER_CONFIG['NDWI']['unit'], PANEL_PARAMETER_CONFIG['NDWI']['precision'])

def aggregate_visible_snapshot(polygons_fc, start_date, end_date):
    farm_geometry = polygons_fc.geometry()
    s2_collection = ee.ImageCollection('COPERNICUS/S2_SR') \
        .filterDate(start_date, end_date) \
        .filterBounds(farm_geometry) \
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
        .select(['B2', 'B3', 'B4'])
    count = s2_collection.size().getInfo()
    if count == 0:
        return {}
    def add_vis_mean(img):
        vis = img.expression('((B2 + B3 + B4) / 3)', {
            'B2': img.select('B2'),
            'B3': img.select('B3'),
            'B4': img.select('B4')
        }).rename('VISIBLE')
        return vis.copyProperties(img, ['system:time_start'])
    vis_collection = s2_collection.map(add_vis_mean)
    median_vis = vis_collection.median()
    features = reduce_image_to_panels(median_vis, polygons_fc, 10, ['VISIBLE'])
    return features_to_value_map(features, 'VISIBLE', PANEL_PARAMETER_CONFIG['VISIBLE']['unit'], PANEL_PARAMETER_CONFIG['VISIBLE']['precision'])

def aggregate_soiling_snapshot(polygons_fc, start_date, end_date):
    year = start_date[:4]
    baseline_start = f"{year}-01-01"
    baseline_end = f"{year}-03-31"
    current_start = f"{year}-04-01"

    farm_geometry = polygons_fc.geometry()

    s2_baseline = ee.ImageCollection('COPERNICUS/S2_SR') \
        .select(['B2', 'B4', 'B8']) \
        .filterDate(baseline_start, baseline_end) \
        .filterBounds(farm_geometry) \
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))

    s2_current = ee.ImageCollection('COPERNICUS/S2_SR') \
        .select(['B2', 'B4', 'B8']) \
        .filterDate(current_start, end_date) \
        .filterBounds(farm_geometry) \
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))

    baseline_count = s2_baseline.size().getInfo()
    current_count = s2_current.size().getInfo()
    if baseline_count == 0 or current_count == 0:
        return {}

    def make_si(img):
        return img.expression(
            '(B2 + B4) / (B8 + 0.0001)',
            {'B2': img.select('B2'), 'B4': img.select('B4'), 'B8': img.select('B8')}
        ).rename('SI')

    baseline_si = make_si(s2_baseline.median()).rename('baseline_si')
    current_si = make_si(s2_current.median()).rename('current_si')
    drop = baseline_si.subtract(current_si).divide(baseline_si.add(1e-6)).multiply(100).rename('soiling_drop_percent')
    combined = baseline_si.addBands(current_si).addBands(drop)
    features = reduce_image_to_panels(combined, polygons_fc, 10, ['baseline_si', 'current_si', 'soiling_drop_percent'])

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
            'status': 'needs_cleaning' if abs(float(drop_value)) > 15 else 'clean'
        }
        results[str(panel_id)] = entry
    return results

PARAMETER_AGGREGATORS = {
    'LST': aggregate_lst_snapshot,
    'SWIR': aggregate_swir_snapshot,
    'SOILING': aggregate_soiling_snapshot,
    'NDVI': aggregate_ndvi_snapshot,
    'NDWI': aggregate_ndwi_snapshot,
    'VISIBLE': aggregate_visible_snapshot
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
        'generated_at': datetime.utcnow().isoformat() + 'Z'
    }
    return payload

@app.get("/api/panel-parameter-snapshot")
async def get_panel_parameter_snapshot(parameter: str, start_date: str, end_date: str, force_refresh: bool = False):
    if not parameter:
        raise HTTPException(status_code=400, detail="Parameter is required.")
    normalized_parameter = parameter.strip().upper()
    if normalized_parameter not in PANEL_PARAMETER_CONFIG:
        raise HTTPException(status_code=400, detail=f"Invalid parameter. Use one of: {', '.join(PANEL_PARAMETER_CONFIG.keys())}")
    normalized_start, normalized_end = normalize_date_range(start_date, end_date)
    cache_path = build_snapshot_cache_path(normalized_parameter, normalized_start, normalized_end)
    if not force_refresh:
        cached = load_cached_snapshot(cache_path)
        if cached:
            return cached
    payload = compute_parameter_snapshot(normalized_parameter, normalized_start, normalized_end)
    save_snapshot_cache(cache_path, payload)
    return payload

@app.get("/api/lst-monthly")
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
            with open(POLYGONS_PATH, 'r') as f:
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
                                weights.append(landsat_count)  # Weight by number of images
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
                                weights.append(modis_count)  # Weight by number of images
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
                # Silently skip months with errors
                print(f'Error processing month {start_dt_py.strftime("%Y-%m")}: {str(e)}')
                return None

        # Iterate months
        series = []
        cursor = start_dt.replace(day=1)
        max_iterations = 120  # Prevent infinite loops (10 years max)
        iteration = 0
        
        while cursor <= end_dt and iteration < max_iterations:
            try:
                entry = month_entry(cursor)
                if entry is not None:
                    series.append(entry)
            except Exception as month_error:
                # Silently skip months with errors (e.g., no data available)
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
        # Re-raise HTTP exceptions (400, etc.)
        raise he
    except Exception as e:
        import traceback
        print('Error in get_lst_monthly:', e)
        print(traceback.format_exc())
        # Return empty series instead of 500 error to prevent frontend errors
        return { 'series': [], 'source': 'none' }

@app.post("/api/panel-data")
async def get_panel_data(query: PanelQuery):
    """Get historical data for a specific panel"""
    try:
        # Validate date range
        try:
            start_dt = datetime.strptime(query.start_date, '%Y-%m-%d')
            end_dt = datetime.strptime(query.end_date, '%Y-%m-%d')
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=f"Invalid date format. Use YYYY-MM-DD format. Error: {str(ve)}")
        
        # Check if start_date is after end_date
        if start_dt > end_dt:
            raise HTTPException(status_code=400, detail="start_date must be before or equal to end_date")
        
        # Check if dates are the same - Earth Engine doesn't support same-day ranges
        # Add one day to end_date if they're the same
        if start_dt == end_dt:
            end_dt = end_dt + timedelta(days=1)
            query.end_date = end_dt.strftime('%Y-%m-%d')
        
        # Ensure minimum date range (at least 1 day difference)
        if (end_dt - start_dt).days < 1:
            end_dt = start_dt + timedelta(days=1)
            query.end_date = end_dt.strftime('%Y-%m-%d')
        
        # Load polygons
        try:
            with open(POLYGONS_PATH, 'r') as f:
                geojson_data = json.load(f)
        except Exception as file_error:
            raise HTTPException(status_code=500, detail=f"Error loading polygons file: {str(file_error)}")
        
        # Find the polygon with matching panel_id
        target_polygon = None
        try:
            for feature in geojson_data.get('features', []):
                if feature.get('properties', {}).get('panel_id') == query.panel_id:
                    target_polygon = feature
                    break
        except Exception as search_error:
            raise HTTPException(status_code=500, detail=f"Error searching for panel: {str(search_error)}")
        
        if not target_polygon:
            raise HTTPException(status_code=404, detail=f"Panel {query.panel_id} not found")
        
        # Convert polygon to EE geometry
        try:
            coords = target_polygon['geometry']['coordinates'][0]
            # Validate polygon has at least 3 points
            if len(coords) < 3:
                raise HTTPException(status_code=400, detail=f"Panel {query.panel_id} has invalid geometry: polygon requires at least 3 points, found {len(coords)}")
            # Validate coordinates are valid
            if not all(len(coord) >= 2 for coord in coords):
                raise HTTPException(status_code=400, detail=f"Panel {query.panel_id} has invalid geometry: coordinates must have at least 2 values (x, y)")
            ee_polygon = ee.Geometry.Polygon(coords)
        except HTTPException:
            raise
        except Exception as geom_error:
            raise HTTPException(status_code=500, detail=f"Error creating polygon geometry: {str(geom_error)}")
        
        try:
            # Try to get data from database first (if available)
            if DB_AVAILABLE:
                if query.parameter == "SOILING":
                    # For soiling, check if we have data in the database
                    db_data = get_soiling_data(query.panel_id, query.end_date)
                    if db_data:
                        return {
                            'parameter': 'SOILING',
                            'baseline_si': db_data.get('baseline_si', 0),
                            'current_si': db_data.get('current_si', 0),
                            'soiling_drop_percent': db_data.get('soiling_drop_percent', 0),
                            'unit': db_data.get('unit', '%'),
                            'status': db_data.get('status', 'clean')
                        }
                elif query.parameter in ['LST', 'SWIR', 'NDVI', 'NDWI', 'VISIBLE']:
                    # Check if we have time series data in database
                    if check_data_availability(query.panel_id, query.parameter, query.start_date, query.end_date):
                        timeseries = get_timeseries_data(query.panel_id, query.parameter, query.start_date, query.end_date)
                        if timeseries:
                            # Get current value (latest in series)
                            current_value = timeseries[-1]['value'] if timeseries else 0
                            unit = timeseries[0]['unit'] if timeseries else '°C'
                            
                            return {
                                'parameter': query.parameter,
                                'current_value': current_value,
                                'unit': unit,
                                'timeseries': timeseries,
                                'source': 'database'
                            }
            
            # Fall back to fetching from GEE
            if query.parameter == "LST":
                result = await get_lst_data(ee_polygon, query.start_date, query.end_date)
                if DB_AVAILABLE:
                    result['source'] = 'gee'
                return result
            elif query.parameter == "SWIR":
                result = await get_swir_data(ee_polygon, query.start_date, query.end_date)
                if DB_AVAILABLE:
                    result['source'] = 'gee'
                return result
            elif query.parameter == "SOILING":
                result = await get_soiling_data(ee_polygon, query.start_date, query.end_date)
                if DB_AVAILABLE:
                    result['source'] = 'gee'
                return result
            elif query.parameter == "NDVI":
                result = await get_ndvi_data(ee_polygon, query.start_date, query.end_date)
                if DB_AVAILABLE:
                    result['source'] = 'gee'
                return result
            elif query.parameter == "NDWI":
                result = await get_ndwi_data(ee_polygon, query.start_date, query.end_date)
                if DB_AVAILABLE:
                    result['source'] = 'gee'
                return result
            elif query.parameter == "VISIBLE":
                result = await get_visible_mean_data(ee_polygon, query.start_date, query.end_date)
                if DB_AVAILABLE:
                    result['source'] = 'gee'
                return result
            else:
                raise HTTPException(status_code=400, detail="Invalid parameter. Use LST, SWIR, SOILING, NDVI, NDWI, or VISIBLE")
        except Exception as param_error:
            import traceback
            error_details = traceback.format_exc()
            error_msg = str(param_error)
            print(f"Error fetching {query.parameter} data: {error_msg}")
            print(f"Traceback: {error_details}")
            # If it's the "Empty date ranges" error, provide a better message
            if "Empty date ranges" in error_msg or "empty date" in error_msg.lower():
                raise HTTPException(status_code=400, detail=f"Invalid date range. Please ensure start_date is before end_date and there is at least one day difference.")
            raise HTTPException(status_code=500, detail=f"Error fetching {query.parameter} data: {error_msg}")
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        error_msg = str(e)
        print(f"Error in get_panel_data: {error_msg}")
        print(f"Traceback: {error_details}")
        if "Empty date ranges" in error_msg or "empty date" in error_msg.lower():
            raise HTTPException(status_code=400, detail=f"Invalid date range. Please ensure start_date is before end_date and there is at least one day difference.")
        raise HTTPException(status_code=500, detail=f"Internal server error: {error_msg}")

async def get_lst_data(polygon: ee.Geometry, start_date: str, end_date: str) -> Dict:
    """Get LST (Land Surface Temperature) data using Landsat 8 & 9 and MODIS"""
    try:
        # Get AOI bounds for filtering
        aoi = polygon.bounds()
        
        # Get Landsat collection
        landsat_collection = get_landsat_lst_collection(aoi, start_date, end_date)
        
        # Get MODIS collection
        modis_collection = get_modis_lst_collection(aoi, start_date, end_date)
        
        # Merge both collections (if available)
        all_collections = []
        if landsat_collection is not None:
            all_collections.append(landsat_collection)
        if modis_collection is not None:
            all_collections.append(modis_collection)
        
        if not all_collections:
            print(f"[WARNING] No LST collections available for date range {start_date} to {end_date}")
            return {
                'parameter': 'LST',
                'current_value': 0,
                'unit': '°C',
                'timeseries': []
            }
        
        # Merge all available collections
        # Ensure both collections have compatible types by selecting LST_C band and casting to float
        if len(all_collections) == 1:
            # Cast each image in the collection to float
            lst_collection = all_collections[0].select('LST_C').map(lambda img: img.toFloat())
        else:
            # Cast all collections to float before merging to avoid type incompatibility
            normalized_collections = [
                coll.select('LST_C').map(lambda img: img.toFloat()) 
                for coll in all_collections
            ]
            lst_collection = normalized_collections[0]
            for coll in normalized_collections[1:]:
                lst_collection = lst_collection.merge(coll)
        
        # Check if collection has images
        try:
            count = lst_collection.size().getInfo()
            # Safely get counts for each source
            landsat_count = 0
            modis_count = 0
            if landsat_collection is not None:
                try:
                    landsat_count = landsat_collection.size().getInfo()
                except:
                    pass
            if modis_collection is not None:
                try:
                    modis_count = modis_collection.size().getInfo()
                except:
                    pass
            print(f"[DEBUG] Total LST collection size: {count} images (Landsat: {landsat_count}, MODIS: {modis_count}) for date range {start_date} to {end_date}")
        except Exception as count_error:
            print(f"[ERROR] Error getting collection size: {str(count_error)}")
            import traceback
            print(f"[ERROR] Traceback: {traceback.format_exc()}")
            return {
                'parameter': 'LST',
                'current_value': 0,
                'unit': '°C',
                'timeseries': []
            }
        
        if count == 0:
            print(f"[INFO] No LST images found for date range {start_date} to {end_date}")
            return {
                'parameter': 'LST',
                'current_value': 0,
                'unit': '°C',
                'timeseries': []
            }
        
        # Get statistics - use 30m scale (Landsat resolution), MODIS will be resampled
        def reduce_image(img):
            date = ee.Date(img.get('system:time_start')).format('YYYY-MM-dd')
            mean = img.reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=polygon,
                scale=30,  # Use Landsat resolution (MODIS will be resampled)
                maxPixels=1e9,
                bestEffort=True
            )
            return ee.Feature(None, mean.set('date', date))
        
        features = lst_collection.map(reduce_image)
        
        # Get current value from latest image
        latest_img = lst_collection.sort('system:time_start', False).first()
        current_value = latest_img.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=polygon,
            scale=30,  # Use Landsat resolution
            maxPixels=1e9,
            bestEffort=True
        )
        
        # Export data
        try:
            timeseries_data = features.getInfo()
        except Exception as ts_error:
            print(f"[ERROR] Error getting timeseries data: {str(ts_error)}")
            import traceback
            print(f"[ERROR] Traceback: {traceback.format_exc()}")
            return {
                'parameter': 'LST',
                'current_value': 0,
                'unit': '°C',
                'timeseries': []
            }
        
        # Format response
        formatted_data = []
        for feature in timeseries_data.get('features', []):
            try:
                props = feature.get('properties', {})
                if 'LST_C' in props and props.get('LST_C') is not None:
                    formatted_data.append({
                        'date': props.get('date'),
                        'value': round(props.get('LST_C'), 2),
                        'unit': '°C'
                    })
            except Exception as feat_error:
                print(f"[ERROR] Error processing feature: {str(feat_error)}")
                continue
        
        # Prefer the latest value from the time series if available; fallback to region reduction
        sorted_series = sorted(formatted_data, key=lambda x: x['date'])
        current_from_series = sorted_series[-1]['value'] if sorted_series else None
        
        try:
            current_info = current_value.getInfo()
            current_from_reduce = round(current_info.get('LST_C'), 2) if current_info.get('LST_C') is not None else None
        except Exception as current_error:
            print(f"[ERROR] Error getting current value: {str(current_error)}")
            import traceback
            print(f"[ERROR] Traceback: {traceback.format_exc()}")
            current_from_reduce = None
        
        current = current_from_series if current_from_series is not None else (current_from_reduce if current_from_reduce is not None else None)
        
        print(f"[DEBUG] LST data: {len(sorted_series)} time series points, current value: {current}°C")
        
        return {
            'parameter': 'LST',
            'current_value': current,
            'unit': '°C',
            'timeseries': sorted_series
        }
    except Exception as e:
        import traceback
        print(f"[ERROR] Error in get_lst_data: {str(e)}")
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        # Return empty data instead of raising
        return {
            'parameter': 'LST',
            'current_value': 0,
            'unit': '°C',
            'timeseries': []
        }

async def get_swir_data(polygon: ee.Geometry, start_date: str, end_date: str) -> Dict:
    """Get SWIR (Shortwave Infrared) data"""
    try:
        s2_collection = ee.ImageCollection("COPERNICUS/S2_SR") \
            .filterDate(start_date, end_date) \
            .filterBounds(polygon) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
            .select('B11')
        
        # Check if collection has images
        count = s2_collection.size().getInfo()
        if count == 0:
            return {
                'parameter': 'SWIR',
                'current_value': 0,
                'unit': 'reflectance',
                'timeseries': []
            }
        
        # Get median image
        median_img = s2_collection.median()
        
        # Get time series
        def reduce_image(img):
            date = ee.Date(img.get('system:time_start')).format('YYYY-MM-dd')
            mean = img.reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=polygon,
                scale=10,
                maxPixels=1e9
            )
            return ee.Feature(None, mean.set('date', date))
        
        features = s2_collection.map(reduce_image)
        
        # Get current value from median
        current_value = median_img.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=polygon,
            scale=10,
            maxPixels=1e9
        )
        
        timeseries_data = features.getInfo()
        
        formatted_data = []
        for feature in timeseries_data.get('features', []):
            props = feature.get('properties', {})
            if 'B11' in props and props.get('B11') is not None:
                formatted_data.append({
                    'date': props.get('date'),
                    'value': round(props.get('B11'), 4),
                    'unit': 'reflectance'
                })
        
        current_info = current_value.getInfo()
        current = round(current_info.get('B11', 0), 4) if current_info.get('B11') else 0
        
        return {
            'parameter': 'SWIR',
            'current_value': current,
            'unit': 'reflectance',
            'timeseries': sorted(formatted_data, key=lambda x: x['date'])
        }
    except Exception as e:
        print(f"Error in get_swir_data: {str(e)}")
        return {
            'parameter': 'SWIR',
            'current_value': 0,
            'unit': 'reflectance',
            'timeseries': []
        }

async def get_soiling_data(polygon: ee.Geometry, start_date: str, end_date: str) -> Dict:
    """Get Soiling Index data"""
    try:
        # Split date range for baseline and current periods
        year = start_date[:4]
        baseline_start = f"{year}-01-01"
        baseline_end = f"{year}-03-31"
        current_start = f"{year}-04-01"
        
        # Use S2_SR instead of HARMONIZED if needed, or try both
        s2_baseline = ee.ImageCollection('COPERNICUS/S2_SR') \
            .select(['B2', 'B4', 'B8']) \
            .filterDate(baseline_start, baseline_end) \
            .filterBounds(polygon) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
        
        s2_current = ee.ImageCollection('COPERNICUS/S2_SR') \
            .select(['B2', 'B4', 'B8']) \
            .filterDate(current_start, end_date) \
            .filterBounds(polygon) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
        
        # Check if collections have images
        baseline_count = s2_baseline.size().getInfo()
        current_count = s2_current.size().getInfo()
        
        if baseline_count == 0 or current_count == 0:
            return {
                'parameter': 'SOILING',
                'baseline_si': 0,
                'current_si': 0,
                'soiling_drop_percent': 0,
                'unit': '%',
                'status': 'clean'
            }
        
        def make_si(img):
            return img.expression(
                '(B2 + B4) / (B8 + 0.0001)',
                {'B2': img.select('B2'), 'B4': img.select('B4'), 'B8': img.select('B8')}
            ).rename('SI')
        
        baseline_img = s2_baseline.median()
        current_img = s2_current.median()
        
        baseline_si = make_si(baseline_img)
        current_si = make_si(current_img)
        
        # Calculate soiling drop percentage
        soiling_drop = baseline_si.subtract(current_si).divide(baseline_si).multiply(100)
        
        baseline_value = baseline_si.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=polygon,
            scale=10,
            maxPixels=1e9
        ).getInfo()
        
        current_value = current_si.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=polygon,
            scale=10,
            maxPixels=1e9
        ).getInfo()
        
        drop_value = soiling_drop.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=polygon,
            scale=10,
            maxPixels=1e9
        ).getInfo()
        
        baseline_si_val = round(baseline_value.get('SI', 0), 4) if baseline_value.get('SI') else 0
        current_si_val = round(current_value.get('SI', 0), 4) if current_value.get('SI') else 0
        drop_percent = round(drop_value.get('SI', 0), 2) if drop_value.get('SI') else 0
        
        return {
            'parameter': 'SOILING',
            'baseline_si': baseline_si_val,
            'current_si': current_si_val,
            'soiling_drop_percent': drop_percent,
            'unit': '%',
            'status': 'needs_cleaning' if abs(drop_percent) > 15 else 'clean'
        }
    except Exception as e:
        print(f"Error in get_soiling_data: {str(e)}")
        return {
            'parameter': 'SOILING',
            'baseline_si': 0,
            'current_si': 0,
            'soiling_drop_percent': 0,
            'unit': '%',
            'status': 'clean'
        }

async def get_ndvi_data(polygon: ee.Geometry, start_date: str, end_date: str) -> Dict:
    """Vegetation encroachment via NDVI around panels (buffer ring)."""
    try:
        s2 = ee.ImageCollection('COPERNICUS/S2_SR') \
            .filterDate(start_date, end_date) \
            .filterBounds(polygon) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
            .select(['B4','B8'])

        # Check if collection has images
        count = s2.size().getInfo()
        if count == 0:
            return {
                'parameter': 'NDVI',
                'current_value': 0,
                'unit': '',
                'timeseries': []
            }

        # 30m outward buffer and remove the panel area to create a ring zone
        ring = polygon.buffer(30).difference(polygon)

        def add_ndvi(img):
            ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI')
            return ndvi.copyProperties(img, ['system:time_start'])

        ndvi_collection = s2.map(add_ndvi)

        def reduce_image(img):
            date = ee.Date(img.get('system:time_start')).format('YYYY-MM-dd')
            mean = img.reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=ring,
                scale=10,
                maxPixels=1e9
            )
            return ee.Feature(None, mean.set('date', date))

        features = ndvi_collection.map(reduce_image).getInfo()

        formatted = []
        for f in features.get('features', []):
            props = f.get('properties', {})
            if props.get('NDVI') is not None:
                formatted.append({'date': props.get('date'), 'value': round(props.get('NDVI'), 4), 'unit': ''})

        # current from latest image
        latest = ndvi_collection.sort('system:time_start', False).first()
        current = latest.reduceRegion(
            reducer=ee.Reducer.mean(), geometry=ring, scale=10, maxPixels=1e9
        ).getInfo()
        current_val = round(current.get('NDVI', 0), 4) if current.get('NDVI') is not None else 0

        return {
            'parameter': 'NDVI',
            'current_value': current_val,
            'unit': '',
            'timeseries': sorted(formatted, key=lambda x: x['date'])
        }
    except Exception as e:
        print(f"Error in get_ndvi_data: {str(e)}")
        return {
            'parameter': 'NDVI',
            'current_value': 0,
            'unit': '',
            'timeseries': []
        }

async def get_ndwi_data(polygon: ee.Geometry, start_date: str, end_date: str) -> Dict:
    """Surface water via NDWI using B3 and B8 within the farm polygon."""
    try:
        s2 = ee.ImageCollection('COPERNICUS/S2_SR') \
            .filterDate(start_date, end_date) \
            .filterBounds(polygon) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
            .select(['B3','B8'])

        # Check if collection has images
        count = s2.size().getInfo()
        if count == 0:
            return {
                'parameter': 'NDWI',
                'current_value': 0,
                'unit': '',
                'timeseries': []
            }

        def add_ndwi(img):
            ndwi = img.normalizedDifference(['B3', 'B8']).rename('NDWI')
            return ndwi.copyProperties(img, ['system:time_start'])

        ndwi_collection = s2.map(add_ndwi)

        def reduce_image(img):
            date = ee.Date(img.get('system:time_start')).format('YYYY-MM-dd')
            mean = img.reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=polygon,
                scale=10,
                maxPixels=1e9
            )
            return ee.Feature(None, mean.set('date', date))

        features = ndwi_collection.map(reduce_image).getInfo()

        formatted = []
        for f in features.get('features', []):
            props = f.get('properties', {})
            if props.get('NDWI') is not None:
                formatted.append({'date': props.get('date'), 'value': round(props.get('NDWI'), 4), 'unit': ''})

        latest = ndwi_collection.sort('system:time_start', False).first()
        current = latest.reduceRegion(
            reducer=ee.Reducer.mean(), geometry=polygon, scale=10, maxPixels=1e9
        ).getInfo()
        current_val = round(current.get('NDWI', 0), 4) if current.get('NDWI') is not None else 0

        return {
            'parameter': 'NDWI',
            'current_value': current_val,
            'unit': '',
            'timeseries': sorted(formatted, key=lambda x: x['date'])
        }
    except Exception as e:
        print(f"Error in get_ndwi_data: {str(e)}")
        return {
            'parameter': 'NDWI',
            'current_value': 0,
            'unit': '',
            'timeseries': []
        }

async def get_visible_mean_data(polygon: ee.Geometry, start_date: str, end_date: str) -> Dict:
    """Visible reflectance mean (B2+B3+B4)/3 as a proxy for albedo/brightness."""
    try:
        s2 = ee.ImageCollection('COPERNICUS/S2_SR') \
            .filterDate(start_date, end_date) \
            .filterBounds(polygon) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
            .select(['B2','B3','B4'])

        # Check if collection has images
        count = s2.size().getInfo()
        if count == 0:
            return {
                'parameter': 'VISIBLE',
                'current_value': 0,
                'unit': 'reflectance',
                'timeseries': []
            }

        def add_vis_mean(img):
            vis = img.expression('((B2 + B3 + B4) / 3)', {
                'B2': img.select('B2'), 'B3': img.select('B3'), 'B4': img.select('B4')
            }).rename('VIS')
            return vis.copyProperties(img, ['system:time_start'])

        vis_collection = s2.map(add_vis_mean)

        def reduce_image(img):
            date = ee.Date(img.get('system:time_start')).format('YYYY-MM-dd')
            mean = img.reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=polygon,
                scale=10,
                maxPixels=1e9
            )
            return ee.Feature(None, mean.set('date', date))

        features = vis_collection.map(reduce_image).getInfo()

        formatted = []
        for f in features.get('features', []):
            props = f.get('properties', {})
            if props.get('VIS') is not None:
                formatted.append({'date': props.get('date'), 'value': round(props.get('VIS'), 4), 'unit': 'reflectance'})

        latest = vis_collection.sort('system:time_start', False).first()
        current = latest.reduceRegion(
            reducer=ee.Reducer.mean(), geometry=polygon, scale=10, maxPixels=1e9
        ).getInfo()
        current_val = round(current.get('VIS', 0), 4) if current.get('VIS') is not None else 0

        return {
            'parameter': 'VISIBLE',
            'current_value': current_val,
            'unit': 'reflectance',
            'timeseries': sorted(formatted, key=lambda x: x['date'])
        }
    except Exception as e:
        print(f"Error in get_visible_mean_data: {str(e)}")
        return {
            'parameter': 'VISIBLE',
            'current_value': 0,
            'unit': 'reflectance',
            'timeseries': []
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

