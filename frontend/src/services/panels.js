import axios from 'axios'

const PARAMETERS = ['LST', 'SWIR', 'SOILING', 'NDVI', 'NDWI', 'VISIBLE']

const PREFERRED_METADATA_KEYS = [
  'name',
  'panel_name',
  'capacity',
  'capacity_mw',
  'capacity_kw',
  'dc_capacity',
  'ac_capacity',
  'moduleType',
  'module_type',
  'inverter',
  'strings',
  'tilt',
  'azimuth',
  'orientation',
  'healthScore',
  'health_score',
  'installer',
  'commissioned',
  'city',
  'state'
]

function ensureOptions(options) {
  if (!options) {
    throw new Error('Options are required to fetch panel data.')
  }
  return options
}

function findFeatureById(polygons, panelId) {
  if (!polygons || !Array.isArray(polygons.features)) {
    return null
  }
  const targetId = String(panelId).toLowerCase()
  return polygons.features.find((feature) => {
    const candidateId = feature?.properties?.panel_id
    if (candidateId === undefined || candidateId === null) {
      return false
    }
    return String(candidateId).toLowerCase() === targetId
  }) || null
}

function computeCentroid(feature) {
  if (!feature?.geometry) {
    return null
  }

  const { geometry } = feature
  const points = []

  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates || []
    const outerRing = Array.isArray(rings[0]) ? rings[0] : []
    outerRing.forEach((coord) => {
      if (Array.isArray(coord) && coord.length >= 2) {
        points.push({ lng: Number(coord[0]), lat: Number(coord[1]) })
      }
    })
  } else if (geometry.type === 'MultiPolygon') {
    const polygons = geometry.coordinates || []
    polygons.forEach((poly) => {
      const outerRing = Array.isArray(poly?.[0]) ? poly[0] : []
      outerRing.forEach((coord) => {
        if (Array.isArray(coord) && coord.length >= 2) {
          points.push({ lng: Number(coord[0]), lat: Number(coord[1]) })
        }
      })
    })
  }

  if (!points.length) {
    return null
  }

  const sum = points.reduce(
    (acc, point) => {
      acc.lat += point.lat
      acc.lng += point.lng
      return acc
    },
    { lat: 0, lng: 0 }
  )

  return {
    lat: sum.lat / points.length,
    lng: sum.lng / points.length
  }
}

function normaliseId(id) {
  if (id === undefined || id === null) return ''
  return String(id).trim()
}

function extractMetadata(properties = {}) {
  const metadata = {}
  PREFERRED_METADATA_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(properties, key)) {
      metadata[key] = properties[key]
    }
  })
  return metadata
}

export async function getPanelById(panelId, options) {
  const { apiBase, startDate, endDate, polygons } = ensureOptions(options)
  const normalizedId = normaliseId(panelId)

  if (!normalizedId) {
    throw new Error('Panel ID is required.')
  }
  if (!apiBase) {
    throw new Error('API base URL is missing.')
  }
  if (!startDate || !endDate) {
    throw new Error('Start date and end date are required to compare panels.')
  }

  const feature = findFeatureById(polygons, normalizedId)
  if (!feature) {
    throw new Error(`Panel ${normalizedId} not found.`)
  }

  const centroid = computeCentroid(feature)
  const metadata = extractMetadata(feature.properties || {})
  const idForRequest = Number(normalizedId)
  const payloadId = Number.isFinite(idForRequest) ? idForRequest : normalizedId

  const fetchMetric = async (parameter) => {
    try {
      const response = await axios.post(`${apiBase}/api/panel-data`, {
        panel_id: payloadId,
        parameter,
        start_date: startDate,
        end_date: endDate
      })
      return {
        parameter,
        data: response.data
      }
    } catch (error) {
      const detail = error?.response?.data?.detail || error?.message || `Unable to fetch ${parameter} for panel ${normalizedId}.`
      return {
        parameter,
        error: detail
      }
    }
  }

  const results = await Promise.all(PARAMETERS.map(fetchMetric))
  const metrics = results.reduce((acc, entry) => {
    acc[entry.parameter] = entry.error ? { error: entry.error } : entry.data
    return acc
  }, {})

  const panelName = metadata.name || metadata.panel_name || `Panel ${normalizedId}`

  return {
    id: normalizedId,
    name: panelName,
    location: centroid,
    properties: feature.properties || {},
    metadata,
    metrics
  }
}
