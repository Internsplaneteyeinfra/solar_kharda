import React from 'react';
import { CloudSun, Wind, Droplets, Thermometer } from 'lucide-react';

export default function WeatherPanel() {
  return (
    <div className="space-y-2 w-full">
      {/* Weather Main Card */}
      <div className="bg-[#0f172a]/80 backdrop-blur-md border border-cyan-500/30 p-3 rounded-xl text-white shadow-[0_0_15px_rgba(6,182,212,0.15)]">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h2 className="text-cyan-400 text-xs font-semibold tracking-wider uppercase mb-0.5">Current Weather</h2>
            <p className="text-[10px] text-slate-400">Tuesday, May 21, 2025</p>
          </div>
          <CloudSun className="text-yellow-400 w-6 h-6" />
        </div>
        
        <div className="flex items-center gap-3 mb-3">
          <div className="text-3xl font-bold text-white tracking-tighter">
            28.6<span className="text-lg text-cyan-400">°C</span>
          </div>
          <div className="space-y-0.5 text-[10px] text-slate-300">
            <div className="flex items-center gap-1.5">
              <Wind className="w-3 h-3 text-slate-400" />
              <span>SW 1.5m/s</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Droplets className="w-3 h-3 text-slate-400" />
              <span>RH 29%</span>
            </div>
          </div>
        </div>

        <div className="bg-orange-500/20 border border-orange-500/50 rounded p-1.5 flex items-center gap-2 mb-3">
          <span className="bg-orange-500 text-white text-[9px] px-1 rounded font-bold">ALERT</span>
          <span className="text-orange-200 text-[10px]">High Temperature Warning</span>
        </div>

        {/* Mini Chart Placeholder */}
        <div className="border-t border-slate-700/50 pt-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] text-slate-400">Temp/°C</span>
            <span className="text-[10px] text-slate-400">Prec/mm</span>
          </div>
          <div className="h-16 w-full flex items-end justify-between gap-1 px-1">
             {[30, 45, 35, 60, 50, 70, 55, 40, 35, 50, 65, 60].map((h, i) => (
               <div key={i} className="w-full bg-gradient-to-t from-cyan-500/20 to-cyan-400/60 rounded-t-sm" style={{ height: `${h}%` }}></div>
             ))}
          </div>
          <div className="flex justify-between mt-1 text-[9px] text-slate-500">
             <span>14:00</span>
             <span>06:00</span>
             <span>13:00</span>
          </div>
        </div>
      </div>

      {/* Forecast Card */}
      <div className="bg-[#0f172a]/80 backdrop-blur-md border border-cyan-500/30 p-3 rounded-xl text-white shadow-[0_0_15px_rgba(6,182,212,0.15)]">
         <h3 className="text-cyan-400 text-[10px] font-semibold tracking-wider uppercase mb-2 border-l-2 border-cyan-500 pl-2">5-Day Forecast</h3>
         <div className="flex justify-between items-center">
            {['Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                    <span className="text-[9px] text-slate-400">{day}</span>
                    <CloudSun className="w-3.5 h-3.5 text-yellow-400/80" />
                    <span className="text-[10px] font-medium text-white">{30 + i}°</span>
                </div>
            ))}
         </div>
      </div>
    </div>
  );
}
