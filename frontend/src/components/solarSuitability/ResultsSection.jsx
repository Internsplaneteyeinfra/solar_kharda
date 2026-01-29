export default function ResultsSection() {
  return (
    <div id="results-section" className="w-full transition-all duration-500 hidden">
      {/* Loading State */}
      <div id="loader" className="hidden bg-[#0f172a]/90 backdrop-blur-md p-6 rounded-xl border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)] mb-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400 h-12 w-12 mr-4 shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
          <div className="text-left">
            <h3 className="text-lg font-semibold text-cyan-50">Analyzing Site...</h3>
            <p className="text-slate-400 text-sm mt-1">Fetching satellite data...</p>
          </div>
        </div>
        <div id="progress-container" className="w-full mt-4 mx-auto hidden">
          <div className="flex justify-between text-xs text-cyan-400 mb-2 font-mono">
            <span id="progress-text">Processing...</span>
            <span id="progress-percentage">0%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 border border-slate-700">
            <div id="progress-bar" className="bg-cyan-500 h-1.5 rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
          </div>
        </div>
      </div>

      {/* Error Message */}
      <div id="error-message" className="hidden bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-lg backdrop-blur-sm mb-6" role="alert">
        <div className="flex items-center gap-2 mb-1 text-red-400">
            <i data-lucide="alert-circle" className="w-5 h-5" />
            <span className="font-bold uppercase tracking-wider text-xs">Analysis Failed</span>
        </div>
        <p id="error-text" className="text-sm opacity-90">Error text will be inserted here.</p>
      </div>

      <div id="results-content" className="space-y-4">
        {/* Score & Rec Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#0f172a]/90 backdrop-blur-md p-5 rounded-xl border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <h3 className="text-cyan-400 text-xs font-semibold tracking-wider uppercase mb-2 border-l-2 border-cyan-500 pl-2">Final Weighted Score</h3>
            <div className="flex items-end gap-2">
                <p id="final-score" className="text-6xl font-bold text-white tracking-tighter shadow-cyan-500/50 drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]">--</p>
                <p className="text-slate-400 text-sm mb-2 font-mono">/ 10</p>
            </div>
          </div>
          
          <div className="bg-[#0f172a]/90 backdrop-blur-md p-5 rounded-xl border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <h3 className="text-cyan-400 text-xs font-semibold tracking-wider uppercase mb-2 border-l-2 border-cyan-500 pl-2">Recommendation</h3>
            <p id="decision-result" className="text-xl font-bold text-white flex items-center gap-3">--</p>
          </div>
        </div>

        {/* Solar & Climatic Parameters - Grid Layout */}
        <div className="bg-gradient-to-br from-slate-900/95 to-cyan-950/40 backdrop-blur-lg rounded-xl border border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.25)]">
            <div className="p-4 border-b border-cyan-500/20">
            <h3 className="text-cyan-400 text-xs font-semibold tracking-wider uppercase">Solar & Climatic Parameters</h3>
           
          </div>
          <div id="solar-parameters-grid" className="p-4 grid grid-cols-2 gap-3">
             <div className="text-center text-slate-500 italic p-2">Waiting for analysis...</div>
          </div>
        </div>

        {/* Land Use & Ownership Table - Moved to LandUsePanel */}

        {/* Slope - Single Parameter Display (Moved to SlopePanel on Map) */}
        
        {/* Site & Terrain Parameters Table */}
        <div className="bg-[#0f172a]/90 backdrop-blur-md rounded-xl border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
          <div className="p-5 border-b border-cyan-500/30">
            <h3 className="text-cyan-400 text-xs font-semibold tracking-wider uppercase">Site & Terrain Parameters</h3>
            <p className="text-slate-400 text-[10px] mt-1">Topography, land use, and infrastructure.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/50 text-cyan-400 uppercase font-medium">
                <tr>
                  <th className="px-6 py-3 tracking-wider border-b border-slate-700/50">Parameter</th>
                  <th className="px-6 py-3 tracking-wider border-b border-slate-700/50">Raw Value</th>
                  <th className="px-6 py-3 tracking-wider border-b border-slate-700/50">Score (1-10)</th>
                </tr>
              </thead>
              <tbody id="decision-matrix-body" className="divide-y divide-slate-700/50">
                <tr>
                  <td colSpan="3" className="p-6 text-center text-slate-500 italic">
                    Waiting for analysis...
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Map Section */}
        <div id="map-section" className="bg-[#0f172a]/90 backdrop-blur-md rounded-xl border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)] hidden">
          <div className="p-4 border-b border-cyan-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-green-500/20 text-green-400 p-1.5 rounded-full">
                  <i data-lucide="map" className="w-4 h-4" />
                </div>
                <h3 className="text-cyan-400 text-xs font-semibold tracking-wider uppercase">Suitability Map</h3>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:text-cyan-400 transition-colors">
                  <input type="checkbox" id="toggle-kml-layer" className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/50" defaultChecked />
                  <span>Boundaries</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:text-cyan-400 transition-colors">
                  <input type="checkbox" id="toggle-score-layer" className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/50" defaultChecked />
                  <span>Scores</span>
                </label>
              </div>
            </div>
          </div>
          <div className="relative">
            {/* Improvement Suggestions Overlay */}
            <div id="suggestions-container" className="absolute top-64 right-4 z-[9999] w-72 bg-[#0f172a] border-2 border-cyan-500/50 p-4 rounded-xl shadow-2xl max-h-[350px] overflow-y-auto hidden">
                <div className="flex items-center gap-2 mb-3 border-b border-cyan-500/20 pb-2 sticky top-0 bg-[#0f172a]/95 -mx-1 px-1">
                <div className="bg-green-500/20 text-green-400 p-1.5 rounded-full">
                    <i data-lucide="lightbulb" className="w-4 h-4" />
                </div>
                <h3 className="text-cyan-400 text-xs font-semibold tracking-wider uppercase">Suggestions</h3>
                </div>
                <ul id="suggestions-list" className="space-y-3 text-sm">
                <li className="flex items-start gap-2 text-slate-400 italic">
                    <i data-lucide="info" className="w-4 h-4 text-cyan-500 mt-0.5 flex-shrink-0" />
                    <span>Suggestions will appear here based on the analysis.</span>
                </li>
                </ul>
            </div>

             {/* Map Legend */}
            <div id="map-legend" className="absolute top-4 right-4 bg-[#0f172a]/90 backdrop-blur-md p-3 rounded-lg border border-cyan-500/30 z-10 max-w-48 shadow-lg">
                <div className="space-y-2">
                  <div className="border-b border-slate-700/50 pb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 border border-cyan-500 border-dashed bg-cyan-500/20" />
                      <span className="text-[10px] font-medium text-slate-300">Boundaries</span>
                    </div>
                  </div>
  
                  <div>
                    <p className="text-[10px] font-medium text-slate-400 mb-1">Suitability</p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded-sm" />
                        <span className="text-[10px] text-slate-300">8-10 (High)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-yellow-500 rounded-sm" />
                        <span className="text-[10px] text-slate-300">5-7 (Med)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-orange-500 rounded-sm" />
                        <span className="text-[10px] text-slate-300">3-4 (Low)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500 rounded-sm" />
                        <span className="text-[10px] text-slate-300">1-2 (Poor)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            <div id="map" className="h-[550px] w-full rounded-b-xl grayscale-[0.3]" />
            

          </div>
        </div>
      </div>
    </div>
  );
}