import React, { useState, useMemo, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

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
  mapPanelValue
}) {
  const panelClass = `data-panel ${isActive ? 'panel-active' : 'panel-inactive'}`

  const orderedParameters = useMemo(() => {
    const preferred = Array.isArray(selectedParameters) ? selectedParameters : []
    const available = Object.keys(dataByParameter || {})
    return [...new Set([...preferred, ...available])]
  }, [dataByParameter, selectedParameters])

  const [activeParameter, setActiveParameter] = useState(() => orderedParameters[0] || null)

  useEffect(() => {
    if (!orderedParameters.includes(activeParameter)) {
      setActiveParameter(orderedParameters[0] || null)
    }
  }, [orderedParameters, activeParameter])

  const activeData = activeParameter ? dataByParameter[activeParameter] : null

  const renderContent = () => {
    if (loading) {
      return <div className="loading-spinner">Loading data...</div>
    }

    if (!activeParameter) {
      return (
        <div style={{ padding: '20px', textAlign: 'center', color: 'white' }}>
          Select parameters and run Analyse to load panel metrics.
        </div>
      )
    }

    if (!activeData) {
      return <div className="loading-spinner">Loading data...</div>
    }

    if (activeData.error) {
      return <div className="error-message">{activeData.error}</div>
    }

    const safe = (v) => {
      if (v === null || v === undefined) return 0
      const n = Number(v)
      return Number.isFinite(n) ? Math.max(0, n) : 0
    }

    const ts = Array.isArray(activeData.timeseries) ? activeData.timeseries : []

    if (activeParameter === 'SOILING') {
      return (
        <>
          <div className="soiling-stats">
            <div className="stat-card">
              <h4>Baseline</h4>
              <div className="value">{safe(activeData.baseline_si)}</div>
              <div style={{ fontSize: '11px', opacity: 0.85 }}>Clean reference</div>
            </div>
            <div className="stat-card">
              <h4>Current</h4>
              <div className="value">{safe(activeData.current_si)}</div>
              <div style={{ fontSize: '11px', opacity: 0.85 }}>Now</div>
            </div>
          </div>

          <div className="current-value">
            <h4>Soiling Drop</h4>
            <div className="value">{safe(Math.abs(activeData.soiling_drop_percent)).toFixed(2)}%</div>
            <div className={`status-badge ${activeData.status === 'needs_cleaning' ? 'status-needs-cleaning' : 'status-clean'}`}>
              {activeData.status === 'needs_cleaning' ? 'Needs Cleaning' : 'Clean'}
            </div>
          </div>
        </>
      )
    }

    const getDisplayName = (param) => {
      if (param === 'SWIR') {
        return activeData.unit || ''
      }
      return param
    }

    const displayParam = getDisplayName(activeData.parameter)
    const displayTitle = activeParameter === 'SWIR'
      ? (activeData.unit ? `Current ${activeData.unit}` : 'Current Value')
      : `Current ${displayParam} Value`

    return (
      <>
        <div className="current-value">
          <h4>{displayTitle}</h4>
          <div className="value">
            {activeParameter === 'LST' && mapPanelValue !== undefined && mapPanelValue !== null
              ? `${safe(mapPanelValue).toFixed(2)} °C`
              : activeParameter === 'SWIR'
              ? `${safe(activeData.current_value).toFixed(2)}`
              : `${safe(activeData.current_value).toFixed(2)}${activeData.unit ? ` ${activeData.unit}` : ''}`.trim()}
          </div>
        </div>

        {ts.length > 0 ? (
          <div className="chart-container">
            <h4 style={{ marginBottom: '8px', color: 'white', fontSize: '13px' }}>Historical Data</h4>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={ts} margin={{ top: 5, right: 5, left: 5, bottom: 35 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.3)" />
                <XAxis
                  dataKey="date"
                  angle={-45}
                  textAnchor="end"
                  height={50}
                  interval="preserveStartEnd"
                  stroke="white"
                  tick={{ fill: 'white', fontSize: 9 }}
                  tickMargin={6}
                />
                <YAxis
                  label={{
                    value: activeParameter === 'SWIR' ? (activeData.unit || '') : `${activeData.parameter}${activeData.unit ? ` (${activeData.unit})` : ''}`,
                    angle: -90,
                    position: 'insideLeft',
                    style: { fill: 'white', fontSize: 10 }
                  }}
                  stroke="white"
                  tick={{ fill: 'white', fontSize: 10 }}
                  tickFormatter={(value) => parseFloat(value).toFixed(2)}
                  width={55}
                  domain={['auto', 'auto']}
                  allowDataOverflow={false}
                  padding={{ top: 5, bottom: 5 }}
                />
                <Tooltip
                  formatter={(value) => {
                    const formattedValue = typeof value === 'number' ? value.toFixed(2) : parseFloat(value || 0).toFixed(2)
                    return activeParameter === 'SWIR'
                      ? [formattedValue, activeData.unit || '']
                      : [`${formattedValue}${activeData.unit ? ` ${activeData.unit}` : ''}`, activeData.parameter]
                  }}
                  labelFormatter={(label) => `Date: ${label}`}
                  contentStyle={{ backgroundColor: 'rgba(64, 116, 126, 0.95)', border: '1px solid white', color: 'white', fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#00ff00"
                  strokeWidth={2}
                  dot={{ r: 2, fill: '#00ff00' }}
                  name={activeParameter === 'SWIR' ? (activeData.unit || '') : activeData.parameter}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ padding: '20px', textAlign: 'center', color: 'white' }}>
            No historical data available for the selected date range.
          </div>
        )}
      </>
    )
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
        <h3>Panel {panelId}</h3>
        <div className="header-buttons">
          <div className="nav-buttons">
            <button
              className="nav-button"
              onClick={(e) => { e.stopPropagation(); onNavigateHistory('prev') }}
              title="Previous panel"
              aria-label="Previous panel"
            >
              ←
            </button>
            <button
              className="nav-button"
              onClick={(e) => { e.stopPropagation(); onNavigateHistory('next') }}
              title="Next panel"
              aria-label="Next panel"
            >
              →
            </button>
          </div>
          <button
            className="close-button"
            onClick={(e) => { e.stopPropagation(); onClose() }}
            title="Close pane"
            aria-label="Close pane"
          >
            ×
          </button>
        </div>
      </div>

      {orderedParameters.length > 1 && (
        <div className="panel-parameter-tabs">
          {orderedParameters.map((param) => (
            <button
              key={param}
              type="button"
              className={`parameter-tab ${param === activeParameter ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setActiveParameter(param)
              }}
            >
              {param}
            </button>
          ))}
        </div>
      )}

      <div className="data-panel-content">
        {renderContent()}
      </div>
    </div>
  )
}

export default DataPanel

