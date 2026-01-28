export default function ResultsSection() {
  return (
    <div id="results-section" className="w-full lg:flex-1 space-y-8 hidden">
      <div id="loader" className="hidden bg-white p-6 rounded-xl shadow-md border border-slate-200 mb-6">
        <div className="flex items-center justify-center">
          <div className="loader ease-linear rounded-full border-8 border-t-8 border-gray-200 h-16 w-16 mr-4" />
          <div className="text-center">
            <h3 className="text-xl font-semibold text-slate-700">Analyzing Your Site...</h3>
            <p className="text-slate-500 mt-1">Fetching satellite data and calculating parameters.</p>
          </div>
        </div>
        <div id="progress-container" className="w-full max-w-md mt-4 mx-auto hidden">
          <div className="flex justify-between text-sm text-slate-600 mb-2">
            <span id="progress-text">Processing areas...</span>
            <span id="progress-percentage">0%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div id="progress-bar" className="bg-blue-600 h-2 rounded-full transition-all duration-300" />
          </div>
        </div>
      </div>

      <div id="error-message" className="hidden bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg" role="alert">
        <p className="font-bold">Analysis Failed</p>
        <p id="error-text">Error text will be inserted here.</p>
      </div>

      <div id="results-content" className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 text-center">
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Final Weighted Score</h3>
            <p id="final-score" className="text-5xl font-bold text-slate-800 my-2">--</p>
            <p className="text-slate-500">out of 10</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 text-center">
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Recommendation</h3>
            <p id="decision-result" className="text-5xl font-bold text-slate-500 my-2 flex items-center justify-center gap-3">--</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md border border-slate-200">
          <div className="p-6 border-b border-slate-200">
            <h3 className="text-xl font-semibold text-slate-700">Decision Matrix Breakdown</h3>
            <p className="text-slate-500 mt-1">Detailed scoring for each suitability parameter.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Parameter</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Raw Value</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Score (1-10)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Weight</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Weighted Score</th>
                </tr>
              </thead>
              <tbody id="decision-matrix-body" className="bg-white divide-y divide-slate-200">
                <tr>
                  <td colSpan="5" className="p-6 text-center text-slate-500">
                    Upload a KML file to see the analysis.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-green-100 text-green-600 p-2 rounded-full">
              <i data-lucide="lightbulb" />
            </div>
            <h3 className="text-xl font-semibold text-slate-700">Improvement Suggestions</h3>
          </div>
          <ul id="suggestions-list" className="space-y-3">
            <li className="flex items-start gap-2 text-slate-600">
              <i data-lucide="info" className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <span>Suggestions will appear here based on the analysis.</span>
            </li>
          </ul>
        </div>

        <div id="kml-summary" className="bg-white rounded-xl shadow-md border border-slate-200 hidden">
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="bg-purple-100 text-purple-600 p-2 rounded-full">
                <i data-lucide="bar-chart-3" />
              </div>
              <h3 className="text-xl font-semibold text-slate-700">KML Analysis Summary</h3>
            </div>
            <p className="text-slate-500 mt-1">Overall statistics for all uploaded areas.</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-slate-800" id="total-areas">--</p>
                <p className="text-sm text-slate-500">Total Areas</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600" id="highest-score">--</p>
                <p className="text-sm text-slate-500">Highest Score</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600" id="lowest-score">--</p>
                <p className="text-sm text-slate-500">Lowest Score</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600" id="average-score">--</p>
                <p className="text-sm text-slate-500">Average Score</p>
              </div>
            </div>
          </div>
        </div>

        <div id="power-line-details" className="bg-blue-50 border border-blue-200 rounded-lg p-6 hidden">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-100 text-blue-600 p-2 rounded-full">
              <i data-lucide="zap" />
            </div>
            <h3 className="text-lg font-semibold text-blue-900">Power Line Information</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <i data-lucide="map-pin" className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">Aerial Distance</span>
              </div>
              <p id="aerial-distance" className="text-2xl font-bold text-blue-700">-- km</p>
              <p className="text-xs text-blue-600">Direct line distance</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <i data-lucide="route" className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">Road Distance</span>
              </div>
              <p id="road-distance" className="text-2xl font-bold text-blue-700">-- km</p>
              <p id="road-distance-note" className="text-xs text-blue-600">Via nearest roads</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <i data-lucide="activity" className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">Voltage Level</span>
              </div>
              <p id="voltage-level" className="text-2xl font-bold text-blue-700">--</p>
              <p className="text-xs text-blue-600">Nearest power line</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
