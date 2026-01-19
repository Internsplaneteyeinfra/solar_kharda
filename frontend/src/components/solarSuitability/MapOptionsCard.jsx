export default function MapOptionsCard() {
  return (
    <div className="w-full lg:flex-1 bg-white p-6 sm:p-8 rounded-xl shadow-md border border-slate-200">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-teal-100 text-teal-600 p-2 rounded-full">
          <i data-lucide="settings" />
        </div>
        <h2 className="text-2xl font-semibold text-slate-800">map options</h2>
      </div>
      <p className="text-slate-500 map-options-note">
        Use the controls to choose satellite or street-view mode after analysis. You can upload a KML on the left to
        begin.
      </p>
    </div>
  );
}
