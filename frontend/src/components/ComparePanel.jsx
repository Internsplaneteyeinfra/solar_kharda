import React, { useMemo } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

const DEFAULT_COMPARE_COLORS = Object.freeze({
  panelA: '#38bdf8',
  panelB: '#fbbf24'
})

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

function buildMetadataRows(dataA, dataB, fallbackIdA, fallbackIdB) {
  const rows = []

  rows.push({
    key: 'panelId',
    label: 'Panel ID',
    valueA: dataA?.id || fallbackIdA || '—',
    valueB: dataB?.id || fallbackIdB || '—'
  })

  rows.push({
    key: 'panelName',
    label: 'Panel Name',
    valueA: dataA?.name || (dataA?.id ? `Panel ${dataA.id}` : fallbackIdA ? `Panel ${fallbackIdA}` : '—'),
    valueB: dataB?.name || (dataB?.id ? `Panel ${dataB.id}` : fallbackIdB ? `Panel ${fallbackIdB}` : '—')
  })

  rows.push({
    key: 'location',
    label: 'Centroid (lat, lng)',
    valueA: formatCoordinate(dataA?.location),
    valueB: formatCoordinate(dataB?.location)
  })

  Object.keys(preferredMetadataLabels).forEach((metaKey) => {
    const valueA = dataA?.metadata?.[metaKey] ?? dataA?.properties?.[metaKey]
    const valueB = dataB?.metadata?.[metaKey] ?? dataB?.properties?.[metaKey]
    if (valueA !== undefined || valueB !== undefined) {
      rows.push({
        key: metaKey,
        label: preferredMetadataLabels[metaKey] || capitalizeLabel(metaKey),
        valueA: valueA !== undefined && valueA !== null && valueA !== '' ? String(valueA) : '—',
        valueB: valueB !== undefined && valueB !== null && valueB !== '' ? String(valueB) : '—'
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

function mergeTimeseries(timeseriesA = [], timeseriesB = []) {
  const merged = new Map()

  const ingest = (series, targetKey) => {
    series.forEach((entry) => {
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
        merged.set(dateLabel, {
          date: dateLabel,
          panelA: targetKey === 'panelA' ? value : null,
          panelB: targetKey === 'panelB' ? value : null
        })
      }
    })
  }

  ingest(timeseriesA, 'panelA')
  ingest(timeseriesB, 'panelB')

  return Array.from(merged.values()).sort((a, b) => {
    const dateA = new Date(a.date)
    const dateB = new Date(b.date)
    if (Number.isNaN(dateA) || Number.isNaN(dateB)) {
      return String(a.date).localeCompare(String(b.date))
    }
    return dateA - dateB
  })
}

function buildMetricCharts(dataA, dataB) {
  return metricConfigs.map((config) => {
    const metricA = dataA?.metrics?.[config.key]
    const metricB = dataB?.metrics?.[config.key]

    const timeseriesA = Array.isArray(metricA?.timeseries) ? metricA.timeseries : []
    const timeseriesB = Array.isArray(metricB?.timeseries) ? metricB.timeseries : []
    const mergedSeries = mergeTimeseries(timeseriesA, timeseriesB)

    const unit = metricA?.unit || metricB?.unit || config.fallbackUnit
    const errorA = metricA?.error
    const errorB = metricB?.error

    let additionalNotes = null
    if (config.key === 'SOILING') {
      additionalNotes = {
        baselineA: formatNumber(metricA?.baseline_si),
        baselineB: formatNumber(metricB?.baseline_si),
        currentA: formatNumber(metricA?.current_si),
        currentB: formatNumber(metricB?.current_si),
        dropA: metricA?.soiling_drop_percent !== undefined ? formatPercent(metricA.soiling_drop_percent) : '—',
        dropB: metricB?.soiling_drop_percent !== undefined ? formatPercent(metricB.soiling_drop_percent) : '—',
        statusA: metricA?.status ? capitalizeLabel(metricA.status) : '—',
        statusB: metricB?.status ? capitalizeLabel(metricB.status) : '—'
      }
    }

    return {
      key: config.key,
      label: config.label,
      unit,
      currentA: config.key === 'SOILING' ? additionalNotes?.currentA : formatNumber(metricA?.current_value, unit),
      currentB: config.key === 'SOILING' ? additionalNotes?.currentB : formatNumber(metricB?.current_value, unit),
      errorA,
      errorB,
      data: mergedSeries,
      rawA: metricA,
      rawB: metricB,
      additionalNotes
    }
  })
}

function ComparePanel({ compareState, onFieldChange, onAnalyse, onExit, compareColors = DEFAULT_COMPARE_COLORS }) {
  const { idA, idB, startDate, endDate, loading, error, dataA, dataB, fieldErrors, lastUpdated } = compareState
  const panelLabelA = dataA?.id || idA || 'A'
  const panelLabelB = dataB?.id || idB || 'B'

  const isAnalyseDisabled = loading || !idA.trim() || !idB.trim() || !startDate.trim() || !endDate.trim()

  const metadataRows = useMemo(() => buildMetadataRows(dataA, dataB, idA, idB), [dataA, dataB, idA, idB])
  const metricCharts = useMemo(() => buildMetricCharts(dataA, dataB), [dataA, dataB])

  const showResults = Boolean((dataA || dataB) && !loading)
  const showPlaceholder = !showResults && !loading && !error
  const legendColorA = compareColors?.panelA || DEFAULT_COMPARE_COLORS.panelA
  const legendColorB = compareColors?.panelB || DEFAULT_COMPARE_COLORS.panelB
  const shouldShowLegend = Boolean(idA.trim() && idB.trim())

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!loading) {
      onAnalyse()
    }
  }

  return (
    <div className="compare-panel-container" role="region" aria-label="Compare panels">
      <div className="compare-panel-header">
        <h3 className="compare-title">Compare Panels</h3>
        <button
          type="button"
          className="exit-compare-button"
          onClick={onExit}
          aria-label="Exit compare mode"
        >
          Exit Compare
        </button>
      </div>

      {shouldShowLegend && (
        <div className="compare-map-legend" role="note" aria-label="Map comparison legend">
          <div className="legend-item">
            <span className="legend-swatch" style={{ backgroundColor: legendColorA }} aria-hidden="true" />
            <span className="legend-label">Panel {panelLabelA}</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch" style={{ backgroundColor: legendColorB }} aria-hidden="true" />
            <span className="legend-label">Panel {panelLabelB}</span>
          </div>
        </div>
      )}

      <form className="compare-form" onSubmit={handleSubmit}>
        <div className={`compare-field ${fieldErrors?.idA ? 'has-error' : ''}`}>
          <label htmlFor="compare-panel-id-a">Panel ID A</label>
          <input
            id="compare-panel-id-a"
            type="text"
            value={idA}
            onChange={(e) => onFieldChange('idA', e.target.value)}
            aria-label="Panel ID A"
            placeholder="e.g. 101"
            disabled={loading}
            autoComplete="off"
          />
          {fieldErrors?.idA && <span className="field-error" role="alert">{fieldErrors.idA}</span>}
        </div>

        <div className={`compare-field ${fieldErrors?.idB ? 'has-error' : ''}`}>
          <label htmlFor="compare-panel-id-b">Panel ID B</label>
          <input
            id="compare-panel-id-b"
            type="text"
            value={idB}
            onChange={(e) => onFieldChange('idB', e.target.value)}
            aria-label="Panel ID B"
            placeholder="e.g. 205"
            disabled={loading}
            autoComplete="off"
          />
          {fieldErrors?.idB && <span className="field-error" role="alert">{fieldErrors.idB}</span>}
        </div>

        <div className={`compare-field ${fieldErrors?.startDate ? 'has-error' : ''}`}>
          <label htmlFor="compare-start-date">Start Date</label>
          <input
            id="compare-start-date"
            type="date"
            value={startDate}
            onChange={(e) => onFieldChange('startDate', e.target.value)}
            aria-label="Start date"
            disabled={loading}
          />
          {fieldErrors?.startDate && <span className="field-error" role="alert">{fieldErrors.startDate}</span>}
        </div>

        <div className={`compare-field ${fieldErrors?.endDate ? 'has-error' : ''}`}>
          <label htmlFor="compare-end-date">End Date</label>
          <input
            id="compare-end-date"
            type="date"
            value={endDate}
            onChange={(e) => onFieldChange('endDate', e.target.value)}
            aria-label="End date"
            disabled={loading}
          />
          {fieldErrors?.endDate && <span className="field-error" role="alert">{fieldErrors.endDate}</span>}
        </div>

        <div className="compare-actions">
          <button
            type="submit"
            className="analyse-button"
            disabled={isAnalyseDisabled}
            aria-label="Analyse selected panels"
          >
            {loading ? 'Analysing…' : 'Analyse'}
          </button>
        </div>
      </form>

      {error && !loading && (
        <div className="compare-error" role="alert">{error}</div>
      )}

      {loading && (
        <div className="compare-loading" aria-live="polite">Fetching latest panel data…</div>
      )}

      {showPlaceholder && (
        <div className="compare-placeholder">
          Enter two panel IDs and a date range to compare their performance metrics. You can adjust the range to analyse seasonal changes or recent behaviour.
        </div>
      )}

      {showResults && (
        <div className="compare-results">
          {lastUpdated && (
            <div className="compare-updated">Last updated: {new Date(lastUpdated).toLocaleString()}</div>
          )}

          <div className="compare-metadata">
            {metadataRows.map((row) => (
              <div className="compare-metadata-row" key={`meta-${row.key}`}>
                <div className="compare-metadata-label">{row.label}</div>
                <div className="compare-metadata-value">{row.valueA}</div>
                <div className="compare-metadata-value">{row.valueB}</div>
              </div>
            ))}
          </div>

          <div className="compare-charts">
            {metricCharts.map((chart) => (
              <div className="compare-chart-card" key={chart.key}>
                <div className="compare-chart-header">
                  <div className="compare-chart-title">
                    <h4>{chart.label}</h4>
                    {chart.unit && <span className="compare-chart-unit">Unit: {chart.unit}</span>}
                  </div>
                  <div className="compare-chart-current">
                    <div>Panel {panelLabelA}: <strong>{chart.currentA}</strong></div>
                    <div>Panel {panelLabelB}: <strong>{chart.currentB}</strong></div>
                  </div>
                </div>

                {(chart.errorA || chart.errorB) && (
                  <div className="compare-chart-error" role="alert">
                    {chart.errorA && <div>Panel {panelLabelA}: {chart.errorA}</div>}
                    {chart.errorB && <div>Panel {panelLabelB}: {chart.errorB}</div>}
                  </div>
                )}

                {chart.key === 'SOILING' && chart.additionalNotes && (
                  <div className="compare-soiling-summary">
                    <div>
                      <span>Baseline:</span>
                      <strong>{chart.additionalNotes.baselineA}</strong> vs <strong>{chart.additionalNotes.baselineB}</strong>
                    </div>
                    <div>
                      <span>Current:</span>
                      <strong>{chart.additionalNotes.currentA}</strong> vs <strong>{chart.additionalNotes.currentB}</strong>
                    </div>
                    <div>
                      <span>Drop %:</span>
                      <strong>{chart.additionalNotes.dropA}</strong> vs <strong>{chart.additionalNotes.dropB}</strong>
                    </div>
                    <div>
                      <span>Status:</span>
                      <strong>{chart.additionalNotes.statusA}</strong> vs <strong>{chart.additionalNotes.statusB}</strong>
                    </div>
                  </div>
                )}

                {chart.data.length > 0 ? (
                  <div className="compare-chart-body">
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={chart.data} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.2)" />
                        <XAxis
                          dataKey="date"
                          stroke="#e5e7eb"
                          tick={{ fill: '#e5e7eb', fontSize: 12 }}
                          angle={-40}
                          height={60}
                          textAnchor="end"
                        />
                        <YAxis
                          stroke="#e5e7eb"
                          tick={{ fill: '#e5e7eb', fontSize: 12 }}
                          allowDecimals
                        />
                        <Tooltip
                          formatter={(value) => (typeof value === 'number' ? value.toFixed(2) : value)}
                          labelFormatter={(label) => `Date: ${label}`}
                          contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.9)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }}
                        />
                        <Legend verticalAlign="top" height={30} wrapperStyle={{ color: '#e5e7eb' }} />
                        <Line type="monotone" dataKey="panelA" name={`Panel ${panelLabelA}`} stroke={legendColorA} strokeWidth={2} dot={false} connectNulls />
                        <Line type="monotone" dataKey="panelB" name={`Panel ${panelLabelB}`} stroke={legendColorB} strokeWidth={2} dot={false} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="compare-chart-empty">
                    No trend data available for this parameter in the selected date range.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ComparePanel
