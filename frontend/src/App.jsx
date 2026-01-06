import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import axios from 'axios'
import ControlPanel from './components/ControlPanel'
import DataPanel from './components/DataPanel'
import Login from './components/Login'
import WeatherBanner from './components/WeatherBanner'
import ComparePanel from './components/ComparePanel'
import FilterPanel from './components/FilterPanel'
import { getPanelById } from './services/panels'
import './App.css'

const API_BASE = 'http://localhost:8000'
const PARAMETER_OPTIONS = Object.freeze([
  { value: 'LST', label: 'Panel Temperature' },
  { value: 'SWIR', label: 'Reflectance' },
  { value: 'SOILING', label: 'Soiling Dust Index' },
  { value: 'NDVI', label: 'Vegetation Index' },
  { value: 'NDWI', label: 'Surface Water' },
  { value: 'VISIBLE', label: 'Visible Brightness' }
])
const COMPARE_PANEL_COLORS = Object.freeze({
  panelA: '#38bdf8',
  panelB: '#fbbf24'
})

const defaultCompareState = {
  idA: '',
  idB: '',
  startDate: '',
  endDate: '',
  loading: false,
  error: null,
  dataA: null,
  dataB: null,
  lastUpdated: null,
  fieldErrors: {}
}

function formatDate(d) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatMonth(monthStr) {
  // Format month: "2024-01" -> "January 2024"
  if (!monthStr) return ''
  const [year, month] = monthStr.split('-')
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                     'July', 'August', 'September', 'October', 'November', 'December']
  const monthName = monthNames[parseInt(month, 10) - 1] || month
  return `${monthName} ${year}`
}

function monthBefore(dateStr) {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() - 1)
  return formatDate(d)
}

function MapClickHandler({ onPanelClick, selectedPanel }) {
  useMapEvents({
    click: (e) => {
      // Click handling is done in GeoJSON component
    }
  })
  return null
}

