import ee
from typing import Any, Dict

from gee.ee_script import performAnalysis as _perform_analysis_core


def performAnalysis(geometry_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Python equivalent of the Node.js performAnalysis function.

    This is a thin wrapper around gee.ee_script.performAnalysis so that
    the FastAPI backend structure matches:
      - routes/analyze.py
      - services/gee_service.py
      - main.py

    The core Google Earth Engine calculations (datasets, reducers, scales)
    are implemented in gee/ee_script.py and are kept 1:1 with:
      backend/gee/ee_script.js (Node.js)
    """
    # Delegates to the core implementation which mirrors Node.js logic.
    return _perform_analysis_core(geometry_dict)

