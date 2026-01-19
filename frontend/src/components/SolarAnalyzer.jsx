import Header from "./Header";
import UploadCard from "./UploadCard";
import MapOptionsCard from "./MapOptionsCard";
import ResultsSection from "./ResultsSection";
import ComparePanel from "./ComparePanel";
import ControlPanel from "./ControlPanel";

import "../styles/global.css";
import "../styles/App.css";

export default function SolarAnalyzer() {
  return (
    <>
      <Header />

      <div className="container">
        <UploadCard />
        <MapOptionsCard />
        <ResultsSection />

        {/* Optional panels */}
        <ComparePanel />
        <ControlPanel />
      </div>
    </>
  );
}
