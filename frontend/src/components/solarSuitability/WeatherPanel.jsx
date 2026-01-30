import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { CloudSun, Wind, Droplets, Thermometer, Loader2, Sun } from 'lucide-react';

const API_BASE = 'http://localhost:8000';

export default function WeatherPanel({ coords }) {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        let url = `${API_BASE}/api/weather`;
        if (coords) {
          url += `?lat=${coords.lat}&lon=${coords.lon}`;
        }
        const response = await axios.get(url);
        setWeather(response.data);
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch weather:', err);
        setError('Failed to load weather data');
        setLoading(false);
      }
    };

    // If coords changed, we might want to show loading state again
    if (coords) {
        setLoading(true);
    }
    
    fetchWeather();
    // Refresh every 10 minutes
    const interval = setInterval(fetchWeather, 600000);
    return () => clearInterval(interval);
  }, [coords]);

  if (loading) {
    return (
      <div className="w-full bg-[#0f172a]/80 backdrop-blur-md border border-cyan-500/30 p-6 rounded-xl text-white shadow-[0_0_15px_rgba(6,182,212,0.15)] flex justify-center items-center min-h-[200px]">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="w-full bg-[#0f172a]/80 backdrop-blur-md border border-red-500/30 p-4 rounded-xl text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.15)]">
        <p className="text-xs text-center">{error || 'Weather unavailable'}</p>
      </div>
    );
  }

  const { latest, hourly, forecast } = weather;
  
  // Helper to get icon
  const getWeatherIcon = (code) => {
      if (code === null || code === undefined) return <Cloud className="w-3.5 h-3.5 text-slate-500" />;
      if (code <= 1) return <Sun className="w-3.5 h-3.5 text-yellow-400" />;
      if (code <= 3) return <CloudSun className="w-3.5 h-3.5 text-slate-300" />;
      if (code <= 48) return <CloudFog className="w-3.5 h-3.5 text-slate-400" />;
      if (code <= 67) return <CloudRain className="w-3.5 h-3.5 text-blue-400" />;
      if (code <= 77) return <CloudSnow className="w-3.5 h-3.5 text-white" />;
      if (code <= 82) return <CloudRain className="w-3.5 h-3.5 text-blue-500" />;
      if (code <= 86) return <CloudSnow className="w-3.5 h-3.5 text-white" />;
      if (code <= 99) return <CloudLightning className="w-3.5 h-3.5 text-yellow-600" />;
      return <Cloud className="w-3.5 h-3.5 text-slate-500" />;
  };

  // Filter forecast to next 5 days
  const todayStr = new Date().toISOString().split('T')[0];
  const futureForecast = forecast ? forecast.filter(d => d.date > todayStr).slice(0, 5) : [];
  
  // Format Date
  const dateObj = new Date(latest.date || new Date());
  const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // Format Wind (km/h to m/s)
  const windSpeedMs = latest.windspeed ? (latest.windspeed / 3.6).toFixed(1) : '0.0';

  // Prepare Chart Data (Next 12 hours)
  // Hourly data might contain 48-72 hours. We want a slice around current time.
  // Ideally, find index of current time, then take next 12.
  // For simplicity, we'll take the first 12 entries available or mock if empty.
  const chartData = hourly && hourly.temperature_2m ? hourly.temperature_2m.slice(0, 12) : [];
  // Normalize for chart height (simple min-max scaling)
  const minTemp = Math.min(...(chartData.length ? chartData : [0]));
  const maxTemp = Math.max(...(chartData.length ? chartData : [100]));
  const range = maxTemp - minTemp || 1;

  return (
    <div className="space-y-2 w-full">
      {/* Weather Main Card */}
      <div className="bg-[#0f172a]/80 backdrop-blur-md border border-cyan-500/30 p-3 rounded-xl text-white shadow-[0_0_15px_rgba(6,182,212,0.15)]">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h2 className="text-cyan-400 text-xs font-semibold tracking-wider uppercase mb-0.5">
              Current Weather {coords ? '(Site)' : ''}
            </h2>
            <p className="text-[10px] text-slate-400">{dateStr}</p>
          </div>
          <CloudSun className="text-yellow-400 w-6 h-6" />
        </div>
        
        <div className="flex items-center gap-3 mb-3">
          <div className="text-3xl font-bold text-white tracking-tighter">
            {latest.temp_current}<span className="text-lg text-cyan-400">°C</span>
          </div>
          <div className="space-y-0.5 text-[10px] text-slate-300">
            <div className="flex items-center gap-1.5">
              <Wind className="w-3 h-3 text-slate-400" />
              <span>{windSpeedMs} m/s</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Droplets className="w-3 h-3 text-slate-400" />
              <span>RH {latest.humidity}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Sun className="w-3 h-3 text-slate-400" />
              <span>{latest.ghi ?? '--'} W/m²</span>
            </div>
          </div>
        </div>

        {/* Warning Badge (Conditional) */}
        {latest.temp_current > 35 && (
          <div className="bg-orange-500/20 border border-orange-500/50 rounded p-1.5 flex items-center gap-2 mb-3">
            <span className="bg-orange-500 text-white text-[9px] px-1 rounded font-bold">ALERT</span>
            <span className="text-orange-200 text-[10px]">High Temperature Warning</span>
          </div>
        )}

        {/* Mini Chart */}
        <div className="border-t border-slate-700/50 pt-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] text-slate-400">Temp Trend (12h)</span>
            <span className="text-[10px] text-slate-400">°C</span>
          </div>
          <div className="h-16 w-full flex items-end justify-between gap-1 px-1">
             {chartData.map((temp, i) => {
               // Calculate height percentage
               const heightPercent = 20 + ((temp - minTemp) / range) * 80; // Min 20% height
               return (
                 <div key={i} className="w-full bg-gradient-to-t from-cyan-500/20 to-cyan-400/60 rounded-t-sm relative group" style={{ height: `${heightPercent}%` }}>
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-900 text-[8px] px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-slate-700 pointer-events-none">
                        {temp}°
                    </div>
                 </div>
               );
             })}
          </div>
          <div className="flex justify-between mt-1 text-[9px] text-slate-500">
             <span>Now</span>
             <span>+6h</span>
             <span>+12h</span>
          </div>
        </div>
      </div>

      {/* Forecast Card */}
      <div className="bg-[#0f172a]/80 backdrop-blur-md border border-cyan-500/30 p-3 rounded-xl text-white shadow-[0_0_15px_rgba(6,182,212,0.15)]">
         <div className="flex justify-between items-center mb-2">
            <h3 className="text-cyan-400 text-[10px] font-semibold tracking-wider uppercase border-l-2 border-cyan-500 pl-2">5-Day Forecast</h3>
         </div>
         <div className="flex justify-between items-center">
            {futureForecast.length > 0 ? (
                futureForecast.map((day, i) => {
                    const date = new Date(day.date);
                    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                    return (
                        <div key={i} className="flex flex-col items-center gap-0.5">
                            <span className="text-[9px] text-slate-400">{dayName}</span>
                            {getWeatherIcon(day.weather_code)}
                            <div className="flex gap-1 text-[10px] font-medium text-slate-300">
                                <span>{Math.round(day.max_temp)}°</span>
                                <span className="text-slate-500 text-[8px]">{Math.round(day.min_temp)}°</span>
                            </div>
                        </div>
                    );
                })
            ) : (
                <div className="w-full text-center py-2">
                    <span className="text-[9px] text-slate-500 italic">Forecast data unavailable</span>
                </div>
            )}
         </div>
      </div>
    </div>
  );
}
