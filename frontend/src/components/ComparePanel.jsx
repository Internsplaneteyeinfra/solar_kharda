import React, { useMemo } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

const DEFAULT_COMPARE_COLORS = Object.freeze([
  '#38bdf8',
  '#fbbf24',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#84cc16'
])

const preferredMetadataLabels = {
  capacity: 'Capacity',
  capacity_mw: 'Capacity (MW)',
  capacity_kw: 'Capacity (kW)',
  dc_capacity: 'DC Capacity',
  ac_capacity: 'AC Capacity',
  moduleType: 'Module Type',
  module_type: 'Module Type',
  inverter: 'Inverter',
  strings: 'Strings',
  tilt: 'Tilt',
  azimuth: 'Azimuth',
  orientation: 'Orientation',
  healthScore: 'Health Score',
  health_score: 'Health Score',
  installer: 'Installer',
  commissioned: 'Commissioned',
  city: 'City',
  state: 'State'
}

const metricConfigs = [
  { key: 'LST', label: 'Land Surface Temperature', fallbackUnit: '°C' },
  { key: 'SWIR', label: 'Shortwave Infrared', fallbackUnit: '' },
  { key: 'SOILING', label: 'Soiling Index', fallbackUnit: '' },
  { key: 'NDVI', label: 'Normalized Difference Vegetation Index', fallbackUnit: '' },
  { key: 'NDWI', label: 'Normalized Difference Water Index', fallbackUnit: '' },
  { key: 'VISIBLE', label: 'Visible Reflectance', fallbackUnit: '' }
]

function formatNumber(value, unit = '') {
  if (value === undefined || value === null || value === '') {
    return '—'
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return '—'
  }
  const formatted = parsed.toFixed(2)
  const trimmedUnit = unit ? unit.trim() : ''
  return trimmedUnit ? `${formatted} ${trimmedUnit}` : formatted
}

function formatPercent(value) {
  if (value === undefined || value === null || value === '') {
    return '—'
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return '—'
  }
  return `${parsed.toFixed(2)}%`
}

