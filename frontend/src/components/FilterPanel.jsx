import React, { useCallback, useEffect, useMemo, useState } from 'react'
import DataPanel from './DataPanel'
import { fetchParameterSnapshot } from '../services/parameterSnapshots'
import { getPanelById } from '../services/panels'

function FilterPanel({
  apiBase,
  parameterOptions = [],
  defaultStartDate,
  defaultEndDate,
  polygons,
  allPanelIds = [],
  totalPanelCount = 0,
  onExit,
  onUpdateMatchingPanels,
  onSelectPanel
}) {
  const [startDate, setStartDate] = useState(defaultStartDate)
  const [endDate, setEndDate] = useState(defaultEndDate)
  const [snapshots, setSnapshots] = useState({})
  const [activeFilters, setActiveFilters] = useState({})
  const [matchingPanels, setMatchingPanels] = useState(() => new Set(allPanelIds.map((id) => String(id))))
  const [selectedPanelId, setSelectedPanelId] = useState(null)
  const [selectedPanelDetail, setSelectedPanelDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)

  const rangeKey = useMemo(() => `${startDate || ''}:${endDate || ''}`, [startDate, endDate])
  const orderedParameters = useMemo(() => parameterOptions.map((option) => option.value), [parameterOptions])

  useEffect(() => {
    setMatchingPanels(new Set(allPanelIds.map((id) => String(id))))
  }, [allPanelIds])

  useEffect(() => {
    setSnapshots({})
    setActiveFilters({})
    setMatchingPanels(new Set(allPanelIds.map((id) => String(id))))
    setSelectedPanelId(null)
    setSelectedPanelDetail(null)
  }, [rangeKey, allPanelIds])

  const fetchSnapshot = useCallback(async (parameter) => {
    if (!parameter) return
    setSnapshots((prev) => ({
      ...prev,
      [parameter]: {
        ...(prev[parameter] || {}),
        status: 'loading',
        error: null,
        rangeKey
      }
    }))
    if (!polygons) {
      setDetailError('Panel boundaries are still loading. Please try again shortly.')
      setDetailLoading(false)
      return
    }

    try {
      const data = await fetchParameterSnapshot({
        apiBase,
        parameter,
        startDate,
        endDate
      })
      setSnapshots((prev) => ({
        ...prev,
        [parameter]: {
          status: 'success',
          data,
          error: null,
          rangeKey
        }
      }))
    } catch (error) {
      const message = error?.response?.data?.detail || error?.message || 'Unable to load parameter snapshot.'
      setSnapshots((prev) => ({
        ...prev,
        [parameter]: {
          status: 'error',
          data: null,
          error: message,
          rangeKey
        }
      }))
    }
  }, [apiBase, rangeKey, startDate, endDate])

  const ensureSnapshot = useCallback((parameter) => {
    const snapshot = snapshots[parameter]
    if (snapshot && snapshot.status === 'success' && snapshot.rangeKey === rangeKey) {
      return
    }
    fetchSnapshot(parameter)
  }, [snapshots, rangeKey, fetchSnapshot])

  const handleFilterChange = (parameter, bucketId) => {
    setActiveFilters((prev) => {
      const next = { ...prev }
      if (!bucketId) {
        delete next[parameter]
      } else {
        next[parameter] = bucketId
      }
      return next
    })
  }

  const resetFilters = () => {
    setActiveFilters({})
    setMatchingPanels(new Set(allPanelIds.map((id) => String(id))))
    onUpdateMatchingPanels(allPanelIds.map((id) => String(id)))
  }

  useEffect(() => {
    const allIdsSet = new Set(allPanelIds.map((id) => String(id)))
    let currentSet = allIdsSet

    Object.entries(activeFilters).forEach(([parameter, bucketId]) => {
      if (!bucketId) return
      const snapshot = snapshots[parameter]
      if (!snapshot || snapshot.status !== 'success' || snapshot.rangeKey !== rangeKey) {
        return
      }
      const bucket = snapshot.data?.stats?.buckets?.find((b) => b.id === bucketId)
      if (!bucket) return
      const allowed = new Set()
      Object.entries(snapshot.data?.values || {}).forEach(([panelId, info]) => {
        const value = info?.value
        if (value === undefined || value === null) return
        if (value >= bucket.min && value <= bucket.max) {
          allowed.add(String(panelId))
        }
      })
      currentSet = new Set([...currentSet].filter((panelId) => allowed.has(panelId)))
    })

    setMatchingPanels(currentSet)
  }, [activeFilters, snapshots, rangeKey, allPanelIds])

  useEffect(() => {
    if (typeof onUpdateMatchingPanels === 'function') {
      onUpdateMatchingPanels(Array.from(matchingPanels))
    }
  }, [matchingPanels, onUpdateMatchingPanels])

  const matchingCount = matchingPanels.size
  const matchingList = useMemo(() => Array.from(matchingPanels).sort((a, b) => Number(a) - Number(b)), [matchingPanels])

  const handleSelectPanel = async (panelId) => {
    setSelectedPanelId(panelId)
    setSelectedPanelDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    const numericPanelId = Number(panelId)
    const normalizedSelection = Number.isFinite(numericPanelId) ? numericPanelId : panelId

    try {
      const detail = await getPanelById(panelId, {
        apiBase,
        startDate,
        endDate,
        polygons
      })
      setSelectedPanelDetail(detail)
      if (typeof onSelectPanel === 'function') {
        onSelectPanel(normalizedSelection)
      }
    } catch (error) {
      const message = error?.message || 'Unable to load panel details.'
      setDetailError(message)
    } finally {
      setDetailLoading(false)
    }
  }

  const activeFilterSummary = Object.entries(activeFilters)
    .filter(([, bucket]) => Boolean(bucket))
    .map(([parameter, bucket]) => {
      const option = parameterOptions.find((opt) => opt.value === parameter)
      const snapshot = snapshots[parameter]
      let label = bucket
      if (snapshot?.status === 'success' && snapshot.rangeKey === rangeKey) {
        const bucketMeta = snapshot.data?.stats?.buckets?.find((b) => b.id === bucket)
        if (bucketMeta) {
          label = `${bucketMeta.label} (${bucketMeta.rangeLabel})`
        }
      }
      return `${option?.label || parameter}: ${label}`
    })

  return (
    <div className="filter-panel-container">
      <div className="filter-panel-header">
        <div>
          <h3>Advanced Panel Filters</h3>
          <p>Refine {totalPanelCount} panels using sequential parameter filters.</p>
        </div>
        <button type="button" className="exit-filter-button" onClick={onExit}>
          Exit Filter Mode
        </button>
      </div>

      <div className="filter-panel-filters">
        <div className="filter-date-range">
          <div>
            <label>Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label>End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="filter-date-actions">
            <button type="button" onClick={() => resetFilters()}>
              Reset Filters
            </button>
          </div>
        </div>

        <div className="filter-parameters-list">
          {parameterOptions.map((option) => {
            const snapshot = snapshots[option.value]
            const inRangeSnapshot = snapshot && snapshot.rangeKey === rangeKey ? snapshot : null
            const isLoading = inRangeSnapshot?.status === 'loading'
            const hasError = inRangeSnapshot?.status === 'error'
            const bucketOptions = inRangeSnapshot?.status === 'success' ? inRangeSnapshot.data?.stats?.buckets || [] : []
            const currentBucket = activeFilters[option.value] || ''

            return (
              <div className="filter-parameter-row" key={option.value}>
                <div className="filter-parameter-header">
                  <span>{option.label}</span>
                  {isLoading && <span className="filter-status">Loading…</span>}
                  {hasError && <span className="filter-status error">{inRangeSnapshot?.error}</span>}
                </div>
                <div className="filter-parameter-controls">
                  <button
                    type="button"
                    className="filter-load-button"
                    onClick={() => fetchSnapshot(option.value)}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Loading…' : 'Load options'}
                  </button>
                  <select
                    value={currentBucket}
                    onChange={(e) => handleFilterChange(option.value, e.target.value)}
                    onFocus={() => ensureSnapshot(option.value)}
                    disabled={!bucketOptions.length}
                  >
                    <option value="">Any</option>
                    {bucketOptions.map((bucket) => (
                      <option value={bucket.id} key={`${option.value}-${bucket.id}`}>
                        {bucket.label} ({bucket.rangeLabel})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="filter-results-summary">
        <div>
          <strong>{matchingCount}</strong> panels match the current filters (of {totalPanelCount})
        </div>
        {activeFilterSummary.length > 0 && (
          <div className="filter-active-summary">
            Active filters: {activeFilterSummary.join(' • ')}
          </div>
        )}
      </div>

      <div className="filter-results-layout">
        <div className="filter-panel-list">
          <h4>Matching Panels</h4>
          {matchingList.length === 0 ? (
            <div className="filter-empty-state">No panels satisfy the current filters.</div>
          ) : (
            <ul>
              {matchingList.map((panelId) => (
                <li key={panelId}>
                  <button
                    type="button"
                    className={panelId === String(selectedPanelId) ? 'active' : ''}
                    onClick={() => handleSelectPanel(panelId)}
                  >
                    Panel {panelId}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="filter-panel-detail">
          <h4>Panel Performance</h4>
          {detailLoading && <div className="filter-detail-state">Loading panel data…</div>}
          {detailError && <div className="filter-detail-error">{detailError}</div>}
          {!detailLoading && !selectedPanelDetail && !detailError && (
            <div className="filter-detail-state">Select a panel to view its multi-parameter history.</div>
          )}
          {selectedPanelDetail && (
            <DataPanel
              id="filter-panel-detail"
              paneIndex={0}
              panelId={selectedPanelDetail.id}
              panelName={selectedPanelDetail.name}
              dataByParameter={selectedPanelDetail.metrics || {}}
              selectedParameters={orderedParameters}
              loading={detailLoading}
              onNavigateHistory={() => {}}
              onClose={() => {}}
              onPaneClick={() => {}}
              isActive
              mapPanelValue={selectedPanelDetail.metrics?.LST?.current_value}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default FilterPanel


