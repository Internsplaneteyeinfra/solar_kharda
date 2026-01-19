
import testKml from '../assets/test.kml'

export default function UploadCard() {
  return (
    <div className="w-full lg:max-w-md bg-white p-6 sm:p-8 rounded-xl shadow-md border border-slate-200 sticky top-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-blue-100 text-blue-600 p-2 rounded-full">
          <i data-lucide="map-pin" />
        </div>
        <h2 className="text-2xl font-semibold text-slate-800">Define Your Site</h2>
      </div>
      <p className="text-slate-500 mb-6">
        Use a tool like Google Earth to create a KML file with a single polygon, then select the land ownership type below.
      </p>

      <div
        id="upload-area"
        className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-8 transition-all hover:border-blue-500 hover:bg-slate-50"
      >
        <input type="file" id="kml-upload" className="hidden" accept=".kml" />
        <div className="text-blue-500 mb-3">
          <i data-lucide="upload-cloud" className="w-12 h-12" />
        </div>
        <button
          id="upload-btn"
          className="w-full bg-blue-600 text-white font-semibold px-6 py-3 rounded-lg hover:bg-blue-700 transition-all shadow-sm active:scale-95"
        >
          Upload KML File
        </button>
        <p className="text-slate-500 text-xs mt-3">Maximum file size: 5MB</p>
      </div>
      <p
        id="file-name"
        className="text-slate-600 mt-4 text-sm font-medium hidden flex items-center gap-2"
      >
        <i data-lucide="file-check-2" className="w-5 h-5 text-green-500" />
        <span />
      </p>

      <div className="mt-6">
        <label htmlFor="land-ownership" className="block text-sm font-medium text-slate-700 mb-2">
          Land Ownership
        </label>
        <select
          id="land-ownership"
          name="land-ownership"
          className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition bg-white"
        >
          <option value="1">Government / Barren</option>
          <option value="2">Private</option>
        </select>
      </div>
    </div>
  );
}
