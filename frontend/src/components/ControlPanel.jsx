import React from 'react'
 
const PARAMETER_DESCRIPTIONS = {
  LST: 'Temperature of panel area (°C)',
  SWIR: 'Shortwave reflectance of panels',
  SOILING: 'Baseline vs current soiling with drop %',
  NDVI: 'Vegetation index around panels (−1 to 1)',
  NDWI: 'Surface water index (−1 to 1)',
  VISIBLE: 'Brightness in visible bands'
}
 
const PARAMETER_ICONS = {
  LST: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
    </svg>
  ),
  SWIR: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  ),
  SOILING: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
    </svg>
  ),
  NDVI: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20v-8m0 0a4 4 0 0 1 4-4h0a4 4 0 0 1 4 4v0a4 4 0 0 1-4 4h0a4 4 0 0 1-4-4z" />
      <path d="M12 20v-8m0 0a4 4 0 0 0-4-4h0a4 4 0 0 0-4 4v0a4 4 0 0 0 4 4h0a4 4 0 0 0 4-4z" />
      <path d="M12 22v-2" />
    </svg>
  ),
  NDWI: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.69l5.74 5.74a8.04 8.04 0 1 1-11.31 0z" />
    </svg>
  ),
  VISIBLE: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  )
}
 
function ControlPanel({
  selectedParameters,
  onToggleParameter,
  parameterOptions = [],
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  showPolygons,
  setShowPolygons,
  onLogout,
  onAnalyze,
  analyzeLoading,
  onEnterCompare = () => {}
}) {
 
 
  return (
   <div className="control-panel">
 
  {/* ===== HEADER ===== */}
  <div className="control-panel-header">
    <h2>Solar Farm Dashboard</h2>
  </div>
 
  <div className="control-panel-content">
 
    {/* ===== MAP VIEW & POLYGON SECTION ===== */}
    <div className="control-section map-section">
      <div className="polygon-toggle-block">
        <label>Polygons</label>
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
 
    <div className="map-spacer"></div>
    {/* ===== DATE RANGE SECTION (Moved to Floating Header) ===== */}
    {/* Inputs removed from here */}
 
    <div className="map-spacer"></div>
    {/* ===== PARAMETERS SECTION ===== */}
    <div className="control-section parameter-section">
      <label>Parameters</label>
 
      <div className="parameter-grid">
        {parameterOptions.map((option) => {
          const isChecked = selectedParameters.includes(option.value)
 
          return (
            <button
              key={option.value}
              className={`parameter-btn ${isChecked ? 'active' : ''}`}
              onClick={() => onToggleParameter(option.value)}
              aria-label={option.label}
              data-tooltip={option.label}
            >
              <div className="icon-wrapper">
                {PARAMETER_ICONS[option.value]}
              </div>
            </button>
          )
        })}
      </div>
    </div>
 
     <div className="map-spacer"></div>
 
    {/* ===== ACTION BUTTONS SECTION ===== */}
    <div className="control-section action-section">
      <button
        className="analyze-button"
        onClick={onAnalyze}
        disabled={analyzeLoading || selectedParameters.length === 0}
      >
        {analyzeLoading ? 'Analyzing...' : 'Analyze'}
      </button>
 
      <button
        type="button"
        className="compare-trigger-button"
        onClick={onEnterCompare}
      >
        Compare Panel
      </button>
    </div>
 
  </div>
 
  <div className="map-spacer"></div>
 
  {/* ===== INSTRUCTIONS ===== */}
  <div className="control-panel-instructions">
  </div>
 
</div>
 
  )
}
export default ControlPanel
 
 