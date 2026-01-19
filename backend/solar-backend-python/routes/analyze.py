from pyproj import Geod
geod = Geod(ellps="WGS84")

import json
import httpx
import asyncio
import os
import math
import re
from fastapi import APIRouter, HTTPException, UploadFile, File
from shapely.geometry import shape, Point, LineString, MultiLineString, mapping, Polygon
from shapely.ops import nearest_points
from schemas import AnalysisRequest, BatchAnalysisRequest
from services.gee_service import performAnalysis
from fastkml import kml

router = APIRouter()

OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter'
]

async def make_overpass_request(query: str, max_retries: int = 3):
    """
    Mirrors the Node.js makeOverpassRequest behavior:
    - Tries multiple Overpass endpoints
    - Uses longer timeouts
    - Retries with exponential backoff
    """
    timeout = httpx.Timeout(30.0)
    for attempt in range(max_retries):
        for endpoint in OVERPASS_ENDPOINTS:
            try:
                print(f"Attempting Overpass API request to {endpoint} (attempt {attempt + 1})")
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.post(
                        endpoint,
                        data={'data': query},
                        headers={'User-Agent': 'Solar-Suitability-App/1.0'}
                    )
                if response.status_code == 200:
                    data = response.json()
                    if data.get('elements'):
                        print(f"Successfully fetched data from {endpoint}")
                        return data
            except Exception as e:
                print(f"Failed to fetch from {endpoint} (attempt {attempt + 1}): {e}")
        if attempt < max_retries - 1:
            backoff = 2 * (2 ** attempt)
            print(f"All endpoints failed, waiting {backoff}s before retry {attempt + 2}...")
            await asyncio.sleep(backoff)
    print("All Overpass API endpoints failed after retries")
    return None

