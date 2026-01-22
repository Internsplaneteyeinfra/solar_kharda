import React from 'react'
import './MapViewToggle.css'

const MapViewToggle = ({ mapView, setMapView }) => {
  return (
    <div className="map-view-toggle">
      <button
        className={mapView === 'map' ? 'active' : ''}
        onClick={() => setMapView('map')}
      >
        🗺 Map
      </button>

      <button
        className={mapView === 'satellite' ? 'active' : ''}
        onClick={() => setMapView('satellite')}
      >
        🛰 Satellite
      </button>
    </div>
  )
}

export default MapViewToggle