function formatCoordinate(location) {
  if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
    return '—'
  }
  return `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
}

function capitalizeLabel(label) {
  if (!label) return ''
  return label
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function buildMetadataRows(panelData, panelIds) {
  const rows = []

  // Panel IDs row
  const panelIdValues = panelIds.map((id, index) => panelData[index]?.id || id || '—')
  rows.push({
    key: 'panelId',
    label: 'Panel ID',
    values: panelIdValues
  })

  // Panel Names row
  const panelNameValues = panelIds.map((id, index) => {
    const data = panelData[index]
    return data?.name || (data?.id ? `Panel ${data.id}` : `Panel ${id}`) || '—'
  })
  rows.push({
    key: 'panelName',
    label: 'Panel Name',
    values: panelNameValues
  })

  // Location row
  const locationValues = panelData.map(data => formatCoordinate(data?.location))
  rows.push({
    key: 'location',
    label: 'Centroid (lat, lng)',
    values: locationValues
  })

  // Other metadata
  Object.keys(preferredMetadataLabels).forEach((metaKey) => {
    const values = panelData.map(data => {
      const value = data?.metadata?.[metaKey] ?? data?.properties?.[metaKey]
      return value !== undefined && value !== null && value !== '' ? String(value) : '—'
    })
    if (values.some(v => v !== '—')) {
      rows.push({
        key: metaKey,
        label: preferredMetadataLabels[metaKey] || capitalizeLabel(metaKey),
        values
      })
    }
  })

  return rows
}

function normalizeDateLabel(rawDate) {
  if (!rawDate) return ''
  if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
    return rawDate.toISOString().slice(0, 10)
  }

  const stringValue = String(rawDate).trim()
  if (!stringValue) return ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    return stringValue
  }

  const parsed = new Date(stringValue)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  return stringValue
}

function getPropertyIgnoreCase(entry, key) {
  if (!entry || typeof entry !== 'object') return undefined
  if (Object.prototype.hasOwnProperty.call(entry, key)) {
    return entry[key]
  }
  const target = key.toLowerCase()
  const match = Object.keys(entry).find((candidate) => candidate.toLowerCase() === target)
  return match ? entry[match] : undefined
}

function coerceNumber(raw) {
  if (raw === undefined || raw === null) return null
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null
  }
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/[^0-9.+-]/g, '')
    if (!cleaned) return null
    const parsed = Number.parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function extractTimeseriesValue(entry) {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const candidateKeys = [
    'value',
    'current_value',
    'mean',
    'average',
    'avg',
    'lst',
    'LST',
    'LST_C',
    'lst_c',
    'temperature',
    'temp',
    'b11',
    'B11',
    'reflectance',
    'panelA',
    'panelB'
  ]

  for (const key of candidateKeys) {
    const candidate = getPropertyIgnoreCase(entry, key)
    const parsed = coerceNumber(candidate)
    if (parsed !== null) {
      return parsed
    }
  }

  if (entry?.properties && typeof entry.properties === 'object') {
    const nested = extractTimeseriesValue(entry.properties)
    if (nested !== null) {
      return nested
    }
  }

  return null
}

function mergeTimeseries(panelTimeseries = []) {
  const merged = new Map()

  panelTimeseries.forEach((timeseries, index) => {
    const targetKey = `panel${index + 1}`
    timeseries.forEach((entry) => {
      const dateLabel =
        normalizeDateLabel(entry?.date) ||
        normalizeDateLabel(entry?.timestamp) ||
        normalizeDateLabel(entry?.day)

      if (!dateLabel) return

      const parsedValue = extractTimeseriesValue(entry)
      const value = parsedValue !== null ? parsedValue : null

      if (merged.has(dateLabel)) {
        const existing = merged.get(dateLabel)
        existing[targetKey] = value
      } else {
        const newEntry = { date: dateLabel }
        panelTimeseries.forEach((_, idx) => {
          newEntry[`panel${idx + 1}`] = null
        })
        newEntry[targetKey] = value
        merged.set(dateLabel, newEntry)
      }
    })
  })

  return Array.from(merged.values()).sort((a, b) => {
    const dateA = new Date(a.date)
    const dateB = new Date(b.date)
    if (Number.isNaN(dateA) || Number.isNaN(dateB)) {
      return String(a.date).localeCompare(String(b.date))
    }
    return dateA - dateB
  })
}

function buildMetricCharts(panelData) {
  return metricConfigs.map((config) => {
    const panelMetrics = panelData.map(data => data?.metrics?.[config.key])
    const panelTimeseries = panelMetrics.map(metric => Array.isArray(metric?.timeseries) ? metric.timeseries : [])
    const mergedSeries = mergeTimeseries(panelTimeseries)

    const unit = panelMetrics.find(m => m?.unit)?.unit || config.fallbackUnit
    const errors = panelMetrics.map(m => m?.error)
    const currentValues = panelMetrics.map(metric =>
      config.key === 'SOILING' ? formatNumber(metric?.current_si) : formatNumber(metric?.current_value, unit)
    )

    let additionalNotes = null
    if (config.key === 'SOILING') {
      additionalNotes = panelData.map((data, index) => ({
        baseline: formatNumber(data?.metrics?.[config.key]?.baseline_si),
        current: formatNumber(data?.metrics?.[config.key]?.current_si),
        drop: data?.metrics?.[config.key]?.soiling_drop_percent !== undefined ? formatPercent(data.metrics[config.key].soiling_drop_percent) : '—',
        status: data?.metrics?.[config.key]?.status ? capitalizeLabel(data.metrics[config.key].status) : '—'
      }))
    }

    return {
      key: config.key,
      label: config.label,
      unit,
      currentValues,
      errors,
      data: mergedSeries,
      rawMetrics: panelMetrics,
      additionalNotes
    }
  })
}

function ComparePanel({ compareState, onFieldChange, onAnalyse, onExit, compareColors = DEFAULT_COMPARE_COLORS }) {
  const { panelIds, startDate, endDate, loading, error, data, fieldErrors, lastUpdated } = compareState

  const panelData = data

  const processedData = useMemo(() => {
    if (!panelData.length) return { metadataRows: [], metricCharts: [] }

    const metadataRows = buildMetadataRows(panelData, panelIds)
    const metricCharts = buildMetricCharts(panelData)

    return { metadataRows, metricCharts }
  }, [panelData, panelIds])

  if (loading) {
    return (
      <div className="compare-panel">
        <div className="loading">Loading panel data...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="compare-panel">
        <div className="error">Error: {error}</div>
        <button onClick={onExit}>Exit</button>
      </div>
    )
  }

  return (
    <div className="compare-panel-container">
      <div className="compare-panel-header">
        <h2 className="compare-title">Compare Panels</h2>
        <button className="exit-compare-button" onClick={onExit}>Exit</button>
      </div>

      <div className="compare-form">
        <div className="panel-ids">
          <label>Panel IDs (comma-separated):</label>
          <input
            type="text"
            value={panelIds.join(', ')}
            onChange={(e) => {
              const ids = e.target.value.split(',').map(id => id.trim()).filter(id => id)
              onFieldChange('panelIds', ids)
            }}
            placeholder="Enter panel IDs, e.g., 1, 2, 3"
          />
        </div>
        <div className="date-range">
          <label>Start Date:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onFieldChange('startDate', e.target.value)}
          />
          <label>End Date:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onFieldChange('endDate', e.target.value)}
          />
        </div>
        <button onClick={onAnalyse} disabled={loading}>
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {fieldErrors && Object.keys(fieldErrors).length > 0 && (
        <div className="field-errors">
          {Object.entries(fieldErrors).map(([field, error]) => (
            <div key={field} className="field-error">
              {field}: {error}
            </div>
          ))}
        </div>
      )}

      {panelData.length > 0 && (
        <div className="compare-content">
          <div className="metadata-section">
            <h3>Panel Metadata</h3>
            <table className="metadata-table">
              <tbody>
                {processedData.metadataRows.map((row) => (
                  <tr key={row.key}>
                    <td className="label-cell">{row.label}</td>
                    {row.values.map((value, index) => (
                      <td key={index} className="value-cell" style={{ color: compareColors[index % compareColors.length] }}>
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="metrics-section">
            <h3>Metrics Comparison</h3>
            {processedData.metricCharts.map((chart) => (
              <div key={chart.key} className="metric-chart">
                <h4>{chart.label}</h4>
                <div className="current-values">
                  {chart.currentValues.map((value, index) => (
                    <div key={index} className="current-value" style={{ color: compareColors[index % compareColors.length] }}>
                      Panel {index + 1}: {value}
                    </div>
                  ))}
                </div>
                {chart.data.length > 0 && (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chart.data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      {panelIds.map((_, index) => (
                        <Line
                          key={index}
                          type="monotone"
                          dataKey={`panel${index + 1}`}
                          stroke={compareColors[index % compareColors.length]}
                          name={`Panel ${index + 1}`}
                          connectNulls={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
                {chart.additionalNotes && (
                  <div className="additional-notes">
                    {chart.additionalNotes.map((note, index) => (
                      <div key={index} className="note" style={{ color: compareColors[index % compareColors.length] }}>
                        Panel {index + 1}: Baseline: {note.baseline}, Current: {note.current}, Drop: {note.drop}, Status: {note.status}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {lastUpdated && (
        <div className="last-updated">
          Last updated: {new Date(lastUpdated).toLocaleString()}
        </div>
      )}
    </div>
  )
}

export default ComparePanel
