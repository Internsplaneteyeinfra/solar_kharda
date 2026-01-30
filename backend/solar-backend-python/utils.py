
import math

PARAMETERS_CONFIG = [
    { "key": 'slope', "name": 'Slope', "weight": 0.20, "unit": '°', "higherIsBetter": False, "thresholds": { "best": 5.7, "worst": 15 } },
    { "key": 'ghi', "name": 'Sunlight (GHI)', "weight": 0.15, "unit": ' kWh/m²/day', "higherIsBetter": True, "thresholds": { "best": 5.5, "worst": 4.5 } },
    { "key": 'temperature', "name": 'Avg. Temperature', "weight": 0.07, "unit": ' °C', "higherIsBetter": False, "thresholds": { "best": 25, "worst": 40 } },
    { "key": 'elevation', "name": 'Elevation', "weight": 0.03, "unit": ' m' },
    { "key": 'landCover', "name": 'Land Cover', "weight": 0.10 },
    { "key": 'proximityToLines', "name": 'Proximity to Power Lines', "weight": 0.10, "unit": ' km', "higherIsBetter": False, "thresholds": { "best": 1, "worst": 15 } },
    { "key": 'proximityToRoads', "name": 'Proximity to Roads', "weight": 0.05, "unit": ' km', "higherIsBetter": False, "thresholds": { "best": 1, "worst": 10 } },
    { "key": 'waterAvailability', "name": 'Water Availability', "weight": 0.05, "unit": ' km', "higherIsBetter": False, "thresholds": { "best": 2, "worst": 15 } },
    { "key": 'soilStability', "name": 'Soil Stability (Depth)', "weight": 0.05, "unit": ' cm', "higherIsBetter": True, "thresholds": { "best": 100, "worst": 20 } },
    { "key": 'shading', "name": 'Shading (Hillshade)', "weight": 0.05, "unit": '', "higherIsBetter": True, "thresholds": { "best": 200, "worst": 100 } },
    { "key": 'dust', "name": 'Dust (Aerosol Index)', "weight": 0.03, "unit": '', "higherIsBetter": False, "thresholds": { "best": 0.1, "worst": 0.5 } },
    { "key": 'seismicRisk', "name": 'Seismic Risk (PGA)', "weight": 0.02, "unit": ' g', "higherIsBetter": False, "thresholds": { "best": 0.1, "worst": 0.4 } },
    { "key": 'floodRisk', "name": 'Flood Risk', "weight": 0.02, "unit": ' ha', "higherIsBetter": False, "thresholds": { "best": 0, "worst": 5 } },
    { "key": 'landOwnership', "name": 'Land Ownership', "weight": 0.06 }
]

WIND_SPEED_CONFIG = { "key": 'windSpeed', "name": 'Wind Speed', "weight": 0.02, "unit": ' km/h', "higherIsBetter": False, "thresholds": { "best": 20, "worst": 90 } }

def fix_precision_issues(key, value):
    if value is None:
        return value
    if key in ['landCover', 'landOwnership']:
        return round(value)
    return value

def calculate_score(value, param):
    if value is None:
        return 0
    if not param.get('thresholds'):
        return 5
    best = param['thresholds']['best']
    worst = param['thresholds']['worst']
    if param['higherIsBetter']:
        if value >= best:
            return 10
        if value <= worst:
            return 1
        return 1 + 9 * ((value - worst) / (best - worst))
    else:
        if value <= best:
            return 10
        if value >= worst:
            return 1
        return 1 + 9 * ((worst - value) / (worst - best))

def calculate_enhanced_land_cover_score(land_cover_code, raw_data):
    if raw_data.get('ndvi') is not None and raw_data['ndvi'] < -0.1:
        return 0
    base_score = 5
    if land_cover_code == 50:
        base_score = 1
    elif land_cover_code in [80, 90, 95]:
        if raw_data.get('ndvi') is not None and raw_data['ndvi'] < 0.1:
            base_score = 0
        else:
            base_score = 2
    elif land_cover_code == 10:
        base_score = 3
    elif land_cover_code in [30, 40, 60]:
        base_score = 10
    elif land_cover_code == 20:
        base_score = 8
    
    if raw_data.get('ndvi') is not None and raw_data['ndvi'] > 0.3 and base_score > 0:
        land_usability_factors = {10:0.3, 20:0.8, 30:1.0, 40:0.6, 50:0.1, 60:1.0, 70:0.0, 80:0.0, 90:0.2, 95:0.2, 100:0.5}
        factor = land_usability_factors.get(land_cover_code, 0.5)
        if factor >= 0.6:
            adjustment = raw_data['ndvi'] * 0.2 * factor
            base_score = min(10, base_score + adjustment)
    return base_score

def calculate_final_weighted_score(raw_data):
    """
    Calculates the final weighted suitability score based on Node.js logic.
    """
    total_weighted_score = 0
    
    for param in PARAMETERS_CONFIG:
        raw_value = fix_precision_issues(param['key'], raw_data.get(param['key']))
        score = 0
        
        if param['key'] == 'landOwnership':
            # Assuming 1 is Government (Best) and others are Private (Worst)
            # Node.js: score = (rawValue === 1) ? 10 : 5;
            score = 10 if raw_value == 1 else 5
        elif param['key'] == 'elevation':
            # Node.js: score = (rawValue >= 50 && rawValue <= 1500) ? 10 : 2;
            score = 10 if (raw_value is not None and 50 <= raw_value <= 1500) else 2
        elif param['key'] == 'landCover':
            score = calculate_enhanced_land_cover_score(raw_value, raw_data)
        elif param.get('thresholds'):
            score = calculate_score(raw_value, param)
        else:
            score = 5
            
        total_weighted_score += score * param['weight']
        
    # Add Wind Speed Score separately
    wind_raw_value = fix_precision_issues(WIND_SPEED_CONFIG['key'], raw_data.get(WIND_SPEED_CONFIG['key']))
    wind_score = calculate_score(wind_raw_value, WIND_SPEED_CONFIG)
    total_weighted_score += wind_score * WIND_SPEED_CONFIG['weight']

    return min(10, max(0, total_weighted_score))
