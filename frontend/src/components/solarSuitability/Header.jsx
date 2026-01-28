export default function Header() {
  return (
    <header className="text-left p-2">
      <div className="flex items-center gap-2 mb-1">
          <div className="bg-gradient-to-br from-cyan-400 to-blue-600 p-1.5 rounded-lg shadow-lg shadow-cyan-500/20">
            <i data-lucide="sun" className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-white tracking-tight leading-tight">
            Solar Suitability <span className="text-cyan-400">Analyzer</span>
          </h1>
      </div>
      <p className="text-slate-400 text-xs leading-relaxed pl-1">
        Evaluate site potential for solar energy production.
      </p>
    </header>
  );
}
