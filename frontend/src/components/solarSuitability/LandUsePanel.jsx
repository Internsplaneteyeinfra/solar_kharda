export default function LandUsePanel() {
  return (
   <div
      id="land-use-panel"
      className="bg-[#0f172a]/90 backdrop-blur-md rounded-xl border border-cyan-500/30
                 shadow-[0_0_20px_rgba(6,182,212,0.25)]
                 transition-all duration-500
                 w-fit min-w-full"
    >
      <div className="p-5 border-b border-cyan-500/30">
        <h3 className="text-cyan-400 text-xs font-semibold tracking-wider uppercase">Land Use & Ownership</h3>
        <p className="text-slate-400 text-[10px] mt-1">Property details and surface characteristics.</p>
      </div>

      <div>
        <table className="min-w-full text-left text-xs text-slate-300 whitespace-nowrap">
          <thead className="bg-slate-800/50 text-cyan-400 uppercase font-medium">
            <tr>
              <th className="px-6 py-3 tracking-wider border-b border-slate-700/50">Parameter</th>
              <th className="px-6 py-3 tracking-wider border-b border-slate-700/50">Raw Value</th>
              <th className="px-6 py-3 tracking-wider border-b border-slate-700/50">Score (1-10)</th>
            </tr>
          </thead>
          <tbody id="land-use-matrix-body" className="divide-y divide-slate-700/50">
            <tr>
              <td colSpan="3" className="p-6 text-center text-slate-500 italic">
                Waiting for analysis...
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
