from pydantic import BaseModel
from typing import List, Optional, Any, Union

class Geometry(BaseModel):
    type: str
    coordinates: List[Any]

class AnalysisRequest(BaseModel):
    geometry: Geometry

class BatchAnalysisRequest(BaseModel):
    geometries: List[Geometry]