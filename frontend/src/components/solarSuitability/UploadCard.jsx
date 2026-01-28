import testKml from '../../assets/test.kml'

export default function UploadCard() {
  return (
    <div className="w-full max-w-md flex flex-col gap-4">
      {/* Glassmorphism Card for Upload Controls - Now Floating over Global Map */}
      <div className="bg-[#0f172a]/80 backdrop-blur-md p-8 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.2)] border border-cyan-500/30 text-center relative overflow-hidden group hover:bg-[#0f172a]/90 transition-all duration-300">
        
        {/* Decorative background glow */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-cyan-500/5 to-blue-500/5 pointer-events-none" />
        
        <div className="relative z-10">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="bg-cyan-500/20 text-cyan-400 p-3 rounded-full shadow-lg shadow-cyan-500/20 border border-cyan-500/30">
                <i data-lucide="map-pin" className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-white drop-shadow-sm tracking-wide">Define Your Site</h2>
            </div>
            <p className="text-slate-300 mb-6 text-sm font-medium">
              Upload a KML file to analyze solar potential.
            </p>

            <div
              id="upload-area"
              className="flex flex-col items-center gap-4"
            >
              <input type="file" id="kml-upload" className="hidden" accept=".kml" />
              <button
                id="upload-btn"
                className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold px-8 py-3 rounded-xl hover:shadow-lg hover:shadow-cyan-500/40 hover:scale-105 transition-all active:scale-95 flex items-center gap-2 w-full justify-center border border-cyan-400/20"
              >
                <i data-lucide="upload-cloud" className="w-5 h-5" />
                Upload KML File
              </button>
              <p className="text-slate-400 text-xs font-semibold bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700">Max size: 5MB</p>
            </div>
            <p
              id="file-name"
              className="text-white mt-4 text-sm font-semibold hidden flex items-center justify-center gap-2 bg-green-900/40 px-4 py-2 rounded-lg border border-green-500/30"
            >
              <i data-lucide="file-check-2" className="w-4 h-4 text-green-400" />
              <span />
            </p>
        </div>
      </div>

      {/* Land Ownership Card */}
      <div className="bg-[#0f172a]/80 backdrop-blur-md p-6 rounded-2xl shadow-lg border border-cyan-500/30">
        <label htmlFor="land-ownership" className="block text-sm font-bold text-slate-300 mb-2 flex items-center gap-2">
          <i data-lucide="landmark" className="w-4 h-4 text-cyan-400" />
          Land Ownership
        </label>
        <select
          id="land-ownership"
          name="land-ownership"
          className="w-full p-3 border border-slate-700 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:outline-none transition bg-slate-900/80 font-medium text-white shadow-sm"
        >
          <option value="1">Government / Barren</option>
          <option value="2">Private</option>
        </select>
      </div>
    </div>
  );
}
