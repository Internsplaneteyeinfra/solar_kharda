import React, { useState, useEffect } from 'react'
import axios from 'axios'
import './WeatherBanner.css'

const API_BASE = 'https://solar-kharda.onrender.com'

function WeatherBanner() {
  const [latest, setLatest] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/weather`)
        const weatherData = response.data.latest || response.data
        setLatest(weatherData)
      } catch (error) {
        // Silently handle errors - set default values
        setLatest({ 
          date: new Date().toISOString().split('T')[0],
          temp_current: 'N/A',
          temp_min: 'N/A',
          temp_max: 'N/A',
          humidity: 'N/A',
          windspeed: 'N/A',
          cloudcover: 'N/A',
          ghi: 'N/A',
          ghi_next_two_hours: null
        })
      } finally {
        setLoading(false)
      }
    }

    fetchWeather()
    // Refresh every 5 minutes
    const interval = setInterval(fetchWeather, 300000)

    return () => clearInterval(interval)
  }, [])

  // Always show banner, even if loading or no data
  if (!latest && loading) {
    return (
      <div className="weather-banner">
        <div className="weather-banner-content content1">
          <div className="weather-item">
            <span className="weather-label">Loading weather data...</span>
          </div>
        </div>
      </div>
    )
  }

  if (!latest) {
    return (
      <div className="weather-banner">
        <div className="weather-banner-content content1">
          <div className="weather-item">
            <span className="weather-label">Weather data unavailable</span>
          </div>
        </div>
      </div>
    )
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric'
      })
    } catch {
      return dateStr
    }
  }

  const formatValue = (value, unit) => {
    if (value === null || value === undefined) return 'N/A'
    return `${value} ${unit}`
  }

  const formatNextTwoHourGhi = (entries) => {
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return 'N/A'
    }
    const values = entries
      .map((entry) => entry?.value)
      .filter((value) => value !== null && value !== undefined)

    if (values.length === 0) return 'N/A'

    return `${values.join(' → ')} W/m²`
  }

  const Row = () => (
    <>
      <div className="weather-item">
        <span className="weather-label">Date:</span>
        <span className="weather-value">{formatDate(latest.date)}</span>
      </div>
      <div className="weather-separator">|</div>
      <div className="weather-item">
        <span className="weather-label">Temp:</span>
        <span className="weather-value">{formatValue(latest.temp_current, '°C')}</span>
      </div>
      <div className="weather-item small">
        <span className="weather-value">(min {formatValue(latest.temp_min, '°C')}, max {formatValue(latest.temp_max, '°C')})</span>
      </div>
      <div className="weather-separator">|</div>
      <div className="weather-item">
        <span className="weather-label">Humidity:</span>
        <span className="weather-value">{formatValue(latest.humidity, '%')}</span>
      </div>
      <div className="weather-separator">|</div>
      <div className="weather-item">
        <span className="weather-label">Wind:</span>
        <span className="weather-value">{formatValue(latest.windspeed, 'km/h')}</span>
      </div>
      <div className="weather-separator">|</div>
      <div className="weather-item">
        <span className="weather-label">Clouds:</span>
        <span className="weather-value">{formatValue(latest.cloudcover, '%')}</span>
      </div>
      <div className="weather-separator">|</div>
      <div className="weather-item">
        <span className="weather-label">GHI:</span>
        <span className="weather-value">{formatValue(latest.ghi, 'W/m²')}</span>
      </div>
      <div className="weather-separator">|</div>
      <div className="weather-item">
        <span className="weather-label">Next 2h GHI:</span>
        <span className="weather-value">{formatNextTwoHourGhi(latest.ghi_next_two_hours)}</span>
      </div>
      {/* Shortwave removed */}
    </>
  )

  return (
    <div className="weather-banner">
      <div className="weather-banner-content content1">
        <Row />
      </div>
      <div className="weather-banner-content content2">
        <Row />
      </div>
      <div className="weather-banner-content content3">
        <Row />
      </div>
    </div>
  )
}

export default WeatherBanner

