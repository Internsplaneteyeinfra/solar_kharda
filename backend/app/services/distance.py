import httpx
import asyncio
import re
from shapely.geometry import shape, LineString
from shapely.ops import nearest_points
from app.solar.constants import OVERPASS_ENDPOINTS
from app.utils.geo_helpers import get_centroid, get_nearest_distance, haversine_distance

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

        if not data or 'elements' not in data or not data['elements']:
            print('No power lines found within 25km, using default distance')
            return default_result

        site_geom = shape(geometry_dict)
        centroid_point = site_geom.centroid

        min_dist_km = float('inf')
        nearest_feature = None
        nearest_point_coords = None

        for el in data['elements']:
            if el.get('type') == 'way' and 'geometry' in el:
                coords = [(pt['lon'], pt['lat']) for pt in el['geometry']]
                if len(coords) < 2:
                    continue
                line = LineString(coords)
                p1, p2 = nearest_points(centroid_point, line)
                dist_km = haversine_distance((centroid_point.x, centroid_point.y), (p2.x, p2.y))
                if dist_km < min_dist_km:
                    min_dist_km = dist_km
                    nearest_feature = el
                    nearest_point_coords = [p2.x, p2.y]

        if nearest_feature is None or nearest_point_coords is None:
            return default_result

        aerial_distance = min_dist_km
        print(f"Found nearest power line at {aerial_distance:.2f}km")

        road_distance = None
        try:
            road_query = (
                f'[out:json][timeout:10];'
                f'('
                f'way["highway"~"^(primary|secondary|tertiary|trunk)$"](around:5000,{lat},{lon});'
                f');'
                f'out geom;'
            )
            road_data = await make_overpass_request(road_query)
            if road_data and 'elements' in road_data and road_data['elements']:
                road_lines = []
                for el in road_data['elements']:
                    if el.get('type') == 'way' and 'geometry' in el:
                        coords = [(pt['lon'], pt['lat']) for pt in el['geometry']]
                        if len(coords) >= 2:
                            road_lines.append(LineString(coords))

                nearest_road_point = None
                min_road_dist = float('inf')
                for line in road_lines:
                    p1, p2 = nearest_points(centroid_point, line)
                    dist_km = haversine_distance((centroid_point.x, centroid_point.y), (p2.x, p2.y))
                    if dist_km < min_road_dist:
                        min_road_dist = dist_km
                        nearest_road_point = p2

                if nearest_road_point is not None:
                    road_to_power = haversine_distance(
                        (nearest_road_point.x, nearest_road_point.y),
                        (nearest_point_coords[0], nearest_point_coords[1]),
                    )
                    road_distance = min_road_dist + road_to_power
        except Exception as road_err:
            print(f"Could not calculate road distance to power line: {road_err}")

        if road_distance is not None and road_distance < aerial_distance:
            road_distance = aerial_distance * 1.2

        voltage = 'Unknown'
        if nearest_feature and 'tags' in nearest_feature:
            raw_voltage = nearest_feature['tags'].get('voltage') or nearest_feature['tags'].get('cables')
            if raw_voltage:
                match = re.search(r'(\d+)', str(raw_voltage))
                if match:
                    v_num = int(match.group(1))
                    if 0 < v_num < 1000000:
                        voltage = str(v_num)

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
