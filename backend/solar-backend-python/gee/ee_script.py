import ee
import json
import os
import datetime

def performAnalysis(geometry_dict):
    """
    Calculates actual Solar and Terrain values for the geometry using Google Earth Engine.
    Matches the logic of the original Node.js backend exactly.
    """
    try:
        # Convert the GeoJSON dict into an Earth Engine Geometry
        # Handle FeatureCollection (Node.js compatibility)
        if geometry_dict.get("type") == "FeatureCollection":
             features = geometry_dict.get("features", [])
             if features:
                 geometry_dict = features[0].get("geometry")
             else:
                 # Fallback if empty features
                 raise ValueError("Empty FeatureCollection")

        geom = ee.Geometry(geometry_dict)

        # Time range for dynamic data (last year), matching Node.js:
        # const end = ee.Date(Date.now());
        # const start = end.advance(-1, 'year');
        # Python equivalent of ee.Date(Date.now()) in Node.js:
        end = ee.Date(datetime.datetime.utcnow())
        start = end.advance(-1, 'year')
        
        # --- 1. Solar Potential (Global Solar Atlas) ---
        # "projects/earthengine-legacy/assets/projects/sat-io/open-datasets/global_solar_atlas/ghi_LTAy_AvgDailyTotals"
        # Unit: kWh/m2/day (Daily Totals)
        ghi = ee.Image("projects/earthengine-legacy/assets/projects/sat-io/open-datasets/global_solar_atlas/ghi_LTAy_AvgDailyTotals")
        
        # --- 2. Terrain (Elevation & Slope) ---
        # USGS/SRTMGL1_003
        dem = ee.Image("USGS/SRTMGL1_003")
        slope = ee.Terrain.slope(dem)
        hillshade = ee.Terrain.hillshade(dem)
        
        # --- 3. Temperature (MODIS) ---
        # MODIS/061/MOD11A2 -> LST_Day_1km
        # Scale 0.02, Kelvins to Celsius (-273.15)
        lst = ee.ImageCollection('MODIS/061/MOD11A2') \
            .filterDate(start, end) \
            .select('LST_Day_1km') \
            .mean() \
            .multiply(0.02) \
            .subtract(273.15)
            
        # --- 4. Land Cover (ESA WorldCover) ---
        # ESA/WorldCover/v100/2020 -> Map
        landCover = ee.Image('ESA/WorldCover/v100/2020').select('Map')
        
        # --- 5. Wind Speed (ERA5) ---
        # ECMWF/ERA5_LAND/HOURLY -> u_component_of_wind_10m, v_component_of_wind_10m
        # Sqrt(u^2 + v^2)
        era5 = ee.ImageCollection('ECMWF/ERA5_LAND/HOURLY') \
            .filterDate(start, end) \
            .select(['u_component_of_wind_10m', 'v_component_of_wind_10m'])
            
        windSpeed = era5.map(lambda image: image.pow(2).reduce(ee.Reducer.sum()).sqrt()).mean()
        
        # --- 6. Aerosol/Dust (MODIS) ---
        # MODIS/061/MCD19A2_GRANULES -> Optical_Depth_055
        aerosol = ee.ImageCollection('MODIS/061/MCD19A2_GRANULES') \
            .filterDate(start, end) \
            .select('Optical_Depth_055') \
            .mean()

        # --- 7. Distance to Water (HydroSHEDS) ---
        # WWF/HydroSHEDS/v1/FreeFlowingRivers
        rivers = ee.FeatureCollection("WWF/HydroSHEDS/v1/FreeFlowingRivers")
        perennialRivers = rivers.filter(ee.Filter.eq('RIV_TC_V1C', 1))
        distanceToWater = perennialRivers.distance(50000, 50).divide(1000)

        # --- 8. Soil Stability (SoilGrids) ---
        # projects/soilgrids-isric/bdod_mean -> bdod_0-5cm_mean
        soilBulkDensity = ee.Image("projects/soilgrids-isric/bdod_mean") \
            .select('bdod_0-5cm_mean')

        # --- 9. Vegetation (Sentinel-2) ---
        sentinel2 = ee.ImageCollection('COPERNICUS/S2_SR') \
            .filterDate(start, end) \
            .filterBounds(geom) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
            .median()
            
        ndvi = sentinel2.normalizedDifference(['B8', 'B4'])
        red = sentinel2.select('B4')
        nir = sentinel2.select('B8')
        swir1 = sentinel2.select('B11')
        swir2 = sentinel2.select('B12')

        # --- Combine all bands ---
        combined = dem.rename('elevation') \
            .addBands(slope.rename('slope')) \
            .addBands(ghi.rename('ghi')) \
            .addBands(lst.rename('temperature')) \
            .addBands(landCover.rename('landCover')) \
            .addBands(hillshade.rename('shading')) \
            .addBands(aerosol.rename('dust')) \
            .addBands(windSpeed.rename('windSpeed')) \
            .addBands(distanceToWater.rename('distanceToWater')) \
            .addBands(soilBulkDensity.rename('soilStability')) \
            .addBands(ndvi.rename('ndvi')) \
            .addBands(red.rename('red')) \
            .addBands(nir.rename('nir')) \
            .addBands(swir1.rename('swir1')) \
            .addBands(swir2.rename('swir2'))

        # Reduce region to get statistics
        # Node.js: reducer: ee.Reducer.mean().combine({reducer2: ee.Reducer.mode(), sharedInputs: true})
        # Scale: 100
        stats = combined.reduceRegion(
            reducer=ee.Reducer.mean().combine(
                reducer2=ee.Reducer.mode(), sharedInputs=True
            ),
            geometry=geom,
            scale=100,
            maxPixels=1e10,
            bestEffort=False,
            tileScale=1
        ).getInfo()
        
        # --- Flood Risk (Separate Calculation) ---
        # JRC/GSW1_4/GlobalSurfaceWater -> occurrence
        surfaceWater = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select('occurrence')
        floodProneArea = surfaceWater.gt(50)
        floodRiskHectares = floodProneArea.multiply(ee.Image.pixelArea()).divide(10000) \
            .reduceRegion(
                reducer=ee.Reducer.sum(), 
                geometry=geom, 
                scale=30, 
                maxPixels=1e9,
                bestEffort=False,
                tileScale=1
            ).getInfo()
            
        # Match Node.js semantics: use the raw occurrence value (may be null)
        flood_risk_val = floodRiskHectares.get('occurrence') if floodRiskHectares is not None else None

        # --- Process Results (no extra rounding, to mirror Node.js exactly) ---
        ghi_val = stats.get('ghi_mean') if stats is not None else None
        wind_mean = stats.get('windSpeed_mean') if stats is not None else None

        return {
            "ghi": ghi_val,
            "slope": stats.get('slope_mean') if stats is not None else None,
            "elevation": stats.get('elevation_mean') if stats is not None else None,
            "temperature": stats.get('temperature_mean') if stats is not None else None,
            "landCover": int(stats.get('landCover_mode')) if stats is not None and stats.get('landCover_mode') is not None else None,
            "shading": stats.get('shading_mean') if stats is not None else None,
            "dust": stats.get('dust_mean') if stats is not None else None,
            "windSpeed": wind_mean * 3.6 if wind_mean is not None else None,  # m/s to km/h
            "waterAvailability": stats.get('distanceToWater_mean') if stats is not None else None,
            "soilStability": stats.get('soilStability_mean') if stats is not None else None,
            "floodRisk": flood_risk_val,
            "ndvi": stats.get('ndvi_mean') if stats is not None else None,
            "red": stats.get('red_mean') if stats is not None else None,
            "nir": stats.get('nir_mean') if stats is not None else None,
            "swir1": stats.get('swir1_mean') if stats is not None else None,
            "swir2": stats.get('swir2_mean') if stats is not None else None
        }

    except Exception as e:
        print(f"Analysis Calculation Error: {e}")
        raise e
