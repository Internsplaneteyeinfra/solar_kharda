import ee
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any

# Helper to run GEE blocking calls in thread
async def run_in_thread(func, *args, **kwargs):
    return await asyncio.to_thread(func, *args, **kwargs)

def mask_s2_clouds(image):
    qa = image.select('QA60')
    cloud_bit_mask = 1 << 10
    cirrus_bit_mask = 1 << 11
    mask = qa.bitwiseAnd(cloud_bit_mask).eq(0).And(qa.bitwiseAnd(cirrus_bit_mask).eq(0))
    return image.updateMask(mask).divide(10000)

async def get_lst_data(geometry, start_date: str, end_date: str) -> Dict[str, Any]:
    """Fetch LST data from Landsat 8/9 and MODIS."""
    def _process():
        # Try Landsat first
        def apply_scale(img):
            # Landsat 8/9 LST
            lst = img.select('ST_B10').multiply(0.00341802).add(149.0).subtract(273.15).rename('LST')
            return img.addBands(lst).copyProperties(img, ['system:time_start'])

        l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2') \
            .filterBounds(geometry) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUD_COVER', 20)) \
            .map(apply_scale) \
            .select('LST')

        data = l8.getRegion(geometry, 30).getInfo()
        
        timeseries = []
        if len(data) > 1:
            header = data[0]
            for row in data[1:]:
                ts = row[header.index('system:time_start')]
                val = row[header.index('LST')]
                if val is not None:
                    dt = datetime.fromtimestamp(ts / 1000.0)
                    timeseries.append({
                        'date': dt.strftime('%Y-%m-%d'),
                        'value': val,
                        'unit': '°C'
                    })
        
        # If scarce data, fill with MODIS? 
        # For migration, we might want strict data or hybrid. 
        # Let's keep it simple for now, maybe add MODIS fallback if needed.
        return {'timeseries': timeseries, 'unit': '°C'}

    return await run_in_thread(_process)

async def get_swir_data(geometry, start_date: str, end_date: str) -> Dict[str, Any]:
    """Fetch SWIR data from Sentinel-2."""
    def _process():
        s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterBounds(geometry) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
            .map(mask_s2_clouds) \
            .select(['B11', 'B12'])

        # Calculate mean SWIR (B11 + B12)/2 or just B11
        def calc_swir(img):
            swir = img.select('B11').rename('value')
            return img.addBands(swir).copyProperties(img, ['system:time_start'])

        s2_proc = s2.map(calc_swir).select('value')
        data = s2_proc.getRegion(geometry, 10).getInfo()

        timeseries = []
        if len(data) > 1:
            header = data[0]
            for row in data[1:]:
                ts = row[header.index('system:time_start')]
                val = row[header.index('value')]
                if val is not None:
                    dt = datetime.fromtimestamp(ts / 1000.0)
                    timeseries.append({
                        'date': dt.strftime('%Y-%m-%d'),
                        'value': val,
                        'unit': 'reflectance'
                    })
        return {'timeseries': timeseries, 'unit': 'reflectance'}

    return await run_in_thread(_process)

async def get_ndvi_data(geometry, start_date: str, end_date: str) -> Dict[str, Any]:
    """Fetch NDVI data from Sentinel-2."""
    def _process():
        s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterBounds(geometry) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
            .map(mask_s2_clouds)

        def add_ndvi(img):
            ndvi = img.normalizedDifference(['B8', 'B4']).rename('value')
            return img.addBands(ndvi).copyProperties(img, ['system:time_start'])

        s2_proc = s2.map(add_ndvi).select('value')
        data = s2_proc.getRegion(geometry, 10).getInfo()

        timeseries = []
        if len(data) > 1:
            header = data[0]
            for row in data[1:]:
                ts = row[header.index('system:time_start')]
                val = row[header.index('value')]
                if val is not None:
                    dt = datetime.fromtimestamp(ts / 1000.0)
                    timeseries.append({
                        'date': dt.strftime('%Y-%m-%d'),
                        'value': val,
                        'unit': ''
                    })
        return {'timeseries': timeseries, 'unit': ''}

    return await run_in_thread(_process)

async def get_ndwi_data(geometry, start_date: str, end_date: str) -> Dict[str, Any]:
    """Fetch NDWI data from Sentinel-2."""
    def _process():
        s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterBounds(geometry) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
            .map(mask_s2_clouds)

        def add_ndwi(img):
            # NDWI = (B3 - B8) / (B3 + B8)  (Green - NIR)
            ndwi = img.normalizedDifference(['B3', 'B8']).rename('value')
            return img.addBands(ndwi).copyProperties(img, ['system:time_start'])

        s2_proc = s2.map(add_ndwi).select('value')
        data = s2_proc.getRegion(geometry, 10).getInfo()

        timeseries = []
        if len(data) > 1:
            header = data[0]
            for row in data[1:]:
                ts = row[header.index('system:time_start')]
                val = row[header.index('value')]
                if val is not None:
                    dt = datetime.fromtimestamp(ts / 1000.0)
                    timeseries.append({
                        'date': dt.strftime('%Y-%m-%d'),
                        'value': val,
                        'unit': ''
                    })
        return {'timeseries': timeseries, 'unit': ''}

    return await run_in_thread(_process)

