export default function RiskPanel() {
  return (
    <div
  id="risk-panel"
  className="absolute right-0 translate-x-[90px]
             h-[220px] w-[225px]
             bg-[#0f172a]/90 backdrop-blur-md
             rounded-xl border border-cyan-500/30
             shadow-[0_0_15px_rgba(6,182,212,0.15)]
             p-3 flex flex-col"
>

    
      <div className="flex items-center gap-2 mb-4 border-b border-cyan-500/30 pb-2">
        <div className="bg-red-500/20 text-red-400 p-1.5 rounded-lg">
             <i data-lucide="alert-triangle" className="w-4 h-4" />
        </div>
        <h3 className="text-cyan-400 text-xs font-semibold tracking-wider uppercase">Risk Analysis</h3>
      </div>

      <div className="flex-1 flex flex-col gap-4">
        {/* SEISMIC RISK */}
        <div className="flex items-center justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
            <div className="flex items-center gap-3">
                <div className="bg-cyan-500/20 text-cyan-400 p-2 rounded-lg">
                    <i data-lucide="activity" className="w-5 h-5" />
                </div>
                <div>
                    <h4 className="text-cyan-400 text-[10px] font-semibold uppercase tracking-wider">Seismic</h4>
                    <div className="text-[10px] text-slate-400">Score: <span id="seismic-score" className="font-bold text-cyan-400">--</span></div>
                </div>
            </div>
            <div id="seismic-value" className="text-lg font-bold text-white font-mono">--</div>
        </div>

        {/* FLOOD RISK */}
        <div className="flex items-center justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
            <div className="flex items-center gap-3">
                <div className="bg-blue-500/20 text-blue-400 p-2 rounded-lg">
                    <i data-lucide="waves" className="w-5 h-5" />
                </div>
                <div>
                    <h4 className="text-blue-400 text-[10px] font-semibold uppercase tracking-wider">Flood</h4>
                    <div className="text-[10px] text-slate-400">Score: <span id="flood-score" className="font-bold text-blue-400">--</span></div>
                </div>
            </div>
            <div id="flood-value" className="text-lg font-bold text-white font-mono">--</div>
        </div>
      </div>
    </div>
  );
}