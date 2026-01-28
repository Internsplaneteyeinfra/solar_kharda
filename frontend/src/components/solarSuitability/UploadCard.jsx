import testKml from '../../assets/test.kml'

export default function UploadCard() {
  return (
    <div className="w-full max-w-md flex flex-col gap-4">
      {/* Glassmorphism Card for Upload Controls - Now Floating over Global Map */}
      <div className="bg-white/20 backdrop-blur-md p-8 rounded-2xl shadow-2xl border border-white/30 text-center relative overflow-hidden group hover:bg-white/30 transition-all duration-300">
        
        {/* Decorative background glow */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 pointer-events-none" />
        
        <div className="relative z-10">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="bg-blue-600 text-white p-3 rounded-full shadow-lg shadow-blue-500/30">
                <i data-lucide="map-pin" className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 drop-shadow-sm">Define Your Site</h2>
            </div>
            <p className="text-slate-700 mb-6 text-sm font-medium">
              Upload a KML file to analyze solar potential.
            </p>

            <div
              id="upload-area"
              className="flex flex-col items-center gap-4"
            >
              <input type="file" id="kml-upload" className="hidden" accept=".kml" />
              <button
                id="upload-btn"
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold px-8 py-3 rounded-xl hover:shadow-lg hover:shadow-blue-500/40 hover:scale-105 transition-all active:scale-95 flex items-center gap-2 w-full justify-center border border-white/20"
              >
                <i data-lucide="upload-cloud" className="w-5 h-5" />
                Upload KML File
              </button>
              <p className="text-slate-600 text-xs font-semibold bg-white/40 px-3 py-1 rounded-full">Max size: 5MB</p>
            </div>
            <p
              id="file-name"
              className="text-slate-800 mt-4 text-sm font-semibold hidden flex items-center justify-center gap-2 bg-green-100/80 px-4 py-2 rounded-lg border border-green-200"
            >
              <i data-lucide="file-check-2" className="w-4 h-4 text-green-600" />
              <span />
            </p>
        </div>
      </div>

      {/* Land Ownership Card */}
      <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-white/40">
        <label htmlFor="land-ownership" className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
          <i data-lucide="landmark" className="w-4 h-4 text-slate-500" />
          Land Ownership
        </label>
        <select
          id="land-ownership"
          name="land-ownership"
          className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition bg-white/90 font-medium text-slate-700 shadow-sm"
        >
          <option value="1">Government / Barren</option>
          <option value="2">Private</option>
        </select>
      </div>
      
      {/* Map Controls - Floating near the card */}
      <div className="flex gap-2 justify-center">
          <button
            id="street-view-toggle"
            className="bg-white/90 hover:bg-white text-slate-700 p-3 rounded-full shadow-lg border border-slate-200 transition-all hover:scale-110 active:scale-95"
            title="Toggle Street View Mode"
          >
            <i data-lucide="map" className="w-5 h-5" />
          </button>
          <button
            id="map-type-toggle"
            className="bg-white/90 hover:bg-white text-slate-700 p-3 rounded-full shadow-lg border border-slate-200 transition-all hover:scale-110 active:scale-95"
            title="Toggle Map Type"
          >
            <i data-lucide="layers" className="w-5 h-5" />
          </button>
      </div>
    </div>
  );
}
