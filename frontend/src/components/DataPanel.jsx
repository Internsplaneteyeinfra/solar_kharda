import React, { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import CombinedGraph from './CombinedGraph'
import '../App.css'
 
const ParameterBlock = ({ param, data, mapPanelValue, onClose, index }) => {
  const safe = (v) => {
    if (v === null || v === undefined) return 0
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(0, n) : 0
  }
 
  const style = { animationDelay: `${index * 0.15}s`, animationFillMode: 'backwards' }
 
  const hasError = data?.error
  const ts = data && Array.isArray(data.timeseries) ? data.timeseries : []
 
  // Render Error State
  if (hasError) {
    let errorContent = data.error
    if (typeof errorContent !== 'string') {
      try {
        errorContent = JSON.stringify(errorContent)
      } catch (e) {
        errorContent = 'An unknown error occurred'
      }
    }

    return (
      <div className="parameter-block" style={style}>
        <div className="parameter-block-header">
          <h4>{param} Analysis</h4>
          <button className="block-close-button" onClick={() => onClose(param)} title="Remove block">
            <span style={{ fontSize: '18px', lineHeight: 1 }}>×</span>
          </button>
        </div>
        <div className="parameter-block-body">
          <div className="error-message">{errorContent}</div>
        </div>
      </div>
    )
  }
 
  // --- SOILING Special Rendering ---
  if (param === 'SOILING') {
    const baseline = safe(data?.baseline_si)
    const current = safe(data?.current_si)
    const drop = safe(Math.abs(data?.soiling_drop_percent)).toFixed(2)
    const status = data?.status === 'needs_cleaning' ? 'Needs Cleaning' : 'Clean'
    const statusClass = data?.status === 'needs_cleaning' ? 'status-needs-cleaning' : 'status-clean'
 
    return (
      <div className="parameter-block" style={style}>
        <div className="parameter-block-header">
          <h4>Soiling Analysis</h4>
          <button className="block-close-button" onClick={() => onClose(param)} title="Remove block">
             <span style={{ fontSize: '18px', lineHeight: 1 }}>×</span>
          </button>
        </div>
        <div className="parameter-divider"></div>
        <div className="parameter-block-body">
          <div className="soiling-stats">
            <div className="stat-card">
              <h4>Baseline</h4>
              <div className="value">{baseline}</div>
            </div>
            <div className="stat-card">
              <h4>Current</h4>
              <div className="value">{current}</div>
            </div>
          </div>
          <div className="current-value">
            <h4>Soiling Drop</h4>
            <div className="value">{drop}%</div>
            <div className={`status-badge ${statusClass}`}>{status}</div>
          </div>
        </div>
      </div>
    )
  }
 
  // --- Standard Rendering (LST, SWIR, etc.) ---
  let displayValue = 'N/A'
  let unit = data?.unit || ''
  let title = `Current ${param}`
 
  if (param === 'LST') {
    title = 'Panel Temperature'
    unit = '°C'
    if (mapPanelValue !== undefined && mapPanelValue !== null) {
      displayValue = safe(mapPanelValue).toFixed(2)
    } else if (data?.current_value !== undefined) {
      displayValue = safe(data.current_value).toFixed(2)
    }
  } else if (param === 'SWIR') {
    title = unit ? `Current ${unit}` : 'Current Value'
    if (data?.current_value !== undefined) {
      displayValue = safe(data.current_value).toFixed(2)
    }
  } else {
    // Generic
    if (data?.current_value !== undefined) {
      displayValue = safe(data.current_value).toFixed(2)
    }
  }
 
  return (
    <div className="parameter-block" style={style}>
      <div className="parameter-block-header">
        <h4>{param === 'SWIR' ? (unit || 'SWIR') : param} Analysis</h4>
        <button className="block-close-button" onClick={() => onClose(param)} title="Remove block">
           <span style={{ fontSize: '18px', lineHeight: 1 }}>×</span>
        </button>
      </div>
      <div className="parameter-divider"></div>
      <div className="parameter-block-body">
        <div className="current-value">
          <h4>{title}</h4>
          <div className="value">{displayValue} {unit}</div>
        </div>
 
        {ts.length > 0 ? (
          <div className="chart-container">
            <h4 style={{ marginBottom: '12px', color: 'rgba(255,255,255,0.7)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Historical Trend</h4>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ts} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={20}
                  />
                  <YAxis
                    tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={35}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
                    itemStyle={{ color: '#fff' }}
                    labelStyle={{ color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--color-primary)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: '#fff', stroke: 'var(--color-primary)', strokeWidth: 2 }}
                    animationDuration={1500}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
           <div style={{ textAlign: 'center', padding: '20px', color: 'rgba(255,255,255,0.3)', fontSize: '13px', fontStyle: 'italic', background: 'rgba(0,0,0,0.1)', borderRadius: '8px' }}>
             No historical data available
           </div>
        )}
      </div>
    </div>
  )
}
 
function DataPanel({
  id,
  paneIndex,
  panelId,
  dataByParameter = {},
  loading,
  selectedParameters = [],
  onNavigateHistory,
  onClose,
  onPaneClick,
  isActive,
  panelName,
  mapPanelValue,
  hasAnalyzed,
  analyzeTick
}) {
  const panelClass = `data-panel ${isActive ? 'panel-active' : 'panel-inactive'}`
  const [closedParams, setClosedParams] = useState(new Set())
 
  // Reset closed parameters when a new analysis is performed
  useEffect(() => {
    setClosedParams(new Set())
  }, [analyzeTick, panelId])
 
  // Determine which parameters to show
  // We show parameters that are selected AND not closed.
  // We do NOT filter by data existence because we want to show loading/error states if applicable,
  // or at least placeholders if data is missing but analysis was requested.
  const visibleParams = selectedParameters.filter(p => !closedParams.has(p))
 
  const handleCloseParam = (param) => {
    setClosedParams(prev => {
      const next = new Set(prev)
      next.add(param)
      return next
    })
  }
 
  const renderContent = () => {
    if (!hasAnalyzed) {
      return (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.2 }}>📊</div>
          <p style={{ margin: 0, fontSize: '14px' }}>Select parameters and click <strong>ANALYZE</strong> to view results.</p>
        </div>
      )
    }
 
    if (loading) {
      return (
        <div className="loading-spinner">
          <div style={{ fontSize: '24px', marginBottom: '10px' }}>⚡</div>
          Calculating metrics...
        </div>
      )
    }
 
    if (visibleParams.length === 0) {
      return (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          All results closed.
        </div>
      )
    }
 
    return visibleParams.map((param, index) => {
      if (param === 'COMBINED') {
        return (
          <CombinedGraph
            key={param}
            dataByParameter={dataByParameter}
            onClose={handleCloseParam}
            style={{ animationDelay: `${index * 0.15}s`, animationFillMode: 'backwards' }}
          />
        )
      }

      return (
      <ParameterBlock
        key={param}
        param={param}
        data={dataByParameter[param]}
        mapPanelValue={param === 'LST' ? mapPanelValue : undefined}
        onClose={handleCloseParam}
        index={index}
      />
    )})
  }
 
  return (
    <div
      id={id}
      className={panelClass}
      role="region"
      aria-label={`Pane ${paneIndex + 1}: ${panelName}`}
      onClick={onPaneClick}
    >
      <div className="data-panel-header">
        <h3>{panelName}</h3>
        <div className="header-buttons">
          <div className="nav-buttons">
            <button
              className="nav-button"
              onClick={(e) => { e.stopPropagation(); onNavigateHistory('prev') }}
              title="Previous panel"
            >
              ←
            </button>
            <button
              className="nav-button"
              onClick={(e) => { e.stopPropagation(); onNavigateHistory('next') }}
              title="Next panel"
            >
              →
            </button>
          </div>
          <button
            className="close-button"
            onClick={(e) => { e.stopPropagation(); onClose() }}
            title="Close pane"
          >
            ×
          </button>
        </div>
      </div>
 
      <div className="data-panel-content">
        {renderContent()}
      </div>
    </div>
  )
}
 
export default DataPanel
 
 