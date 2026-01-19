import React from 'react'

const PARAMETER_DESCRIPTIONS = {
  LST: 'Temperature of panel area (°C)',
  SWIR: 'Shortwave reflectance of panels',
  SOILING: 'Baseline vs current soiling with drop %',
  NDVI: 'Vegetation index around panels (−1 to 1)',
  NDWI: 'Surface water index (−1 to 1)',
  VISIBLE: 'Brightness in visible bands'
}

function ControlPanel({
  selectedParameters,
  onToggleParameter,
  parameterOptions = [],
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  mapView,
  setMapView,
  showPolygons,
  setShowPolygons,
  onLogout,
  onAnalyze,
  analyzeLoading,
  onEnterCompare = () => {}
}) {
  

  return (
    <div className="control-panel">
      <div className="control-panel-header">
        <h2>Solar Farm Dashboard</h2>
      </div>

      
      
      <div className="control-panel-content">
        <div className="map-view-block">
  <label>Map View</label>

  <div className="map-view-controls">
    <select
      value={mapView}
      onChange={(e) => setMapView(e.target.value)}
    >
      <option value="map">Map View</option>
      <option value="satellite">Satellite View</option>
    </select>

    {/* ON / OFF Toggle beside map view */}
      
<div className="map-view-block">
<label>polygons</label>
    <label className="toggle-switch"> 
      <input
        type="checkbox"
        checked={showPolygons}
        onChange={(e) => setShowPolygons(e.target.checked)}
      />
      <span className="toggle-slider"></span>
    </label>
  </div>
</div>
</div>


<div className="row-two">
          <div className="control-group">
            <label>
              Start Date
            </label>
            <div className="input-wrapper">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>

          <div className="control-group">
            <label>
              End Date
            </label>
            <div className="input-wrapper">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </div>
      
        <div className="control-group">
          <label>
            Parameters
          </label>
          <div className="parameter-grid">
            {parameterOptions.map((option) => {
              const isChecked = selectedParameters.includes(option.value)
              return (
                <label key={option.value} className={`parameter-checkbox ${isChecked ? 'checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleParameter(option.value)}
                  />
                  <div className="parameter-info">
                    <span className="parameter-label">{option.label}</span>
                    <span className="parameter-desc">{PARAMETER_DESCRIPTIONS[option.value] || ''}</span>
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        

        <div className="control-group">
          <button 
            className="analyze-button" 
            onClick={onAnalyze}
            disabled={analyzeLoading || selectedParameters.length === 0}
          >
            {analyzeLoading ? 'Analyzing...' : 'Analyze Selection'}
          </button>
        </div>

        <div className="control-group">
          <button
            type="button"
            className="compare-trigger-button"
            onClick={onEnterCompare}
            aria-label="Compare panels"
          >
            Compare Panel
          </button>
        </div>
      </div>

      <div className="instructions-box">
        <strong>Instructions:</strong>
        <ul>
          <li>Select one or more parameters</li>
          <li>Choose the date range</li>
          <li>Click Analyse, then pick panels on the map</li>
        </ul>
        <button className="logout-button" onClick={onLogout}>Logout</button>
      </div>
    </div>
  )
}

export default ControlPanel