function App() {
  const [isAuthed, setIsAuthed] = useState(() => {
    return localStorage.getItem('sf_auth') === '1'
  })
  const [polygons, setPolygons] = useState(null)
  const [allPanelIds, setAllPanelIds] = useState([]) // Sorted list of all panel IDs
  const [selectedPanel, setSelectedPanel] = useState(null)
  const [panes, setPanes] = useState([]) // Array of { id: panelId, history: [...] }
  const [activePaneIndex, setActivePaneIndex] = useState(null) // Index of active pane
  const [panelDataMap, setPanelDataMap] = useState({})
  const [loadingMap, setLoadingMap] = useState({})
  const [selectedParameters, setSelectedParameters] = useState(['LST'])
  const todayStr = formatDate(new Date())
  const [endDate, setEndDate] = useState(todayStr)
  const [startDate, setStartDate] = useState(monthBefore(todayStr))
  const [mapCenter, setMapCenter] = useState([18.671, 75.521])
  const [mapZoom, setMapZoom] = useState(16)
  const [mapView, setMapView] = useState('map')
  const [showPolygons, setShowPolygons] = useState(true)
  const [panelLstData, setPanelLstData] = useState({})
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const [analyzeTick, setAnalyzeTick] = useState(0)
  const [compareMode, setCompareMode] = useState(false)
  const [compareState, setCompareState] = useState(defaultCompareState)
  const [filterMode, setFilterMode] = useState(false)
  const [filterMatchedIds, setFilterMatchedIds] = useState(null)

  const compareIds = useMemo(() => {
    const normalize = (value) => {
      if (value === undefined || value === null) return ''
      return String(value).trim().toLowerCase()
    }
    return {
      panelA: normalize(compareState?.dataA?.id ?? compareState?.idA),
      panelB: normalize(compareState?.dataB?.id ?? compareState?.idB)
    }
  }, [compareState])

  const fetchAllLstData = async (rangeStart, rangeEnd) => {
    if (!isAuthed || !rangeStart || !rangeEnd) {
      setPanelLstData({})
      return
    }

    const startDateObj = new Date(rangeStart)
    const endDateObj = new Date(rangeEnd)
    if (Number.isNaN(startDateObj.getTime()) || Number.isNaN(endDateObj.getTime()) || startDateObj > endDateObj) {
      setPanelLstData({})
      return
    }

    try {
      console.log('[DEBUG] Fetching all panels LST data...', { rangeStart, rangeEnd })
      const response = await axios.get(`${API_BASE}/api/all-panels-lst`, {
        params: { start_date: rangeStart, end_date: rangeEnd },
        timeout: 120000
      })
      const lstData = response.data?.panel_lst || {}

      const normalizedLstData = {}
      for (const [key, value] of Object.entries(lstData)) {
        normalizedLstData[String(key)] = value
      }

      setPanelLstData(normalizedLstData)
    } catch (error) {
      console.error('[ERROR] Error fetching all panels LST:', error)
      setPanelLstData({})
    }
  }

  const handleEnterCompare = () => {
    if (filterMode) {
      setFilterMode(false)
      setFilterMatchedIds(null)
    }
    setCompareMode(true)
    setCompareState(() => ({
      ...defaultCompareState,
      idA: selectedPanel ? String(selectedPanel) : '',
      idB: '',
      startDate,
      endDate
    }))
  }

  const handleExitCompare = () => {
    setCompareMode(false)
    setCompareState({ ...defaultCompareState })
  }

  const handleEnterFilterMode = () => {
    if (compareMode) {
      setCompareMode(false)
      setCompareState({ ...defaultCompareState })
    }
    setFilterMode(true)
    setFilterMatchedIds(null)
  }

  const handleExitFilterMode = () => {
    setFilterMode(false)
    setFilterMatchedIds(null)
  }

  const handleFilterMatchesUpdate = useCallback((panelIds) => {
    if (!Array.isArray(panelIds)) {
      setFilterMatchedIds(null)
      return
    }
    const nextSet = new Set(panelIds.map((id) => String(id)))
    setFilterMatchedIds(nextSet)
  }, [])

  const handleToggleParameter = (param) => {
    setSelectedParameters((prev) => {
      if (prev.includes(param)) {
        if (prev.length === 1) {
          return prev
        }
        setPanelDataMap((prevMap) => {
          if (!prevMap || typeof prevMap !== 'object') {
            return prevMap
          }
          let changed = false
          const next = {}
          Object.entries(prevMap).forEach(([panelId, paramMap]) => {
            if (!paramMap || typeof paramMap !== 'object') {
              return
            }
            if (paramMap[param]) {
              const updatedParamMap = { ...paramMap }
              delete updatedParamMap[param]
              changed = true
              if (Object.keys(updatedParamMap).length > 0) {
                next[panelId] = updatedParamMap
              }
            } else {
              next[panelId] = paramMap
            }
          })
          return changed ? next : prevMap
        })
        return prev.filter((p) => p !== param)
      }
      return [...prev, param]
    })
  }

  const handleAnalyze = async () => {
    if (!startDate || !endDate) {
      console.warn('[WARN] Start and end dates are required to analyse panels.')
      return
    }

    const start = new Date(startDate)
    const end = new Date(endDate)
    const hasValidRange = !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end

    setAnalyzeLoading(true)
    try {
      if (selectedParameters.includes('LST') && hasValidRange) {
        await fetchAllLstData(startDate, endDate)
      } else if (!selectedParameters.includes('LST') || !hasValidRange) {
        setPanelLstData({})
      }

      setPanelDataMap((prev) => {
        if (!prev || typeof prev !== 'object') {
          return prev
        }
        const next = {}
        Object.entries(prev).forEach(([panelId, paramMap]) => {
          const filteredEntries = Object.entries(paramMap || {}).filter(([paramKey]) =>
            selectedParameters.includes(paramKey)
          )
          if (filteredEntries.length > 0) {
            next[panelId] = Object.fromEntries(filteredEntries)
          }
        })
        return next
      })
    } finally {
      setAnalyzeLoading(false)
      setAnalyzeTick((prev) => prev + 1)
    }
  }

  const handleCompareFieldChange = (field, value) => {
    setCompareState((prev) => ({
      ...prev,
      [field]: value,
      error: field === 'idA' || field === 'idB' || field === 'startDate' || field === 'endDate' ? null : prev.error,
      fieldErrors: {
        ...(prev.fieldErrors || {}),
        [field]: ''
      }
    }))
  }

  const handleCompareAnalyse = async () => {
    const trimmedIdA = (compareState.idA || '').trim()
    const trimmedIdB = (compareState.idB || '').trim()
    const compareStart = (compareState.startDate || '').trim()
    const compareEnd = (compareState.endDate || '').trim()

    const newFieldErrors = {}

    if (!trimmedIdA) {
      newFieldErrors.idA = 'Panel ID A is required.'
    }
    if (!trimmedIdB) {
      newFieldErrors.idB = 'Panel ID B is required.'
    }

    if (!compareStart) {
      newFieldErrors.startDate = 'Start date is required.'
    }
    if (!compareEnd) {
      newFieldErrors.endDate = 'End date is required.'
    }

    let startDateValid = false
    let endDateValid = false
    let startDateObj = null
    let endDateObj = null

    if (compareStart) {
      const parsed = new Date(compareStart)
      if (!Number.isNaN(parsed.getTime())) {
        startDateValid = true
        startDateObj = parsed
      } else {
        newFieldErrors.startDate = 'Invalid start date.'
      }
    }

    if (compareEnd) {
      const parsed = new Date(compareEnd)
      if (!Number.isNaN(parsed.getTime())) {
        endDateValid = true
        endDateObj = parsed
      } else {
        newFieldErrors.endDate = 'Invalid end date.'
      }
    }

    if (startDateValid && endDateValid && startDateObj > endDateObj) {
      newFieldErrors.endDate = 'End date must be after start date.'
    }

    if (Object.keys(newFieldErrors).length > 0) {
      setCompareState((prev) => ({
        ...prev,
        idA: trimmedIdA,
        idB: trimmedIdB,
        startDate: compareStart,
        endDate: compareEnd,
        fieldErrors: {
          ...(prev.fieldErrors || {}),
          ...newFieldErrors
        },
        error: 'Please resolve the highlighted fields before analysing.'
      }))
      return
    }

    if (!polygons || !Array.isArray(polygons.features) || polygons.features.length === 0) {
      setCompareState((prev) => ({
        ...prev,
        idA: trimmedIdA,
        idB: trimmedIdB,
        startDate: compareStart,
        endDate: compareEnd,
        fieldErrors: {},
        error: 'Panel boundaries are still loading. Please try again in a moment.'
      }))
      return
    }

    setCompareState((prev) => ({
      ...prev,
      idA: trimmedIdA,
      idB: trimmedIdB,
      startDate: compareStart,
      endDate: compareEnd,
      loading: true,
      error: null,
      fieldErrors: {}
    }))

    try {
      const [panelAResult, panelBResult] = await Promise.allSettled([
        getPanelById(trimmedIdA, { apiBase: API_BASE, startDate: compareStart, endDate: compareEnd, polygons }),
        getPanelById(trimmedIdB, { apiBase: API_BASE, startDate: compareStart, endDate: compareEnd, polygons })
      ])

      const nextState = {
        idA: trimmedIdA,
        idB: trimmedIdB,
        startDate: compareStart,
        endDate: compareEnd,
        loading: false,
        dataA: null,
        dataB: null,
        error: null,
        fieldErrors: {},
        lastUpdated: null
      }

      if (panelAResult.status === 'fulfilled') {
        nextState.dataA = panelAResult.value
      } else {
        const message = panelAResult.reason?.message || 'Unable to fetch data for Panel A.'
        nextState.fieldErrors.idA = message
        nextState.error = message
      }

      if (panelBResult.status === 'fulfilled') {
        nextState.dataB = panelBResult.value
      } else {
        const message = panelBResult.reason?.message || 'Unable to fetch data for Panel B.'
        nextState.fieldErrors.idB = message
        nextState.error = nextState.error ? `${nextState.error} | ${message}` : message
      }

      if (nextState.dataA || nextState.dataB) {
        nextState.lastUpdated = new Date().toISOString()
      }

      setCompareState(nextState)
    } catch (err) {
      const message = err?.message || 'Unexpected error while analysing panels.'
      setCompareState((prev) => ({
        ...prev,
        loading: false,
        error: message
      }))
    }
  }

  useEffect(() => {
    if (!isAuthed) return
    // Load polygons
    axios.get(`${API_BASE}/polygons`)
      .then(response => {
        setPolygons(response.data)
        // Extract all panel IDs and sort them
        if (response.data.features && response.data.features.length > 0) {
          const panelIds = response.data.features
            .map(feature => feature.properties?.panel_id)
            .filter(id => id !== null && id !== undefined)
            .sort((a, b) => a - b) // Sort numerically
          setAllPanelIds(panelIds)
          
          // Calculate center from first polygon
          const firstPolygon = response.data.features[0].geometry.coordinates[0]
          const center = [
            firstPolygon.reduce((sum, coord) => sum + coord[1], 0) / firstPolygon.length,
            firstPolygon.reduce((sum, coord) => sum + coord[0], 0) / firstPolygon.length
          ]
          setMapCenter(center)
        }
      })
      .catch(error => {
        // Silently handle polygon loading errors
      })
  }, [isAuthed])

  // Track previous values to detect actual changes
  
  useEffect(() => {
    if (!isAuthed) return
    if (!startDate || !endDate) return
    if (selectedParameters.length === 0) return
    if (analyzeTick === 0) return // Only fetch after Analyze has been clicked at least once

    const visiblePanels = panes.map(pane => pane.id).filter(id => id !== null)
    if (visiblePanels.length === 0) return

    const start = new Date(startDate)
    const end = new Date(endDate)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      const message = 'Invalid date format. Please select valid dates.'
      visiblePanels.forEach(panelId => {
        setPanelDataMap(prev => ({
          ...prev,
          [panelId]: {
            ...(prev[panelId] || {}),
            ...selectedParameters.reduce((acc, param) => {
              acc[param] = {
                error: message,
                parameter: param,
                start_date: startDate,
                end_date: endDate
              }
              return acc
            }, {})
          }
        }))
      })
      return
    }

    if (start > end) {
      const message = 'Start date must be before or equal to end date.'
      visiblePanels.forEach(panelId => {
        setPanelDataMap(prev => ({
          ...prev,
          [panelId]: {
            ...(prev[panelId] || {}),
            ...selectedParameters.reduce((acc, param) => {
              acc[param] = {
                error: message,
                parameter: param,
                start_date: startDate,
                end_date: endDate
              }
              return acc
            }, {})
          }
        }))
      })
      return
    }

    const pendingByPanel = {}

    visiblePanels.forEach(panelId => {
      const panelData = panelDataMap[panelId] || {}
      const paramsToFetch = selectedParameters.filter(param => {
        const existing = panelData[param]
        return !existing ||
               existing.error ||
               existing.start_date !== startDate ||
               existing.end_date !== endDate
      })

      if (paramsToFetch.length === 0) {
        return
      }

      setLoadingMap(prev => ({ ...prev, [panelId]: true }))
      pendingByPanel[panelId] = paramsToFetch.length

      paramsToFetch.forEach(param => {
        axios.post(`${API_BASE}/api/panel-data`, {
          panel_id: panelId,
          parameter: param,
          start_date: startDate,
          end_date: endDate
        }).then(response => {
          const dataWithMeta = {
            ...response.data,
            parameter: param,
            start_date: startDate,
            end_date: endDate
          }
          setPanelDataMap(prev => ({
            ...prev,
            [panelId]: {
              ...(prev[panelId] || {}),
              [param]: dataWithMeta
            }
          }))
        }).catch(error => {
          const errorMessage = error.response?.data?.detail || error.message || 'Failed to fetch data'
          setPanelDataMap(prev => ({
            ...prev,
            [panelId]: {
              ...(prev[panelId] || {}),
              [param]: {
                error: errorMessage,
                parameter: param,
                start_date: startDate,
                end_date: endDate
              }
            }
          }))
        }).finally(() => {
          setLoadingMap(prev => {
            const next = { ...prev }
            if (pendingByPanel[panelId] !== undefined) {
              pendingByPanel[panelId] -= 1
              if (pendingByPanel[panelId] <= 0) {
                next[panelId] = false
              } else {
                next[panelId] = true
              }
            } else {
              next[panelId] = false
            }
            return next
          })
        })
      })
    })

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, panes, selectedParameters, startDate, endDate, analyzeTick])

  const handlePanelClick = (e, feature) => {
    const panelId = feature?.properties?.panel_id ?? feature
    
    // Check if this panel is already in a pane
    const existingPaneIndex = panes.findIndex(pane => pane.id === panelId)
    
    if (existingPaneIndex !== -1) {
      // Panel already exists, just activate it
      setActivePaneIndex(existingPaneIndex)
      setSelectedPanel(panelId)
      setTimeout(() => {
        const paneElement = document.getElementById(`pane-${existingPaneIndex}`)
        if (paneElement) {
          paneElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
      }, 0)
      return
    }
    
    // Always add a new pane for multiple selection
    setPanes(prev => {
      const newPanes = [...prev, { id: panelId, history: [panelId] }]
      // Set the new pane as active and scroll to it
      const newIndex = newPanes.length - 1
      setActivePaneIndex(newIndex)
      setTimeout(() => {
        const paneElement = document.getElementById(`pane-${newIndex}`)
        if (paneElement) {
          paneElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
      }, 0)
      return newPanes
    })
    
    setSelectedPanel(panelId)
    
    // If Analyze has been run, fetch data immediately for this panel
    if (analyzeTick > 0 && selectedParameters.length > 0 && startDate && endDate) {
      setLoadingMap(prev => {
        if (!prev[panelId]) {
          return { ...prev, [panelId]: true }
        }
        return prev
      })
      
      const panelData = panelDataMap[panelId] || {}
      const paramsToFetch = selectedParameters.filter(param => {
        const existing = panelData[param]
        return !existing ||
               existing.error ||
               existing.start_date !== startDate ||
               existing.end_date !== endDate
      })
      
      if (paramsToFetch.length > 0) {
        const start = new Date(startDate)
        const end = new Date(endDate)
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end) {
          let completedCount = 0
          const totalRequests = paramsToFetch.length
          
          paramsToFetch.forEach(param => {
            axios.post(`${API_BASE}/api/panel-data`, {
              panel_id: panelId,
              parameter: param,
              start_date: startDate,
              end_date: endDate
            }).then(response => {
              const dataWithMeta = {
                ...response.data,
                parameter: param,
                start_date: startDate,
                end_date: endDate
              }
              setPanelDataMap(prev => ({
                ...prev,
                [panelId]: {
                  ...(prev[panelId] || {}),
                  [param]: dataWithMeta
                }
              }))
            }).catch(error => {
              const errorMessage = error.response?.data?.detail || error.message || 'Failed to fetch data'
              setPanelDataMap(prev => ({
                ...prev,
                [panelId]: {
                  ...(prev[panelId] || {}),
                  [param]: {
                    error: errorMessage,
                    parameter: param,
                    start_date: startDate,
                    end_date: endDate
                  }
                }
              }))
            }).finally(() => {
              completedCount++
              if (completedCount >= totalRequests) {
                setLoadingMap(prev => ({ ...prev, [panelId]: false }))
              }
            })
          })
        } else {
          setLoadingMap(prev => ({ ...prev, [panelId]: false }))
        }
      } else {
        setLoadingMap(prev => ({ ...prev, [panelId]: false }))
      }
    }
  }
  
  const handlePaneClick = (index) => {
    setActivePaneIndex(index)
    if (panes[index]) {
      setSelectedPanel(panes[index].id)
      // Scroll to active pane
      setTimeout(() => {
        const paneElement = document.getElementById(`pane-${index}`)
        if (paneElement) {
          paneElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
      }, 0)
    }
  }

  const handleNavigatePanes = useCallback((direction) => {
    // Navigate through panes, not panel history
    setPanes(currentPanes => {
      if (currentPanes.length === 0) return currentPanes
      
      setActivePaneIndex(currentIndex => {
        let newIndex
        if (direction === 'prev') {
          if (currentIndex === null || currentIndex === 0) {
            newIndex = currentPanes.length - 1 // Loop to last
          } else {
            newIndex = currentIndex - 1
          }
        } else { // next
          if (currentIndex === null || currentIndex === currentPanes.length - 1) {
            newIndex = 0 // Loop to first
          } else {
            newIndex = currentIndex + 1
          }
        }
        
        if (currentPanes[newIndex]) {
          setSelectedPanel(currentPanes[newIndex].id)
          // Scroll to active pane
          setTimeout(() => {
            const paneElement = document.getElementById(`pane-${newIndex}`)
            if (paneElement) {
              paneElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
            }
          }, 0)
        }
        
        return newIndex
      })
      
      return currentPanes
    })
  }, [])
  
  const handleNavigatePanelHistory = (direction, paneIndex) => {
    // Navigate through all panels (next/previous in sorted list)
    if (paneIndex < 0 || paneIndex >= panes.length) return
    if (allPanelIds.length === 0) return
    
    const pane = panes[paneIndex]
    const currentPanelId = pane.id
    
    // Find current panel's index in the sorted list
    const currentIndex = allPanelIds.findIndex(id => id === currentPanelId)
    if (currentIndex === -1) return
    
    let newIndex
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : allPanelIds.length - 1
    } else { // next
      newIndex = currentIndex < allPanelIds.length - 1 ? currentIndex + 1 : 0
    }
    
    const newPanelId = allPanelIds[newIndex]
    
    // Set loading state if this panel doesn't have data yet
    if (analyzeTick > 0 && !panelDataMap[newPanelId] && !loadingMap[newPanelId]) {
      setLoadingMap(prev => ({ ...prev, [newPanelId]: true }))
    }
    
    // Update pane with new panel ID and add to history
    const newPanes = [...panes]
    const newHistory = pane.history.includes(newPanelId) 
      ? pane.history 
      : [...pane.history, newPanelId]
    newPanes[paneIndex] = { id: newPanelId, history: newHistory }
    setPanes(newPanes)
    setSelectedPanel(newPanelId)
  }

  const handleClosePanel = (paneIndex) => {
    if (paneIndex < 0 || paneIndex >= panes.length) return
    
    const pane = panes[paneIndex]
    const panelId = pane.id
    
    // Remove pane
    const newPanes = panes.filter((_, idx) => idx !== paneIndex)
    setPanes(newPanes)
    
    setPanelDataMap(prev => {
      const newMap = { ...prev }
      delete newMap[panelId]
      return newMap
    })
    setLoadingMap(prev => {
      const newMap = { ...prev }
      delete newMap[panelId]
      return newMap
    })
    
    // Update active pane index
    if (activePaneIndex === paneIndex) {
      if (newPanes.length > 0) {
        const newActiveIndex = paneIndex < newPanes.length ? paneIndex : newPanes.length - 1
        setActivePaneIndex(newActiveIndex)
        setSelectedPanel(newPanes[newActiveIndex].id)
      } else {
        setActivePaneIndex(null)
        setSelectedPanel(null)
      }
    } else if (activePaneIndex > paneIndex) {
      setActivePaneIndex(activePaneIndex - 1)
    }
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
        return
      }
      
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handleNavigatePanes('prev')
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleNavigatePanes('next')
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        handleNavigatePanes('prev')
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        handleNavigatePanes('next')
      } else if (e.key === 'Enter' && activePaneIndex !== null) {
        e.preventDefault()
        // Pane is already selected, could trigger detail view
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activePaneIndex, handleNavigatePanes])

  // Function to get color based on LST value (matching GEE visualization palette)
  // Palette: Blue (#0000FF) -> Cyan (#00FFFF) -> Green (#00FF00) -> Yellow (#FFFF00) -> Red (#FF0000)
  // Range: 15°C (min) to 45°C (max)
  const getLstColor = (lstValue) => {
    if (lstValue === null || lstValue === undefined) {
      return '#64b4be' // Default blue-gray
    }
    
    const min = 15
    const max = 45
    
    if (lstValue < min) {
      return '#0000FF' // Blue
    } else if (lstValue > max) {
      return '#FF0000' // Red
    }
    
    // Normalize to 0-1 range
    const normalized = (lstValue - min) / (max - min)
    
    // Interpolate through the 5-color palette
    // Colors: Blue (0) -> Cyan (0.25) -> Green (0.5) -> Yellow (0.75) -> Red (1)
    const palette = [
      { pos: 0.0, r: 0, g: 0, b: 255 },   // Blue (#0000FF)
      { pos: 0.25, r: 0, g: 255, b: 255 }, // Cyan (#00FFFF)
      { pos: 0.5, r: 0, g: 255, b: 0 },    // Green (#00FF00)
      { pos: 0.75, r: 255, g: 255, b: 0 }, // Yellow (#FFFF00)
      { pos: 1.0, r: 255, g: 0, b: 0 }     // Red (#FF0000)
    ]
    
    // Find the two colors to interpolate between
    let color1 = palette[0]
    let color2 = palette[palette.length - 1]
    
    for (let i = 0; i < palette.length - 1; i++) {
      if (normalized >= palette[i].pos && normalized <= palette[i + 1].pos) {
        color1 = palette[i]
        color2 = palette[i + 1]
        break
      }
    }
    
    // Interpolate between the two colors
    const t = (normalized - color1.pos) / (color2.pos - color1.pos)
    const r = Math.round(color1.r + (color2.r - color1.r) * t)
    const g = Math.round(color1.g + (color2.g - color1.g) * t)
    const b = Math.round(color1.b + (color2.b - color1.b) * t)
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }

  const compareIdA = compareIds.panelA
  const compareIdB = compareIds.panelB

  const getStyle = useCallback((feature) => {
    const panelId = feature?.properties?.panel_id
    const panelIdStr = panelId !== undefined && panelId !== null ? String(panelId) : ''
    const filterActive = filterMode && filterMatchedIds instanceof Set
    const passesFilter = !filterActive || filterMatchedIds.has(panelIdStr)
    if (filterActive && !passesFilter) {
      return {
        color: 'transparent',
        weight: 0,
        opacity: 0,
        fillColor: 'transparent',
        fillOpacity: 0
      }
    }
    const isSelected = selectedPanel === panelId
    const normalizedPanelId = panelIdStr.trim().toLowerCase()
    const isCompareA = compareMode && compareIdA && normalizedPanelId === compareIdA
    const isCompareB = compareMode && compareIdB && normalizedPanelId === compareIdB
    const lstSelected = selectedParameters.includes('LST')
    
    // If LST parameter is selected and we have LST data, color by LST value
    let fillColor = '#64b4be'
    if (lstSelected && panelLstData && panelLstData[panelIdStr] !== undefined && panelLstData[panelIdStr] !== null && panelLstData[panelIdStr] !== '') {
      const lstValue = panelLstData[panelIdStr]
      fillColor = getLstColor(lstValue)
    }

    if (isCompareA) {
      return {
        color: COMPARE_PANEL_COLORS.panelA,
        weight: 3,
        fillColor: COMPARE_PANEL_COLORS.panelA,
        fillOpacity: 0.45
      }
    }

    if (isCompareB) {
      return {
        color: COMPARE_PANEL_COLORS.panelB,
        weight: 3,
        fillColor: COMPARE_PANEL_COLORS.panelB,
        fillOpacity: 0.45
      }
    }

    if (compareMode) {
      return {
        color: '#1f2937',
        weight: 1,
        fillColor: '#1f2937',
        fillOpacity: 0.12
      }
    }
    
    if (isSelected) {
      return {
        color: '#ffff00',
        weight: 3,
        fillColor: fillColor,
        fillOpacity: 0.7
      }
    }
    
    return {
      color: fillColor,
      weight: lstSelected ? 2 : 1,
      fillColor: fillColor,
      fillOpacity: lstSelected ? 0.6 : 0.3
    }
  }, [selectedParameters, selectedPanel, panelLstData, compareMode, compareIdA, compareIdB, filterMode, filterMatchedIds])

  const onEachFeature = (feature, layer) => {
    layer.on({
      click: (e) => handlePanelClick(e, feature)
    })
  }

  const handleLogin = () => {
    setIsAuthed(true)
    localStorage.setItem('sf_auth', '1')
  }

  const handleLogout = () => {
    setIsAuthed(false)
    localStorage.removeItem('sf_auth')
    setCompareMode(false)
    setCompareState({ ...defaultCompareState })
    setFilterMode(false)
    setFilterMatchedIds(null)
  }

  const isAltMode = compareMode || filterMode
  const appContainerClass = isAltMode ? 'app-container compare-mode' : 'app-container'
  const mainContentClass = isAltMode ? 'main-content compare-active' : 'main-content with-panels'

  if (!isAuthed) {
    return <Login onSuccess={handleLogin} />
  }

  return (
    <>
      <WeatherBanner />
      <div className={appContainerClass}>
        {!compareMode && !filterMode && (
          <ControlPanel
            selectedParameters={selectedParameters}
            onToggleParameter={handleToggleParameter}
            parameterOptions={PARAMETER_OPTIONS}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            mapView={mapView}
            setMapView={setMapView}
            showPolygons={showPolygons}
            setShowPolygons={setShowPolygons}
            onLogout={handleLogout}
            onAnalyze={handleAnalyze}
            analyzeLoading={analyzeLoading}
            onEnterCompare={handleEnterCompare}
            onEnterFilter={handleEnterFilterMode}
          />
        )}

        <div className={mainContentClass}>
          <div className="map-container">
            <MapContainer
              center={mapCenter}
              zoom={mapZoom}
              style={{ height: '100%', width: '100%' }}
            >
              {mapView === 'satellite' ? (
                <TileLayer
                  key="satellite"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  attribution='&copy; <a href="https://www.esri.com/">Esri</a> contributors'
                />
              ) : (
                <TileLayer
                  key="map"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
              )}
              {polygons && showPolygons && (
                <GeoJSON
                  key={`lst-${selectedParameters.slice().sort().join('-')}-${Object.keys(panelLstData || {}).length}-${analyzeLoading ? 'loading' : 'ready'}`}
                  data={polygons}
                  style={getStyle}
                  onEachFeature={onEachFeature}
                />
              )}
              <MapClickHandler onPanelClick={handlePanelClick} selectedPanel={selectedPanel} />
            </MapContainer>
          </div>

          {compareMode ? (
            <ComparePanel
              compareState={compareState}
              onFieldChange={handleCompareFieldChange}
              onAnalyse={handleCompareAnalyse}
              onExit={handleExitCompare}
              compareColors={COMPARE_PANEL_COLORS}
            />
          ) : filterMode ? (
            <FilterPanel
              apiBase={API_BASE}
              parameterOptions={PARAMETER_OPTIONS}
              defaultStartDate={startDate}
              defaultEndDate={endDate}
              polygons={polygons}
              allPanelIds={allPanelIds}
              totalPanelCount={allPanelIds.length}
              onExit={handleExitFilterMode}
              onUpdateMatchingPanels={handleFilterMatchesUpdate}
              onSelectPanel={(panelId) => setSelectedPanel(panelId)}
            />
          ) : (
            <div className="panels-container">
              <div className="panels-header">
                <span className="panels-count">{panes.length} {panes.length === 1 ? 'Pane' : 'Panes'}</span>
              </div>
              <div className="panes-list" id="panes-list" role="list">
                {panes.length === 0 ? (
                  <div className="empty-panes-message">
                    <p>SELECT A SOLAR PANEL FOR ANALYSIS</p>
                  </div>
                ) : (
                  panes.map((pane, idx) => {
                    const panelId = pane.id
                    const isActive = activePaneIndex === idx
                    return (
                      <DataPanel
                        key={`pane-${idx}`}
                        id={`pane-${idx}`}
                        paneIndex={idx}
                        panelId={panelId}
                        dataByParameter={panelDataMap[panelId] || {}}
                        loading={Boolean(loadingMap[panelId])}
                        selectedParameters={selectedParameters}
                        mapPanelValue={selectedParameters.includes('LST') ? panelLstData[String(panelId)] : undefined}
                        onNavigateHistory={(dir) => handleNavigatePanelHistory(dir, idx)}
                        onClose={() => handleClosePanel(idx)}
                        onPaneClick={() => handlePaneClick(idx)}
                        isActive={isActive}
                        panelName={`Panel ${panelId}`}
                      />
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default App
