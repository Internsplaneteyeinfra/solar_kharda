import { useEffect } from 'react';
import * as toGeoJSON from '@tmcw/togeojson';
import * as turf from '@turf/turf';
import L from 'leaflet';
import Header from "./solarSuitability/Header"
import UploadCard from "./solarSuitability/UploadCard"
import MapOptionsCard from "./solarSuitability/MapOptionsCard"
import ResultsSection from "./solarSuitability/ResultsSection"
import DataPanel from "./solarSuitability/DataPanel";
import FilterPanel from "./solarSuitability/FilterPanel";

import "./solarSuitability/solarSuitability.css"

export default function SolarSuitability() {
  useEffect(() => {
  window.toGeoJSON = toGeoJSON;
  window.turf = turf;
  window.L = L;

  const interval = setInterval(() => {
    const uploadBtn = document.getElementById('upload-btn');
    const kmlUploadInput = document.getElementById('kml-upload');

    if (uploadBtn && kmlUploadInput) {
      initAnalyzer();
      clearInterval(interval);
    }
  }, 200);

  return () => clearInterval(interval);
}, []);


  return (
    
    <div className="ss-container ss-app-shell text-slate-800">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-7xl min-h-screen">
        <Header />
        <div className="flex flex-col lg:flex-row justify-center gap-8 items-start">
          <UploadCard />
          <MapOptionsCard />
          <ResultsSection />
        </div>
        <DataPanel />
        <FilterPanel />
      </div>
    </div>
  )
}

let initialized = false;