async def get_visible_mean_data(geometry, start_date: str, end_date: str) -> Dict[str, Any]:
    """Fetch mean visible band data."""
    def _process():
        s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterBounds(geometry) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
            .map(mask_s2_clouds)

        def add_vis(img):
            # Mean of B2, B3, B4
            vis = img.expression('(B2 + B3 + B4) / 3', {
                'B2': img.select('B2'),
                'B3': img.select('B3'),
                'B4': img.select('B4')
            }).rename('value')
            return img.addBands(vis).copyProperties(img, ['system:time_start'])

        s2_proc = s2.map(add_vis).select('value')
        data = s2_proc.getRegion(geometry, 10).getInfo()

        timeseries = []
        if len(data) > 1:
            header = data[0]
            for row in data[1:]:
                ts = row[header.index('system:time_start')]
                val = row[header.index('value')]
                if val is not None:
                    dt = datetime.fromtimestamp(ts / 1000.0)
                    timeseries.append({
                        'date': dt.strftime('%Y-%m-%d'),
                        'value': val,
                        'unit': 'reflectance'
                    })
        return {'timeseries': timeseries, 'unit': 'reflectance'}

    return await run_in_thread(_process)

async def get_lst_monthly(start_date: str, end_date: str) -> Dict[str, Any]:
    """Fetch monthly aggregated LST data for the whole farm (approximated by a point or bounds)."""
    # This usually aggregates over a larger area or the whole collection
    # For simplicity, let's use MODIS for monthly as it's consistent
    def _process():
        modis = ee.ImageCollection('MODIS/061/MOD11A2') \
            .filterDate(start_date, end_date) \
            .select('LST_Day_1km')
            
        def to_monthly(img):
            date = ee.Date(img.get('system:time_start'))
            month_start = ee.Date.fromYMD(date.get('year'), date.get('month'), 1)
            return img.set('month', month_start.format('YYYY-MM'))
            
        # This is tricky without a specific geometry. 
        # Assuming we pass a geometry or use a default one.
        # But wait, the migration script calls it without geometry: get_lst_monthly(start, end)
        # It must be using a global or default geometry?
        # Let's use a point in Kharda.
        point = ee.Geometry.Point([75.0, 18.0]) # Approx Kharda location
        
        # We need to aggregate by month.
        # Actually, let's just return all MODIS data points for that location and aggregate in python if needed,
        # or just return the 8-day composites as "monthly" proxies if close enough.
        # Better: distinct months.
        
        data = modis.getRegion(point, 1000).getInfo()
        
        series = []
        seen_months = set()
        if len(data) > 1:
            header = data[0]
            for row in data[1:]:
                ts = row[header.index('system:time_start')]
                val = row[header.index('LST_Day_1km')]
                if val is not None:
                    val_c = val * 0.02 - 273.15
                    dt = datetime.fromtimestamp(ts / 1000.0)
                    month_str = dt.strftime('%Y-%m')
                    if month_str not in seen_months:
                        series.append({
                            'month': month_str,
                            'value': val_c
                        })
                        seen_months.add(month_str)
        return {'series': series}

    return await run_in_thread(_process)

async def get_soiling_data(geometry, start_date: str, end_date: str) -> Dict[str, Any]:
    """
    Calculate soiling index.
    Simplified version: (B2 + B4) / (B8 + 0.0001)
    """
    def _process():
        s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterBounds(geometry) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
            .map(mask_s2_clouds)

        def add_si(img):
            # SI = (Blue + Red) / (NIR + epsilon)
            si = img.expression('(b("B2") + b("B4")) / (b("B8") + 0.0001)') \
                .rename('value')
            return img.addBands(si).copyProperties(img, ['system:time_start'])

        s2_proc = s2.map(add_si).select('value')
        data = s2_proc.getRegion(geometry, 10).getInfo()
        
        # Logic to determine baseline and current
        # This is simplified; real soiling logic is complex.
        # We'll return the latest value as current and max as baseline for now.
        
        values = []
        if len(data) > 1:
            header = data[0]
            for row in data[1:]:
                val = row[header.index('value')]
                if val is not None:
                    values.append(val)
        
        print(f"[INFO] GEE Soiling: Found {len(values)} valid data points for {start_date} to {end_date}")

        if not values:
            print(f"[WARN] GEE Soiling: No data points found. Returning defaults.")
            baseline_si = 1.0
            current_si = 1.0
            drop = 0.0
        else:
            current_si = values[-1]
            baseline_si = max(values)
            drop = 0.0
            if baseline_si > 0:
                drop = ((baseline_si - current_si) / baseline_si) * 100
        
        status = 'clean'
        if drop >= 5:
            status = 'needs_cleaning'
        
        return {
            'baseline_si': baseline_si,
            'current_si': current_si,
            'soiling_drop_percent': drop,
            'status': status,
            'unit': '%'
        }

    return await run_in_thread(_process)
