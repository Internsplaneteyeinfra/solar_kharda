export default function Header() {
  return (
    <header className="text-center mb-12">
      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight">
        Solar Suitability Analyzer
      </h1>
      <p className="text-slate-600 mt-3 max-w-2xl mx-auto text-lg">
        Upload a KML file and specify land ownership to evaluate a site&apos;s potential for solar energy production.
      </p>
    </header>
  );
}