def haversine_distance(coord1, coord2):
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees) in km.
    coord: (lon, lat)
    """
    lon1, lat1 = coord1
    lon2, lat2 = coord2
    
    R = 6371  # radius of Earth in km
    
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    
    a = math.sin(dphi/2)**2 + \
        math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    
    c = 2*math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    d = R*c
    return d

def get_centroid(geometry_dict):
    geom = shape(geometry_dict)
    return geom.centroid.y, geom.centroid.x # lat, lon

def get_nearest_distance(geometry_dict, elements):
    """
    Calculates distance from geometry centroid to nearest element in km.
    Returns (distance_km, nearest_element_dict)
    """
    if not elements:
        return None, None

    site_geom = shape(geometry_dict)
    centroid = site_geom.centroid # Point(lon, lat)
    
    min_dist_km = float('inf')
    nearest_feature = None

    for el in elements:
        if el.get('type') == 'way' and 'geometry' in el:
            # Convert to LineString
            coords = [(pt['lon'], pt['lat']) for pt in el['geometry']]
            if len(coords) < 2:
                continue
            line = LineString(coords)
            
            # Find nearest point on line to centroid (in degrees)
            p1, p2 = nearest_points(centroid, line)
            
            # Calculate Haversine distance between centroid and nearest point
            dist_km = haversine_distance((centroid.x, centroid.y), (p2.x, p2.y))
            
            if dist_km < min_dist_km:
                min_dist_km = dist_km
                nearest_feature = el

    if min_dist_km != float('inf'):
        return min_dist_km, nearest_feature
    return None, None

async def get_road_distance(geometry_dict):
    try:
        lat, lon = get_centroid(geometry_dict)
        # Search radius 5000m
        query = f'[out:json][timeout:15];way["highway"~"^(primary|secondary|tertiary|trunk)$"](around:5000,{lat},{lon});out geom;'
        data = await make_overpass_request(query)
        
        if not data or 'elements' not in data or not data['elements']:
            print('No roads found within 5km, using default distance')
            return 10.0 # Default

        dist, feature = get_nearest_distance(geometry_dict, data['elements'])
        if dist is None:
            return 10.0
        
        print(f"Found nearest road at {dist:.2f}km")
        return dist
    except Exception as e:
        print(f"Error getting road distance: {e}")
        return 10.0

async def get_power_line_distance(geometry_dict):
    try:
        lat, lon = get_centroid(geometry_dict)

        query = (
            f'[out:json][timeout:15];'
            f'('
            f'way["power"="line"]["voltage"~"^(60|30|110|220|400|500|750|1000|60000|30000|110000|220000|400000|500000|750000|1000000)$"]'
            f'(around:25000,{lat},{lon});'
            f');'
            f'out geom;'
        )

        data = await make_overpass_request(query)

        default_result = {
            "aerialDistance": 25.0,
            "roadDistance": None,
            "nearestPowerLine": None,
        }

        if not data or "elements" not in data or not data["elements"]:
            print("No power lines found within 25km, using default distance")
            return default_result

        site_geom = shape(geometry_dict)

        min_dist_km = float("inf")
        nearest_feature = None
        nearest_point_coords = None

        for el in data["elements"]:
            if el.get("type") == "way" and "geometry" in el:
                coords = [(pt["lon"], pt["lat"]) for pt in el["geometry"]]
                if len(coords) < 2:
                    continue

                line = LineString(coords)

                p_site, p_line = nearest_points(site_geom.centroid, line)


                _, _, dist_m = geod.inv(
                    p_site.x, p_site.y,
                    p_line.x, p_line.y
                )

                dist_km = dist_m / 1000.0

                if dist_km < min_dist_km:
                    min_dist_km = dist_km
                    nearest_feature = el
                    nearest_point_coords = [p_line.x, p_line.y]

        if nearest_feature is None:
            return default_result

        aerial_distance = min_dist_km
        print(f"Found nearest power line at {aerial_distance:.3f} km")

        # ---- Road distance (keep same behavior as Node.js) ----
        road_distance = None
        try:
            road_query = (
                f'[out:json][timeout:10];'
                f'way["highway"~"^(primary|secondary|tertiary|trunk)$"](around:5000,{lat},{lon});'
                f'out geom;'
            )
            road_data = await make_overpass_request(road_query)

            if road_data and road_data.get("elements"):
                min_road_dist = float("inf")
                for el in road_data["elements"]:
                    if el.get("type") == "way" and "geometry" in el:
                        coords = [(pt["lon"], pt["lat"]) for pt in el["geometry"]]
                        if len(coords) < 2:
                            continue

                        road_line = LineString(coords)
                        p1, p2 = nearest_points(site_geom.centroid, road_line)
                        dist_km = haversine_distance(
                            (site_geom.centroid.x, site_geom.centroid.y),
                            (p2.x, p2.y)
                        )

                        min_road_dist = min(min_road_dist, dist_km)

                if min_road_dist != float("inf"):
                    road_distance = min_road_dist + aerial_distance
        except Exception as e:
            print(f"Road distance calculation failed: {e}")

        if road_distance is not None and road_distance < aerial_distance:
            road_distance = aerial_distance * 1.12

        # ---- Voltage parsing (Node.js parity) ----
        voltage = "Unknown"
        raw_voltage = nearest_feature.get("tags", {}).get("voltage")
        if raw_voltage:
            parts = re.findall(r"\d+", str(raw_voltage))
            if parts:
                voltage = max(parts, key=lambda x: int(x))

        return {
            "aerialDistance": aerial_distance,
            "roadDistance": road_distance,
            "nearestPowerLine": {
                "coordinates": nearest_point_coords,
                "voltage": voltage,
            },
        }

    except Exception as e:
        print(f"Error getting power line distance: {e}")
        return {
            "aerialDistance": 25.0,
            "roadDistance": None,
            "nearestPowerLine": None,
        }

# Load seismic zones once
SEISMIC_ZONES = None
def load_seismic_zones():
    global SEISMIC_ZONES
    if SEISMIC_ZONES is not None:
        return SEISMIC_ZONES
    
    try:
        base_dir = os.path.dirname(os.path.dirname(__file__)) # solar-backend-python
        path = os.path.join(base_dir, 'gee', 'seismic_zones.json')
        if os.path.exists(path):
            with open(path, 'r') as f:
                SEISMIC_ZONES = json.load(f)
    except Exception as e:
        print(f"Error loading seismic zones: {e}")
    return SEISMIC_ZONES

def get_seismic_zone(geometry_dict):
    try:
        zones = load_seismic_zones()
        if not zones:
            return 2 # Default to Zone 2
        
        point = shape(geometry_dict).centroid
        for feature in zones['features']:
            geom = shape(feature['geometry'])
            if geom.contains(point) or geom.touches(point):
                return feature['properties'].get('zone', 2)
        return 2
    except Exception as e:
        print(f"Error getting seismic zone: {e}")
        return 2

async def process_analysis(geom_dict):
    """
    Shared logic for analyzing a geometry (dict) with parallel execution.
    """
    print("--- Starting Analysis (Parallel) ---")
    
    # Define wrappers for tasks
    async def run_gee():
        print("GEE: Starting...")
        # Run blocking GEE call in a separate thread
        return await asyncio.to_thread(performAnalysis, geom_dict)

    async def run_road():
        print("Infrastructure: Fetching Road Distance...")
        return await get_road_distance(geom_dict)

    async def run_power():
        print("Infrastructure: Fetching Power Line Distance...")
        return await get_power_line_distance(geom_dict)
    
    try:
        # Run GEE and Infrastructure calls in parallel
        results = await asyncio.gather(
            run_gee(),
            run_road(),
            run_power(),
            return_exceptions=True
        )
        
        gee_result, road_dist, power_data = results
        
        # Handle GEE Errors (Critical)
        if isinstance(gee_result, Exception):
            print(f"GEE Error: {gee_result}")
            raise gee_result
            
        # Handle Infrastructure Errors (Non-Critical, use defaults)
        if isinstance(road_dist, Exception):
            print(f"Road distance error: {road_dist}")
            road_dist = 10.0
            
        if isinstance(power_data, Exception):
            print(f"Power line error: {power_data}")
            power_data = {"aerialDistance": 25.0, "roadDistance": None, "nearestPowerLine": {"coordinates": [0,0], "voltage": "Unknown"}}

        print("Infrastructure: Calculating Seismic Zone...")
        seismic_zone = get_seismic_zone(geom_dict)

        proximity_to_lines = None
        if isinstance(power_data, dict):
            proximity_to_lines = power_data.get("aerialDistance")
        if proximity_to_lines is None:
            proximity_to_lines = 25.0

        final_response = {
            **gee_result,
            "proximityToRoads": road_dist,
            "proximityToLines": proximity_to_lines,
            "powerLineDetails": power_data,
            "seismicRisk": seismic_zone,
        }
        return final_response

    except Exception as e:
        print(f"Analysis Critical Failure: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@router.post("")
async def analyze(request: AnalysisRequest):
    return await process_analysis(request.geometry.dict())

@router.get("/health")
async def analyze_health():
    return {
        "status": "OK",
        "message": "Analysis API is running",
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
    }

@router.post("/kml")
async def analyze_kml(file: UploadFile = File(...)):
    print(f"Received KML file: {file.filename}")
    try:
        content = await file.read()
        k = kml.KML()
        k.from_string(content)
        
        # Extract features
        features = list(k.features())
        geometry = None
        
        # Recursive function to find the first Polygon/Geometry
        def find_geometry(feats):
            for f in feats:
                if isinstance(f, kml.Placemark):
                    if hasattr(f, 'geometry') and f.geometry:
                         # Check if it's a Polygon or MultiPolygon
                         # Convert to dictionary (GeoJSON style)
                         return mapping(f.geometry)
                elif isinstance(f, kml.Folder) or isinstance(f, kml.Document):
                    res = find_geometry(list(f.features()))
                    if res:
                        return res
            return None

        geometry = find_geometry(features)
        
        if not geometry:
            raise HTTPException(status_code=400, detail="No valid geometry found in KML file.")
            
        print("Extracted geometry from KML.")
        return await process_analysis(geometry)
        
    except Exception as e:
        print(f"Error processing KML: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid KML file: {str(e)}")

@router.post("/batch")
async def analyze_batch(request: BatchAnalysisRequest):
    results = []
    for geom in request.geometries:
        try:
            res = await process_analysis(geom)
            results.append(res)
        except Exception as e:
            results.append({"error": str(e), "geometry": geom})
    return {"results": results}
