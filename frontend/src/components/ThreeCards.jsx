import React, { useState} from "react"
import { useNavigate } from "react-router-dom"
import "./ThreeCards.css"

import bgvideo from "../assets/videos/solar-video.mp4"
import suitability from "../assets/images/solar-suitability.jpg"
import analyzer from "../assets/images/analyzer.jpg"


const ThreeCards = () => {
  const navigate = useNavigate() 
  const [hoverBg, setHoverBg] = useState(null)
  const [videoReady, setVideoReady] = useState(false);

  return (
    
  <div className="cards-page">
    {/* Background video */}
    <video
      className="bg-video"
      autoPlay
      loop
      muted
      playsInline
      onCanPlay={() => setVideoReady(true)}
    >
      <source src={bgvideo} type="video/mp4" />
    </video>
     
    {/* Hover image overlay (only when hovering) */}
    {hoverBg && (
      <div
        className="hover-bg"
        style={{ backgroundImage: `url(${hoverBg})` }}
      />
    )}

    {/* Page Content */}
    <h2>Welcome to Solar Analytics</h2>

    <div className={`cards-container ${videoReady ? 'show' : 'hide'}`}>
      <div
        className="card"
        onMouseEnter={() => setHoverBg(suitability)}
        onMouseLeave={() => setHoverBg(null)}
        onClick={() => navigate("/solar-suitability")}
      >
        Solar Suitability
      </div>

      <div
        className="card"
        onMouseEnter={() => setHoverBg(analyzer)}
        onMouseLeave={() => setHoverBg(null)}
        onClick={() => navigate("/solar-analyzer")}
      >
        Solar Analyzer
      </div>

      <div className="card disabled">
        Coming Soon
      </div>
    </div>
  </div>
)
}
export default ThreeCards
