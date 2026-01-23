import React, { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const CombinedGraph = ({ dataByParameter, onClose, style }) => {
  const [timeFrame, setTimeFrame] = useState('Daily') // Daily, Weekly, Monthly, Yearly

  // Parameters to include in the combined graph
  const INCLUDED_PARAMS = [
    { key: 'NDVI', label: 'Growth Index', color: '#4ade80' }, // Green
    { key: 'LST', label: 'Stress Index', color: '#ef4444' }, // Red
    { key: 'NDWI', label: 'Water Index', color: '#3b82f6' }, // Blue
    { key: 'VISIBLE', label: 'Moisture Index', color: '#f59e0b' }, // Amber/Orange
  ]

  // Helper to format date based on timeframe
  const formatDate = (dateStr, frame) => {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    
    if (frame === 'Daily') {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } else if (frame === 'Weekly') {
      // Return start of week (Sunday)
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
      const monday = new Date(d.setDate(diff))
      return `W${Math.ceil(monday.getDate() / 7)} ${monday.toLocaleDateString('en-US', { month: 'short' })}`
    } else if (frame === 'Monthly') {
      return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    } else if (frame === 'Yearly') {
      return d.getFullYear().toString()
    }
    return dateStr
  }

  // Process data
  const processedData = useMemo(() => {
    // 1. Collect all unique dates
    const allDates = new Set()
    INCLUDED_PARAMS.forEach(param => {
      const ts = dataByParameter[param.key]?.timeseries || []
      ts.forEach(item => allDates.add(item.date))
    })

    // 2. Create unified data points
    let rawData = Array.from(allDates).sort().map(date => {
      const point = { date, originalDate: date }
      INCLUDED_PARAMS.forEach(param => {
        const ts = dataByParameter[param.key]?.timeseries || []
        const entry = ts.find(t => t.date === date)
        if (entry) {
            point[param.label] = Number(entry.value)
        }
      })
      return point
    })

    // 3. Aggregate based on timeFrame
    if (timeFrame === 'Daily') {
        return rawData
    }

    const groups = {}
    rawData.forEach(item => {
        let key = item.originalDate // fallback
        const d = new Date(item.originalDate)
        
        if (timeFrame === 'Weekly') {
             // ISO Week or simple week bucket
             const onejan = new Date(d.getFullYear(), 0, 1)
             const week = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7)
             key = `${d.getFullYear()}-W${week}`
        } else if (timeFrame === 'Monthly') {
            key = `${d.getFullYear()}-${d.getMonth()}`
        } else if (timeFrame === 'Yearly') {
            key = `${d.getFullYear()}`
        }

        if (!groups[key]) {
            groups[key] = { count: 0, sums: {}, date: item.originalDate } // use first date as representative
            INCLUDED_PARAMS.forEach(p => groups[key].sums[p.label] = 0)
            groups[key].counts = {}
            INCLUDED_PARAMS.forEach(p => groups[key].counts[p.label] = 0)
        }
        
        INCLUDED_PARAMS.forEach(p => {
            if (item[p.label] !== undefined && !isNaN(item[p.label])) {
                groups[key].sums[p.label] += item[p.label]
                groups[key].counts[p.label] += 1
            }
        })
    })

    return Object.values(groups).map(g => {
        const point = { date: g.date } // Keep original date format for sorting/display logic if needed, or reformat
        // Better to format date for display here
        point.displayDate = formatDate(g.date, timeFrame)
        
        INCLUDED_PARAMS.forEach(p => {
            if (g.counts[p.label] > 0) {
                point[p.label] = g.sums[p.label] / g.counts[p.label]
            }
        })
        return point
    }).sort((a, b) => new Date(a.date) - new Date(b.date))

  }, [dataByParameter, timeFrame])

  // Custom Tick Formatter
  const tickFormatter = (value) => {
      // If processedData already has displayDate, use it? 
      // Recharts passes the 'date' field value. 
      // If we used rawData, it's YYYY-MM-DD.
      // If we used aggregated data, we might want to use the formatted version.
      // Let's rely on the formatting function inside render if possible, or pre-format.
      // In aggregated, we attached displayDate. In Daily, we didn't.
      
      if (timeFrame !== 'Daily') return value // We'll map dataKey to displayDate
      return formatDate(value, 'Daily')
  }

  // For aggregated data, we need to make sure XAxis uses the display label
  const chartData = processedData.map(d => ({
      ...d,
      dateAxis: timeFrame === 'Daily' ? d.date : d.displayDate
  }))

  return (
    <div className="parameter-block combined-graph-block" style={{ ...style, width: '100%', maxWidth: '100%' }}>
      <div className="parameter-block-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
             <h4>Field Indices Analysis</h4>
             <div className="time-toggles" style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.1)', padding: '2px', borderRadius: '4px' }}>
                {['Daily', 'Weekly', 'Monthly', 'Yearly'].map(tf => (
                    <button 
                        key={tf}
                        onClick={() => setTimeFrame(tf)}
                        style={{
                            background: timeFrame === tf ? '#3b82f6' : 'transparent',
                            color: timeFrame === tf ? '#fff' : 'rgba(255,255,255,0.7)',
                            border: 'none',
                            borderRadius: '3px',
                            padding: '2px 8px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        {tf}
                    </button>
                ))}
             </div>
        </div>
        <button className="block-close-button" onClick={() => onClose('COMBINED')} title="Remove block">
          <span style={{ fontSize: '18px', lineHeight: 1 }}>×</span>
        </button>
      </div>
      
      <div className="parameter-divider"></div>
      
      <div className="parameter-block-body" style={{ height: '300px' }}>
         {processedData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" vertical={false} />
                <XAxis
                  dataKey="dateAxis"
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={30}
                  tickFormatter={(val) => val} 
                />
                <YAxis
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={35}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
                  itemStyle={{ color: '#fff' }}
                  labelStyle={{ color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                
                {INCLUDED_PARAMS.map(param => (
                    <Line
                        key={param.key}
                        type="monotone"
                        dataKey={param.label}
                        stroke={param.color}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                        connectNulls={true}
                        animationDuration={1000}
                    />
                ))}
              </LineChart>
            </ResponsiveContainer>
         ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.3)', fontSize: '13px', fontStyle: 'italic' }}>
                No combined data available
            </div>
         )}
      </div>
    </div>
  )
}

export default CombinedGraph
