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
            aria-label="Close pane"
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
