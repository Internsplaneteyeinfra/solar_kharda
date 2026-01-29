export default function SlopePanel() {
  return (
    <div
  id="slope-panel"
  className="absolute top-2 left-2 z-30 pointer-events-auto
  bg-slate-900/10 backdrop-blur-[1px]
  rounded-xl border border-cyan-300/10
  shadow-[0_0_3px_rgba(6,182,212,0.25)]
  p-4 min-w-[0px]
  transition-all duration-300 hidden"
>

      <div className="flex flex-col gap-4 w-full">

        {/* SLOPE */}
       <div
  className="w-full max-w-[130px] aspect-square
             bg-gradient-to-br from-slate-900/95 to-cyan-950/40
             backdrop-blur-lg rounded-xl
             border border-cyan-500/30 shadow-lg
             p-3 flex flex-col items-center justify-between text-center"
>


          <div className="flex flex-col items-center gap-2 text-center">

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center 
                              bg-cyan-500/20 text-cyan-400">
                <i data-lucide="mountain" className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-cyan-400 text-xs font-semibold uppercase">Slope</h3>
                <p className="text-slate-400 text-[10px]">Terrain steepness</p>
              </div>
            </div>
            <div className="text-right">
              <div id="slope-value" className="text-lg font-bold text-white font-mono">--</div>
              <div className="text-[10px] text-slate-400">
                Score: <span id="slope-score" className="font-bold">--</span>
              </div>
            </div>
          </div>
        </div>

        {/* ELEVATION */}
     <div
  className="w-full max-w-[130px] aspect-square
             bg-gradient-to-br from-slate-900/95 to-cyan-950/40
             backdrop-blur-lg rounded-xl
             border border-cyan-500/30 shadow-lg
             p-3 flex flex-col items-center justify-between text-center"
>

         <div className="flex flex-col items-center gap-2 text-center">

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center 
                              bg-cyan-500/20 text-cyan-400">
                <i data-lucide="arrow-up-from-line" className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-cyan-400 text-xs font-semibold uppercase">Elevation</h3>
                <p className="text-slate-400 text-[10px]">Height above sea</p>
              </div>
            </div>
            <div className="text-right">
              <div id="elevation-value" className="text-lg font-bold text-white font-mono">--</div>
              <div className="text-[10px] text-slate-400">
                Score: <span id="elevation-score" className="font-bold">--</span>
              </div>
            </div>
          </div>
        </div>

        {/* SOIL STABILITY */}
<div
  className="w-full max-w-[130px] aspect-square
             bg-gradient-to-br from-slate-900/95 to-cyan-950/40
             backdrop-blur-lg rounded-xl
             border border-cyan-500/30 shadow-lg
             p-3 flex flex-col items-center justify-between text-center"
>

          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center 
                              bg-cyan-500/20 text-cyan-400 ">
                <i data-lucide="layers" className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-cyan-400 text-xs font-semibold uppercase">Soil Stability</h3>
                <p className="text-slate-400 text-[10px]">Foundation depth</p>
              </div>
            </div>
            <div className="text-right">
              <div id="soil-value" className="text-lg font-bold text-white font-mono">--</div>
              <div className="text-[10px] text-slate-400">
                Score: <span id="soil-score" className="font-bold">--</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