export function initAnalyzer() {
    if (initialized) return;
    initialized = true;

    // --- DOM Element References ---
    const uploadBtn = document.getElementById('upload-btn');
    const kmlUploadInput = document.getElementById('kml-upload');
    const fileNameContainer = document.getElementById('file-name');
    const fileNameDisplay = fileNameContainer ? fileNameContainer.querySelector('span') : null;
    const landOwnershipSelect = document.getElementById('land-ownership');
    const resultsSection = document.getElementById('results-section');
    const resultsContent = document.getElementById('results-content');
    const decisionMatrixBody = document.getElementById('decision-matrix-body');
    const finalScoreDisplay = document.getElementById('final-score');
    const decisionResultDisplay = document.getElementById('decision-result');
    const suggestionsList = document.getElementById('suggestions-list');
    const loader = document.getElementById('loader');
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    const mapSection = document.getElementById('map-section');
    const kmlSummary = document.getElementById('kml-summary');
    const toggleKmlLayer = document.getElementById('toggle-kml-layer');
    const toggleScoreLayer = document.getElementById('toggle-score-layer');
    const progressContainer = document.getElementById('progress-container');
    const progressText = document.getElementById('progress-text');
    const progressPercentage = document.getElementById('progress-percentage');
    const progressBar = document.getElementById('progress-bar');

    // Debug: Check if toggle elements exist
    console.log('Toggle elements found:', {
        toggleKmlLayer: !!toggleKmlLayer,
        toggleScoreLayer: !!toggleScoreLayer
    });

    // --- Global Variables ---
    let map = null;
    let kmlLayer = null;
    let scoreLayer = null;
    let currentKmlData = null;
    let areaAnalysisResults = [];
    let fullAreaResults = []; // Store full area results for summary and decision matrix
    let currentMapType = 'roadmap'; // 'roadmap' or 'satellite'
    let streetViewMode = false;

    // Global function for street view (accessible from popup buttons)
    window.openStreetViewModal = function(lat, lng) {
        try {
            // Validate coordinates
            if (typeof lat !== 'number' || typeof lng !== 'number' || 
                isNaN(lat) || isNaN(lng) || 
                lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                showNotification('Invalid coordinates for Street View', 'error');
                return;
            }
            
            // Open Google Maps Street View in a new tab with better user experience
            const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
            
            // Create a temporary link to open in new tab
            const link = document.createElement('a');
            link.href = streetViewUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Show a brief notification
            showNotification('Opening Street View in new tab...', 'info');
        } catch (error) {
            console.error('Error opening Street View:', error);
            showNotification('Error opening Street View', 'error');
        }
    };

    // Show notification function
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg transition-all duration-300 ${
            type === 'info' ? 'bg-blue-500 text-white' : 
            type === 'success' ? 'bg-green-500 text-white' : 
            type === 'error' ? 'bg-red-500 text-white' : 'bg-gray-500 text-white'
        }`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    // --- Event Listeners ---
    if (!uploadBtn || !kmlUploadInput) {
        console.error('Upload button or input not found. Skipping event listeners.');
        return;
    }
    uploadBtn.addEventListener('click', () => kmlUploadInput.click());
    kmlUploadInput.addEventListener('change', handleKmlUpload);
    
    if (toggleKmlLayer) {
        toggleKmlLayer.addEventListener('change', toggleKmlLayerVisibility);
        console.log('KML layer toggle event listener attached');
    } else {
        console.warn('KML layer toggle element not found');
    }
    
    if (toggleScoreLayer) {
        toggleScoreLayer.addEventListener('change', toggleScoreLayerVisibility);
        console.log('Score layer toggle event listener attached');
    } else {
        console.warn('Score layer toggle element not found');
    }

    // Add event listeners for new map controls (will be set up after DOM is ready)
    function setupMapControls() {
        const streetViewToggle = document.getElementById('street-view-toggle');
        const mapTypeToggle = document.getElementById('map-type-toggle');
        
        if (streetViewToggle) {
            // Remove existing listeners to prevent duplicates
            streetViewToggle.removeEventListener('click', toggleStreetViewMode);
            streetViewToggle.addEventListener('click', toggleStreetViewMode);
            console.log('Street view toggle event listener attached');
        } else {
            console.warn('Street view toggle button not found');
        }
        
        if (mapTypeToggle) {
            // Remove existing listeners to prevent duplicates
            mapTypeToggle.removeEventListener('click', toggleMapType);
            mapTypeToggle.addEventListener('click', toggleMapType);
            console.log('Map type toggle event listener attached');
        } else {
            console.warn('Map type toggle button not found');
        }
    }
    
    // Add window resize listener to ensure map is properly sized
    window.addEventListener('resize', () => {
        if (map) {
            setTimeout(() => {
                map.invalidateSize();
                console.log('Map size invalidated on window resize');
            }, 100);
        }
    });

    // --- Enhanced Decision Matrix Configuration (Updated Weights) ---
    const parametersConfig = [
        { key: 'slope', name: 'Slope', weight: 0.20, unit: '°', higherIsBetter: false, thresholds: { best: 10.0, worst: 20 }, suggestion: 'Look for flatter terrain. High slopes increase construction costs and complexity.' },
        { key: 'ghi', name: 'Sunlight (GHI)', weight: 0.15, unit: ' kWh/m²/day', higherIsBetter: true, thresholds: { best: 4.0, worst: 3.0 }, suggestion: 'Site has lower than ideal solar irradiance. Consider areas with higher GHI for better energy yield.' },
        { key: 'temperature', name: 'Avg. Temperature', weight: 0.07, unit: ' °C', higherIsBetter: false, thresholds: { best: 25, worst: 40 }, suggestion: 'High average temperatures can reduce panel efficiency. Cooler sites are preferable.' },
        { key: 'elevation', name: 'Elevation', weight: 0.03, unit: ' m', suggestion: 'Site is outside the optimal elevation range (50-1500m), which can affect logistics and grid connection.' },
        { key: 'landCover', name: 'Land Cover', weight: 0.10, suggestion: 'Current land cover (e.g., forest, built-up area) may require significant clearing or preparation.' },
        { key: 'proximityToLines', name: 'Proximity to Power Lines', weight: 0.10, unit: ' km', higherIsBetter: false, thresholds: { best: 1, worst: 15 }, suggestion: 'Site is far from existing transmission lines (60kV/30kV), which will significantly increase grid connection costs. Consider proximity to substations for better connection options.' },
        { key: 'proximityToRoads', name: 'Proximity to Roads', weight: 0.05, unit: ' km', higherIsBetter: false, thresholds: { best: 1, worst: 10 }, suggestion: 'Poor road access will complicate logistics, transport, and construction.' },
        { key: 'waterAvailability', name: 'Water Availability', weight: 0.05, unit: ' km', higherIsBetter: false, thresholds: { best: 2, worst: 15 }, suggestion: 'Site is far from a water source, which is needed for panel cleaning and construction.' },
        { key: 'soilStability', name: 'Soil Stability (Depth)', weight: 0.05, unit: ' cm', higherIsBetter: true, thresholds: { best: 100, worst: 20 }, suggestion: 'Shallow soil depth may complicate foundation work for panel mountings.' },
        { key: 'shading', name: 'Shading (Hillshade)', weight: 0.05, unit: '', higherIsBetter: true, thresholds: { best: 200, worst: 100 }, suggestion: 'Terrain analysis indicates potential shading from nearby hills, which will reduce energy output.' },
        { key: 'dust', name: 'Dust (Aerosol Index)', weight: 0.03, unit: '', higherIsBetter: false, thresholds: { best: 0.1, worst: 0.5 }, suggestion: 'High dust levels will require more frequent panel cleaning, increasing maintenance costs.' },
        { key: 'windSpeed', name: 'Wind Speed', weight: 0.02, unit: ' km/h', higherIsBetter: false, thresholds: { best: 20, worst: 90 }, suggestion: 'Site experiences high wind speeds, requiring more robust and expensive mounting structures.' },
        { key: 'seismicRisk', name: 'Seismic Risk (PGA)', weight: 0.02, unit: ' g', higherIsBetter: false, thresholds: { best: 0.1, worst: 0.4 }, suggestion: 'High seismic risk requires specialized engineering for foundations and structures.' },
        { key: 'floodRisk', name: 'Flood Risk', weight: 0.02, unit: ' ha', higherIsBetter: false, thresholds: { best: 0, worst: 5 }, suggestion: 'A portion of the site is in a flood-prone area, posing a risk to equipment.' },
        { key: 'landOwnership', name: 'Land Ownership', weight: 0.06, suggestion: 'Private land ownership can lead to longer acquisition times and higher costs compared to government land.' },
    ];

    // Land usability factors for vegetation bias correction
    const landUsabilityFactors = {
        10: 0.3,  // Tree cover - dense forest
        20: 0.8,  // Shrubland - sparse vegetation
        30: 1.0,  // Grassland - good for solar
        40: 0.6,  // Cropland - moderate
        50: 0.1,  // Built-up - poor
        60: 1.0,  // Bare/sparse vegetation - excellent
        70: 0.0,  // Snow and ice - poor
        80: 0.0,  // Water bodies - poor
        90: 0.2,  // Wetlands - poor
        95: 0.2,  // Mangroves - poor
        100: 0.5  // Moss and lichen - moderate
    };

    /**
     * Enhanced KML parsing to handle multiple polygons
     */
    function parseKmlFile(kmlContent) {
        try {
            const kmlDom = new DOMParser().parseFromString(kmlContent, 'text/xml');
            const geoJson = toGeoJSON.kml(kmlDom);
            
            // Extract all polygon features
            const polygonFeatures = geoJson.features.filter(f => 
                f.geometry && f.geometry.type === 'Polygon'
            );

            if (polygonFeatures.length === 0) {
                throw new Error('No polygon found in the KML file.');
            }

            // Clean geometries and add metadata
            const cleanedFeatures = polygonFeatures.map((feature, index) => {
                const cleanedGeometry = cleanGeometry(feature.geometry);
                return {
                    ...feature,
                    geometry: cleanedGeometry,
                    properties: {
                        ...feature.properties,
                        id: feature.properties.name || `Area ${index + 1}`,
                        originalIndex: index
                    }
                };
            });

            return {
                type: 'FeatureCollection',
                features: cleanedFeatures
            };

        } catch (error) {
            throw new Error(`Could not parse KML: ${error.message}`);
        }
    }

    /**
     * Clean geometry coordinates (remove altitude)
     */
    function cleanGeometry(geometry) {
        if (geometry.type === 'Polygon') {
            geometry.coordinates = geometry.coordinates.map(ring => {
                return ring.map(point => {
                    // Ensure we have valid coordinates
                    if (Array.isArray(point) && point.length >= 2) {
                        return [point[0], point[1]]; // Keep as [lng, lat] for now
                    }
                    return point;
                });
            });
        }
        return geometry;
    }

    /**
     * Divide polygon into smaller sub-areas for analysis
     */
    function dividePolygonIntoSubAreas(polygon, maxArea = 1.0) { // maxArea in square degrees - increased to reduce division
        const subAreas = [];
        const bounds = L.polygon(polygon.coordinates[0]).getBounds();
        const area = calculatePolygonArea(polygon.coordinates[0]);
        
        if (area <= maxArea) {
            return [polygon];
        }

        // Calculate grid size based on area
        const gridSize = Math.ceil(Math.sqrt(area / maxArea));
        const latStep = (bounds.getNorth() - bounds.getSouth()) / gridSize;
        const lngStep = (bounds.getEast() - bounds.getWest()) / gridSize;

        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                const south = bounds.getSouth() + i * latStep;
                const north = bounds.getSouth() + (i + 1) * latStep;
                const west = bounds.getWest() + j * lngStep;
                const east = bounds.getWest() + (j + 1) * lngStep;

                const gridPolygon = {
                    type: 'Polygon',
                    coordinates: [[
                        [west, south],
                        [east, south],
                        [east, north],
                        [west, north],
                        [west, south]
                    ]]
                };

                // Check if grid cell intersects with original polygon
                if (polygonIntersects(polygon, gridPolygon)) {
                    subAreas.push(gridPolygon);
                }
            }
        }

        return subAreas.length > 0 ? subAreas : [polygon];
    }

    /**
     * Calculate polygon area using shoelace formula
     */
    function calculatePolygonArea(coordinates) {
        let area = 0;
        const n = coordinates.length - 1; // Exclude last duplicate point
        
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += coordinates[i][0] * coordinates[j][1];
            area -= coordinates[j][0] * coordinates[i][1];
        }
        
        return Math.abs(area) / 2;
    }

    /**
     * Check if two polygons intersect
     */
    function polygonIntersects(poly1, poly2) {
        // Simple bounding box intersection check
        const bounds1 = L.polygon(poly1.coordinates[0]).getBounds();
        const bounds2 = L.polygon(poly2.coordinates[0]).getBounds();
        
        return !(bounds1.getEast() < bounds2.getWest() || 
                bounds1.getWest() > bounds2.getEast() || 
                bounds1.getNorth() < bounds2.getSouth() || 
                bounds1.getSouth() > bounds2.getNorth());
    }

    /**
     * Initialize the map
     */
    function initializeMap() {
        if (map) {
            map.remove();
        }

        map = L.map('map').setView([0, 0], 2);
        
        // Initialize tile layers
        const roadmapLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        });

        const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
            maxZoom: 20
        });

        // Add default layer
        roadmapLayer.addTo(map);
        
        // Store layers for toggling
        map.roadmapLayer = roadmapLayer;
        map.satelliteLayer = satelliteLayer;

        // Initialize layers
        kmlLayer = L.layerGroup();
        scoreLayer = L.layerGroup();
        
        // Add layers to map
        map.addLayer(kmlLayer);
        map.addLayer(scoreLayer);
        console.log('Map initialized with KML and score layers');
        
        // Ensure toggles are checked by default
        if (toggleKmlLayer) {
            toggleKmlLayer.checked = true;
        }
        if (toggleScoreLayer) {
            toggleScoreLayer.checked = true;
        }
    }

    /**
     * Get color based on score
     */
    function getScoreColor(score) {
        if (score >= 8) return '#10b981'; // green-500
        if (score >= 5) return '#f59e0b'; // yellow-500
        if (score >= 3) return '#f97316'; // orange-500
        return '#ef4444'; // red-500
    }

    /**
     * Display KML polygons on map
     */
    function displayKmlOnMap(kmlData) {
        if (!map) initializeMap();
        
        kmlLayer.clearLayers();
        
        kmlData.features.forEach((feature, index) => {
            console.log(`Creating KML polygon ${index + 1} with ${feature.geometry.coordinates[0].length} coordinate points`);
            console.log('Sample coordinates:', feature.geometry.coordinates[0].slice(0, 3));
            
            // Ensure coordinates are in the correct format [lng, lat]
            const coordinates = feature.geometry.coordinates[0].map(coord => {
                if (Array.isArray(coord) && coord.length >= 2) {
                    return [coord[1], coord[0]]; // Convert [lng, lat] to [lat, lng] for Leaflet
                }
                return coord;
            });
            
            console.log('Converted coordinates sample:', coordinates.slice(0, 3));
            
            const polygon = L.polygon(coordinates, {
                color: '#1e40af', // Darker blue for better visibility
                weight: 4,
                opacity: 1,
                fillColor: '#3b82f6',
                fillOpacity: 0.3,
                dashArray: '5, 5' // Dashed border to distinguish from score overlays
            });

            // Add click event to open street view at polygon center
            polygon.on('click', function(e) {
                const center = polygon.getBounds().getCenter();
                if (streetViewMode) {
                    openStreetViewModal(center.lat, center.lng);
                }
            });

            polygon.bindPopup(`
                <div class="p-4 min-w-[200px]">
                    <h4 class="font-semibold text-slate-800 mb-2">${feature.properties.id || `Area ${index + 1}`}</h4>
                    <p class="text-sm text-slate-600 mb-2">Uploaded KML Boundary</p>
                    <div class="flex items-center gap-2 text-xs text-slate-500">
                        <span>${streetViewMode ? 'Click to open Street View' : 'Enable Street View mode to click for Street View'}</span>
                        <span>🗺️</span>
                    </div>
                    ${!streetViewMode ? '<p class="text-xs text-blue-600 mt-2">💡 Toggle Street View mode to enable click-to-view</p>' : ''}
                </div>
            `);

            kmlLayer.addLayer(polygon);
            console.log(`Added KML polygon ${index + 1} to layer`);
        });

        console.log(`Total KML polygons added: ${kmlLayer.getLayers().length}`);

        // Fit map to show all polygons
        if (kmlData.features.length > 0) {
            const group = new L.featureGroup(kmlLayer.getLayers());
            map.fitBounds(group.getBounds().pad(0.1));
            console.log('Map bounds fitted to KML polygons');
        }
    }

    /**
     * Display score-based visualization
     */
    function displayScoreVisualization(analysisResults) {
        if (!map) {
            console.error('Map not initialized');
            return;
        }
        
        console.log('Displaying score visualization for', analysisResults.length, 'results');
        scoreLayer.clearLayers();
        
        if (analysisResults.length === 0) {
            console.warn('No analysis results to display');
            return;
        }
        
        analysisResults.forEach((result, index) => {
            const score = result.finalScore;
            const color = getScoreColor(score);
            
            console.log(`Area ${index + 1}: Score ${score.toFixed(2)}, Color ${color}`);
            
            if (!result.subAreas || result.subAreas.length === 0) {
                console.warn(`No sub-areas for result ${index}`);
                return;
            }
            
            result.subAreas.forEach((subArea, subIndex) => {
                if (!subArea || !subArea.coordinates || !subArea.coordinates[0]) {
                    console.warn(`Invalid sub-area data for result ${index}, sub-area ${subIndex}`);
                    return;
                }
                
                console.log(`Creating polygon for area ${index + 1}, sub-area ${subIndex + 1}`);
                
                // Ensure coordinates are in the correct format [lng, lat]
                const coordinates = subArea.coordinates[0].map(coord => {
                    if (Array.isArray(coord) && coord.length >= 2) {
                        return [coord[1], coord[0]]; // Convert [lng, lat] to [lat, lng] for Leaflet
                    }
                    return coord;
                });
                
                const polygon = L.polygon(coordinates, {
                    color: color,
                    weight: 2,
                    opacity: 0.8,
                    fillColor: color,
                    fillOpacity: 0.5 // Reduced opacity to see KML boundaries underneath
                });

                // Add hover effects
                polygon.on('mouseover', function(e) {
                    this.setStyle({
                        weight: 3,
                        opacity: 1,
                        fillOpacity: 0.8
                    });
                });

                polygon.on('mouseout', function(e) {
                    this.setStyle({
                        weight: 2,
                        opacity: 0.9,
                        fillOpacity: 0.7
                    });
                });

                // Enhanced popup with more details and street view
                const popupContent = `
                    <div class="p-4 min-w-[280px]">
                        <h4 class="font-semibold text-slate-800 mb-2">${result.areaId || `Area ${index + 1}`}</h4>
                        <div class="mb-3">
                            <p class="text-sm text-slate-600 mb-1">Solar Suitability Score: <span class="font-bold text-lg" style="color: ${color}">${score.toFixed(2)}</span></p>
                            <div class="w-full bg-slate-200 rounded-full h-2 mb-2">
                                <div class="h-2 rounded-full transition-all duration-300" style="background-color: ${color}; width: ${(score / 10) * 100}%"></div>
                            </div>
                        </div>
                        <div class="text-xs text-slate-500 space-y-1 mb-3">
                            <p><span class="font-medium">Slope:</span> ${result.rawData.slope?.toFixed(2) || 'N/A'}°</p>
                            <p><span class="font-medium">GHI:</span> ${result.rawData.ghi?.toFixed(2) || 'N/A'} kWh/m²/day</p>
                            <p><span class="font-medium">Elevation:</span> ${result.rawData.elevation?.toFixed(0) || 'N/A'} m</p>
                            <p><span class="font-medium">Temperature:</span> ${result.rawData.temperature?.toFixed(1) || 'N/A'}°C</p>
                            <p><span class="font-medium">Power Lines:</span> ${result.rawData.proximityToLines?.toFixed(2) || 'N/A'} km</p>
                        </div>
                        <button onclick="openStreetViewModal(${coordinates[0][0]}, ${coordinates[0][1]})" 
                                class="w-full bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium py-2 px-3 rounded transition-colors">
                            🗺️ Open Street View
                        </button>
                        ${!streetViewMode ? '<p class="text-xs text-blue-600 mt-2 text-center">💡 Enable Street View mode for click-to-view</p>' : ''}
                    </div>
                `;

                polygon.bindPopup(popupContent, {
                    className: 'custom-popup'
                });

                scoreLayer.addLayer(polygon);
                console.log(`Added polygon to score layer for area ${index + 1}, sub-area ${subIndex + 1}`);
            });
        });
        
        console.log(`Total polygons added to score layer: ${scoreLayer.getLayers().length}`);
    }

    /**
     * Toggle KML layer visibility
     */
    function toggleKmlLayerVisibility() {
        if (!map) {
            console.warn('Map not initialized for KML layer toggle');
            return;
        }
        
        if (toggleKmlLayer.checked) {
            if (!map.hasLayer(kmlLayer)) {
                map.addLayer(kmlLayer);
                console.log('KML layer added to map');
            }
        } else {
            if (map.hasLayer(kmlLayer)) {
                map.removeLayer(kmlLayer);
                console.log('KML layer removed from map');
            }
        }
    }

    /**
     * Toggle score layer visibility
     */
    function toggleScoreLayerVisibility() {
        if (!map) {
            console.warn('Map not initialized for score layer toggle');
            return;
        }
        
        if (toggleScoreLayer.checked) {
            if (!map.hasLayer(scoreLayer)) {
                map.addLayer(scoreLayer);
                console.log('Score layer added to map');
            }
        } else {
            if (map.hasLayer(scoreLayer)) {
                map.removeLayer(scoreLayer);
                console.log('Score layer removed from map');
            }
        }
    }

    /**
     * Toggle street view mode
     */
    function toggleStreetViewMode() {
        streetViewMode = !streetViewMode;
        const button = document.getElementById('street-view-toggle');
        const icon = button.querySelector('i');
        const text = button.querySelector('span');
        
        if (streetViewMode) {
            button.classList.add('active');
            icon.setAttribute('data-lucide', 'eye');
            text.textContent = 'Street View ON';
            showNotification('Street View mode enabled. Click on map areas to open Street View.', 'info');
        } else {
            button.classList.remove('active');
            icon.setAttribute('data-lucide', 'map-pin');
            text.textContent = 'Street View';
            showNotification('Street View mode disabled.', 'info');
        }
        
        // Update existing popups to reflect street view mode
        updatePopupContent();
        
        // Re-render icons
        lucide.createIcons();
    }

    /**
     * Update popup content to reflect current street view mode
     */
    function updatePopupContent() {
        if (!map) return;
        
        try {
            // Update KML layer popups
            if (kmlLayer) {
                kmlLayer.eachLayer(function(layer) {
                    if (layer.getPopup()) {
                        const popup = layer.getPopup();
                        const content = popup.getContent();
                        // Re-bind popup to update content
                        layer.bindPopup(content);
                    }
                });
            }
            
            // Update score layer popups
            if (scoreLayer) {
                scoreLayer.eachLayer(function(layer) {
                    if (layer.getPopup()) {
                        const popup = layer.getPopup();
                        const content = popup.getContent();
                        // Re-bind popup to update content
                        layer.bindPopup(content);
                    }
                });
            }
        } catch (error) {
            console.warn('Error updating popup content:', error);
        }
    }

    /**
     * Toggle map type between roadmap and satellite
     */
    function toggleMapType() {
        if (!map) {
            console.warn('Map not initialized for map type toggle');
            return;
        }
        
        const button = document.getElementById('map-type-toggle');
        if (!button) {
            console.warn('Map type toggle button not found');
            return;
        }
        
        const icon = button.querySelector('i');
        const text = button.querySelector('span');
        
        try {
            if (currentMapType === 'roadmap') {
                // Switch to satellite
                if (map.roadmapLayer && map.hasLayer(map.roadmapLayer)) {
                    map.removeLayer(map.roadmapLayer);
                }
                if (map.satelliteLayer) {
                    map.addLayer(map.satelliteLayer);
                }
                currentMapType = 'satellite';
                if (icon) icon.setAttribute('data-lucide', 'map');
                if (text) text.textContent = 'Road';
                showNotification('Switched to satellite view', 'info');
            } else {
                // Switch to roadmap
                if (map.satelliteLayer && map.hasLayer(map.satelliteLayer)) {
                    map.removeLayer(map.satelliteLayer);
                }
                if (map.roadmapLayer) {
                    map.addLayer(map.roadmapLayer);
                }
                currentMapType = 'roadmap';
                if (icon) icon.setAttribute('data-lucide', 'layers');
                if (text) text.textContent = 'Satellite';
                showNotification('Switched to roadmap view', 'info');
            }
            
            // Re-render icons
            lucide.createIcons();
        } catch (error) {
            console.error('Error toggling map type:', error);
            showNotification('Error switching map type', 'error');
        }
    }


    /**
     * Update progress indicator
     */
    function updateProgress(current, total, message) {
        const percentage = Math.round((current / total) * 100);
        progressText.textContent = message;
        progressPercentage.textContent = `${percentage}%`;
        progressBar.style.width = `${percentage}%`;
    }

    /**
     * Show progress indicator
     */
    function showProgress() {
        progressContainer.classList.remove('hidden');
    }

    /**
     * Hide progress indicator
     */
    function hideProgress() {
        progressContainer.classList.add('hidden');
    }

    /**
     * Update KML summary statistics
     */
    function updateKmlSummary(analysisResults) {
        if (analysisResults.length === 0) {
            console.warn('No analysis results for summary');
            return;
        }

        console.log('Updating KML summary with', analysisResults.length, 'full area results');
        
        // Use full area results for summary statistics
        const scores = analysisResults.map(r => r.finalScore);
        const totalAreas = analysisResults.length; // Count of full areas, not sub-areas
        const highestScore = Math.max(...scores);
        const lowestScore = Math.min(...scores);
        const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

        console.log('Summary scores:', { scores, highestScore, lowestScore, averageScore });

        document.getElementById('total-areas').textContent = totalAreas;
        document.getElementById('highest-score').textContent = highestScore.toFixed(2);
        document.getElementById('lowest-score').textContent = lowestScore.toFixed(2);
        document.getElementById('average-score').textContent = averageScore.toFixed(2);
    }

    /**
     * Handle KML file upload
     */
    function handleKmlUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Check file size (5MB limit)
        const maxSize = 5 * 1024 * 1024; // 5MB in bytes
        if (file.size > maxSize) {
            displayError('File size exceeds 5MB limit. Please upload a smaller KML file.');
            return;
        }

        // Clear previous results and reset state
        clearPreviousResults();

        if (fileNameDisplay) {
            fileNameDisplay.textContent = file.name;
        }
        if (fileNameContainer) {
            fileNameContainer.classList.remove('hidden');
        }
        
        // Show results section and loading indicator at the top
        resultsSection.classList.remove('hidden');
        resultsSection.style.opacity = '1';
        resultsContent.classList.add('hidden');
        loader.classList.remove('hidden');
        errorMessage.classList.add('hidden');
        mapSection.classList.add('hidden');
        kmlSummary.classList.add('hidden');
        hideProgress();

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                // Parse KML file
                const kmlData = parseKmlFile(e.target.result);
                currentKmlData = kmlData;

                // Initialize map
                initializeMap();
                console.log('Map initialized:', map);
                displayKmlOnMap(kmlData);

                // Show progress for large files
                if (kmlData.features.length > 1) {
                    showProgress();
                }
                
                // Show notification that analysis is starting
                showNotification('Starting KML analysis...', 'info');

                // Analyze each polygon (no division - use full areas)
                areaAnalysisResults = [];

                // First, analyze the original full areas for main scoring
                updateProgress(0, kmlData.features.length, 'Analyzing full areas for main scores...');
                fullAreaResults = []; // Reset global variable
                for (let i = 0; i < kmlData.features.length; i++) {
                    const feature = kmlData.features[i];
                    const fullAreaResult = await analyzeGeometry(feature.geometry);
                    fullAreaResults.push({
                        ...fullAreaResult,
                        areaId: feature.properties.id,
                        areaIndex: i,
                        isFullArea: true
                    });
                    updateProgress(i + 1, kmlData.features.length, `Analyzing full area ${i + 1} of ${kmlData.features.length}...`);
                }

                // Always use full area results for visualization (no division)
                // This ensures the score overlay matches the uploaded KML exactly
                areaAnalysisResults = fullAreaResults.map(result => ({
                    ...result,
                    subAreas: [kmlData.features[result.areaIndex].geometry]
                }));

                // Debug logging
                console.log('Full area results:', fullAreaResults);
                console.log('Area analysis results for visualization:', areaAnalysisResults);
                
                // Display results with smooth animations
                try {
                    displayScoreVisualization(areaAnalysisResults);
                    console.log('Score visualization completed successfully');
                } catch (error) {
                    console.error('Error displaying score visualization:', error);
                    // Fallback: just show KML boundaries
                    displayKmlOnMap(kmlData);
                }
                
                updateKmlSummary(fullAreaResults); // Use full area results for summary
                
                // Ensure map is visible and properly sized
                if (map) {
                    setTimeout(() => {
                        map.invalidateSize();
                        if (kmlData.features.length > 0) {
                            const group = new L.featureGroup(kmlLayer.getLayers());
                            if (group.getLayers().length > 0) {
                                map.fitBounds(group.getBounds().pad(0.1));
                            }
                        }
                        console.log('Map size invalidated and bounds fitted');
                        
                        // Force layer refresh
                        if (kmlLayer && kmlLayer.getLayers().length > 0) {
                            console.log('KML layer has', kmlLayer.getLayers().length, 'polygons');
                        }
                        if (scoreLayer && scoreLayer.getLayers().length > 0) {
                            console.log('Score layer has', scoreLayer.getLayers().length, 'polygons');
                        }
                    }, 100);
                }
                
                // Hide progress and show results with smooth transitions
                hideProgress();
                
                // Show success notification
                showNotification('KML analysis completed successfully!', 'success');
                
                // Show map and summary sections with fade-in animation
                mapSection.classList.remove('hidden');
                kmlSummary.classList.remove('hidden');
                console.log('Map and summary sections made visible');
                
                // Setup map controls after map is visible
                setupMapControls();
                
                // Ensure map is properly sized (simplified approach)
                if (map) {
                    map.getContainer().style.display = 'block';
                    // Use a more efficient approach with fewer invalidateSize calls
                    setTimeout(() => {
                        map.invalidateSize();
                        console.log('Map size invalidated after showing container');
                    }, 100);
                }
                
                // Add fade-in animation
                setTimeout(() => {
                    mapSection.style.opacity = '0';
                    kmlSummary.style.opacity = '0';
                    mapSection.style.transition = 'opacity 0.5s ease-in-out';
                    kmlSummary.style.transition = 'opacity 0.5s ease-in-out';
                    
                    setTimeout(() => {
                        mapSection.style.opacity = '1';
                        kmlSummary.style.opacity = '1';
                        
                        // Final map size adjustment after animation
                        if (map) {
                            setTimeout(() => {
                                map.invalidateSize();
                                console.log('Map size invalidated after fade-in animation');
                            }, 100);
                        }
                    }, 100);
                }, 100);

                // Display first area's detailed results in the decision matrix (use full area result)
                if (fullAreaResults.length > 0) {
                    console.log('Displaying results for first area:', fullAreaResults[0]);
                    displayResults(fullAreaResults[0]);
                } else {
                    console.warn('No full area results to display');
                }

                loader.classList.add('hidden');
                resultsContent.classList.remove('hidden');
                lucide.createIcons();

            } catch (error) {
                displayError(`Analysis failed: ${error.message}`);
                showNotification('Analysis failed. Please check the console for details.', 'error');
            }
        };
        reader.readAsText(file);
    }

    /**
     * Analyze a single geometry
     */
    async function analyzeGeometry(geometry) {
    const apiUrl = 'http://localhost:8000/api/analyze/';
    try {
        console.log("Step 1: Sending request to Python Backend...");
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ geometry }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown server error' }));
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        const rawData = await response.json();
        console.log("Step 2: Backend Data Received:", rawData);

        // --- Step 3: Calculate Suitability Score ---
        // We calculate a score from 0 to 10 based on the data
        const finalScore = calculateFinalScore(rawData);
        
        // --- Step 4: Update the UI Decision Result ---
        const decisionResultDisplay = document.getElementById('decision-result');
        const finalScoreDisplay = document.getElementById('final-score');

        if (decisionResultDisplay && finalScoreDisplay) {
            finalScoreDisplay.innerText = finalScore.toFixed(1);
            
            // If score is 6 or higher, it shows "Highly Suitable"
            if (finalScore >= 6.0) {
                decisionResultDisplay.innerText = "Highly Suitable";
                decisionResultDisplay.style.color = "#10b981"; // Green
            } else {
                decisionResultDisplay.innerText = "Not Suitable";
                decisionResultDisplay.style.color = "#ef4444"; // Red
            }
        }

        return {
            rawData,
            finalScore,
            subAreas: [geometry]
        };

    } catch (error) {
        console.error("Analysis Error:", error);
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('Cannot connect to analysis server. Please ensure the backend is running on port 8000.');
        }
        throw new Error(`Analysis failed: ${error.message}`);
    }
}
    /**
     * Analyze multiple geometries in batch for better performance
     */
    async function analyzeGeometriesBatch(geometries) {
        const apiUrl = 'http://localhost:8000/api/analyze/batch';
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ geometries }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const data = await response.json();
            return data.results.map(rawData => {
                if (rawData.error) {
                    return rawData;
                }
                const finalScore = calculateFinalScore(rawData);
                return {
                    rawData,
                    finalScore
                };
            });

        } catch (error) {
            throw new Error(`Batch analysis failed: ${error.message}`);
        }
    }

    /**
     * Fix floating-point precision issues for categorical parameters
     */
    function fixPrecisionIssues(key, value) {
        if (value === undefined || value === null) return value;
        
        // Fix categorical parameters that should be integers
        if (key === 'landCover' || key === 'landOwnership') {
            return Math.round(value);
        }
        
        return value;
    }

    /**
     * Enhanced final weighted score calculation with vegetation bias correction
     */
    function calculateFinalScore(rawData) {
        let totalWeightedScore = 0;

        parametersConfig.forEach(param => {
            let rawValue = fixPrecisionIssues(param.key, rawData[param.key]);
            let score = 0;

            // Handle special cases with enhanced logic
            if (param.key === 'landOwnership') {
                rawValue = parseInt(landOwnershipSelect.value, 10);
                score = (rawValue === 1) ? 10 : 5;
            } else if (param.key === 'elevation') {
                score = (rawValue >= 50 && rawValue <= 1500) ? 10 : 2;
            } else if (param.key === 'landCover') {
                // Enhanced land cover scoring with vegetation bias correction
                score = calculateEnhancedLandCoverScore(rawValue, rawData);
            } else if (param.thresholds) {
                score = calculateScore(rawValue, param);
            } else {
                // Default score for parameters without thresholds
                score = 5;
            }

            const weightedScore = score * param.weight;
            totalWeightedScore += weightedScore;
            
            // Debug logging for each parameter
            console.log(`${param.name}: raw=${rawValue}, score=${score}, weight=${param.weight}, weighted=${weightedScore.toFixed(3)}`);
        });

        // The totalWeightedScore is already on 0-10 scale (max possible = 10)
        // Return it as-is for 0-10 scale
        const finalScore = totalWeightedScore;
        
        // Debug logging
        console.log('=== SCORING DEBUG ===');
        console.log('Final weighted score (0-10):', finalScore);
        console.log('Max possible score (0-10):', 10);
        
        return Math.min(10, Math.max(0, finalScore));
    }

    /**
     * Enhanced land cover scoring with vegetation bias correction and water detection
     */
    function calculateEnhancedLandCoverScore(landCoverCode, rawData) {
        // First check for water using NDVI - water typically has very low or negative NDVI
        if (rawData.ndvi !== undefined && rawData.ndvi < -0.1) {
            // Very low NDVI indicates water bodies - score 0
            return 0;
        }
        
        // Base scoring using ESA WorldCover classification
        let baseScore = 5; // Default neutral score
        
        if (landCoverCode === 50) { // Built-up areas
            baseScore = 1; // Very poor for solar
        } else if (landCoverCode === 80 || landCoverCode === 90 || landCoverCode === 95) { // Water bodies, wetlands, mangroves
            // Additional water detection using NDVI
            if (rawData.ndvi !== undefined && rawData.ndvi < 0.1) {
                baseScore = 0; // Definitely water - score 0
            } else {
                baseScore = 2; // Poor for solar (wetlands/mangroves)
            }
        } else if (landCoverCode === 10) { // Tree cover
            baseScore = 3; // Poor - requires clearing
        } else if (landCoverCode === 30 || landCoverCode === 40 || landCoverCode === 60) { // Grassland, cropland, bare areas
            baseScore = 10; // Good for solar
        } else if (landCoverCode === 20) { // Shrubland
            baseScore = 8; // Good with some clearing needed
        }

        // Apply vegetation bias correction (only for non-water areas)
        if (rawData.ndvi && rawData.ndvi > 0.3 && baseScore > 0) {
            const landUsabilityFactor = landUsabilityFactors[landCoverCode] || 0.5;
            
            // If NDVI > 0.3 but land usability factor >= 0.6, don't penalize heavily
            if (landUsabilityFactor >= 0.6) {
                // Adjust score: Score = Score + (NDVI * 0.2 * Land_Usability_Factor)
                const vegetationAdjustment = rawData.ndvi * 0.2 * landUsabilityFactor;
                baseScore = Math.min(10, baseScore + vegetationAdjustment);
            }
        }

        return baseScore;
    }

    /**
     * Calculate score for a parameter
     */
    function calculateScore(value, { thresholds, higherIsBetter }) {
        if (value === null || value === undefined) return 0;
        const { best, worst } = thresholds;
        if (higherIsBetter) {
            if (value >= best) return 10;
            if (value <= worst) return 1;
            return 1 + 9 * ((value - worst) / (best - worst));
        } else {
            if (value <= best) return 10;
            if (value >= worst) return 1;
            return 1 + 9 * ((worst - value) / (worst - best));
        }
    }

    /**
     * Display error message
     */
    function displayError(message) {
        loader.classList.add('hidden');
        resultsContent.classList.add('hidden');
        errorText.textContent = message;
        errorMessage.classList.remove('hidden');
    }

    /**
     * Clear previous results and reset state
     */
    function clearPreviousResults() {
        // Clear map layers
        if (kmlLayer) kmlLayer.clearLayers();
        if (scoreLayer) scoreLayer.clearLayers();
        
        // Reset global variables
        currentKmlData = null;
        areaAnalysisResults = [];
        fullAreaResults = [];
        
        // Clear file input to allow re-upload of same file
        const kmlUploadInput = document.getElementById('kml-upload');
        if (kmlUploadInput) {
            kmlUploadInput.value = '';
        }
    }

    /**
     * Display results in decision matrix (for single area analysis)
     */
    function displayResults(analysisResult) {
        const rawData = analysisResult.rawData;
        decisionMatrixBody.innerHTML = '';
        suggestionsList.innerHTML = '';
        let suggestions = [];

        // Use the enhanced final score calculation
        const totalWeightedScore = calculateFinalScore(rawData);

        // Display ALL parameters from the configuration
        parametersConfig.forEach(param => {
            let rawValue = fixPrecisionIssues(param.key, rawData[param.key]);
            let score = 0;

            // Handle special cases with enhanced logic
            if (param.key === 'landOwnership') {
                rawValue = parseInt(landOwnershipSelect.value, 10);
                score = (rawValue === 1) ? 10 : 5;
            } else if (param.key === 'elevation') {
                score = (rawValue >= 50 && rawValue <= 1500) ? 10 : 2;
            } else if (param.key === 'landCover') {
                // Use enhanced land cover scoring with vegetation bias correction
                score = calculateEnhancedLandCoverScore(rawValue, rawData);
            } else if (param.thresholds) {
                score = calculateScore(rawValue, param);
            } else {
                // Default score for parameters without thresholds
                score = 5;
            }

            const weightedScore = score * param.weight;

            // Add suggestions for parameters with low scores
            if (score < 5 && param.suggestion) {
                suggestions.push(param.suggestion);
            }

            // Format raw value display
            let displayValue = 'N/A';
            if (rawValue !== null && rawValue !== undefined) {
                if (param.key === 'landOwnership') {
                    // Use the user's selection from the dropdown, not the backend value
                    const userSelection = parseInt(landOwnershipSelect.value, 10);
                    displayValue = userSelection === 1 ? 'Government/Barren Land' : 'Private Land';
                } else if (param.key === 'landCover') {
                    displayValue = rawValue.toString();
                } else {
                    displayValue = Number(rawValue).toFixed(2);
                }
            }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">${param.name}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">${displayValue}${param.unit || ''}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-bold">${score.toFixed(1)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">${(param.weight * 100).toFixed(0)}%</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-bold">${weightedScore.toFixed(2)}</td>
            `;
            decisionMatrixBody.appendChild(row);
        });

        // Update summary
        finalScoreDisplay.textContent = totalWeightedScore.toFixed(2);
        let decision = '';
        let decisionColor = '';
        let decisionIcon = '';

        if (totalWeightedScore >= 7) {
            decision = 'Yes';
            decisionColor = 'text-green-600';
            decisionIcon = '<i data-lucide="check-circle-2" class="w-10 h-10"></i>';
        } else if (totalWeightedScore >= 5) {
            decision = 'Review';
            decisionColor = 'text-amber-600';
            decisionIcon = '<i data-lucide="alert-triangle" class="w-10 h-10"></i>';
        } else {
            decision = 'No';
            decisionColor = 'text-red-600';
            decisionIcon = '<i data-lucide="x-circle" class="w-10 h-10"></i>';
        }
        decisionResultDisplay.innerHTML = `${decisionIcon}<span>${decision}</span>`;
        decisionResultDisplay.className = `text-5xl font-bold my-2 flex items-center justify-center gap-3 ${decisionColor}`;

        // Update suggestions - show all parameter-based suggestions
        if (suggestions.length > 0) {
            suggestions.forEach(s => {
                const li = document.createElement('li');
                li.className = 'flex items-start gap-2 text-slate-600';
                li.innerHTML = `
                    <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0"></i>
                    <span>${s}</span>
                `;
                suggestionsList.appendChild(li);
            });
        } else {
            suggestionsList.innerHTML = `
                <li class="flex items-start gap-2 text-slate-600">
                    <i data-lucide="check-circle" class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0"></i>
                    <span>Excellent site! No major concerns identified based on the parameters.</span>
                </li>
            `;
        }
        
        // Re-render icons for suggestions
        lucide.createIcons();

        // Display power line details if available
        displayPowerLineDetails(rawData.powerLineDetails);
    }

    /**
     * Display power line details
     */
    function displayPowerLineDetails(powerLineDetails) {
        const powerLineSection = document.getElementById('power-line-details');
        const aerialDistanceEl = document.getElementById('aerial-distance');
        const roadDistanceEl = document.getElementById('road-distance');
        const roadDistanceNoteEl = document.getElementById('road-distance-note');
        const voltageLevelEl = document.getElementById('voltage-level');

        if (!powerLineDetails) {
            powerLineSection.classList.add('hidden');
            return;
        }

        // Show the section
        powerLineSection.classList.remove('hidden');

        // Update the values
        const aerialDist = powerLineDetails.aerialDistance ? powerLineDetails.aerialDistance.toFixed(2) : 'N/A';
        const roadDist = powerLineDetails.roadDistance ? powerLineDetails.roadDistance.toFixed(2) : 'N/A';
        const rawVoltage = powerLineDetails.nearestPowerLine?.voltage || 'Unknown';
        
        // Clean and validate voltage data
        let voltage = 'Unknown';
        if (rawVoltage && rawVoltage !== 'Unknown') {
            // Extract numeric values from voltage string (e.g., "60000" from "60000V" or "60" from "60kV")
            const voltageMatch = rawVoltage.toString().match(/(\d+)/);
            if (voltageMatch) {
                const voltageNum = parseInt(voltageMatch[1]);
                // Convert to kV if the number is large (likely in volts)
                if (voltageNum >= 1000) {
                    voltage = (voltageNum / 1000).toString();
                } else {
                    voltage = voltageNum.toString();
                }
            }
        }

        aerialDistanceEl.textContent = `${aerialDist} km`;
        roadDistanceEl.textContent = `${roadDist} km`;
        voltageLevelEl.textContent = voltage === 'Unknown' ? 'Unknown' : `${voltage} kV`;
        
        if (roadDist === 'N/A') {
            roadDistanceNoteEl.textContent = 'No road access found';
        } else {
            roadDistanceNoteEl.textContent = 'Via nearest roads';
        }
        
        // Re-render icons
        lucide.createIcons();
    }

    // Test function to verify scoring
    window.testScoring = function() {
        console.log('=== TESTING SCORING SYSTEM ===');
        
        // Test with perfect scores (all parameters should score 10)
        const perfectData = {
            slope: 5.0,        // Perfect slope
            ghi: 5.5,          // Perfect GHI
            temperature: 25.0,  // Perfect temperature
            elevation: 100.0,   // Perfect elevation
            landCover: 30,      // Perfect land cover (grassland)
            ndvi: 0.3,         // Moderate NDVI
            proximityToLines: 1.0,   // Perfect proximity
            proximityToRoads: 1.0,   // Perfect proximity
            waterAvailability: 2.0,  // Perfect water
            soilStability: 100.0,    // Perfect soil
            shading: 200.0,    // Perfect shading
            dust: 0.1,         // Perfect dust
            windSpeed: 20.0,   // Perfect wind
            seismicRisk: 0.1,  // Perfect seismic
            floodRisk: 0.0     // Perfect flood
        };
        
        const perfectScore = calculateFinalScore(perfectData);
        console.log('Perfect score should be close to 10:', perfectScore);
        
        // Test with poor scores
        const poorData = {
            slope: 20.0,       // Poor slope
            ghi: 4.0,          // Poor GHI
            temperature: 45.0,  // Poor temperature
            elevation: 2000.0,  // Poor elevation
            landCover: 50,      // Poor land cover (built-up)
            ndvi: 0.1,         // Low NDVI
            proximityToLines: 20.0,  // Poor proximity
            proximityToRoads: 15.0,  // Poor proximity
            waterAvailability: 20.0, // Poor water
            soilStability: 10.0,     // Poor soil
            shading: 50.0,     // Poor shading
            dust: 0.8,         // Poor dust
            windSpeed: 100.0,  // Poor wind
            seismicRisk: 0.5,  // Poor seismic
            floodRisk: 10.0    // Poor flood
        };
        
        const poorScore = calculateFinalScore(poorData);
        console.log('Poor score should be low (0-3):', poorScore);
        
        // Test water detection
        const waterData = {
            slope: 5.0,        // Good slope
            ghi: 5.5,          // Good GHI
            temperature: 25.0,  // Good temperature
            elevation: 100.0,   // Good elevation
            landCover: 80,      // Water body classification
            ndvi: -0.2,        // Very low NDVI (water)
            proximityToLines: 1.0,   // Good proximity
            proximityToRoads: 1.0,   // Good proximity
            waterAvailability: 2.0,  // Good water
            soilStability: 100.0,    // Good soil
            shading: 200.0,    // Good shading
            dust: 0.1,         // Good dust
            windSpeed: 20.0,   // Good wind
            seismicRisk: 0.1,  // Good seismic
            floodRisk: 0.0     // Good flood
        };
        
        const waterScore = calculateFinalScore(waterData);
        console.log('Water area should score 0:', waterScore);
        
        return { perfectScore, poorScore, waterScore };
    };
}
