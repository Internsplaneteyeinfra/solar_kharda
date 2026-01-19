import sys
import os
import json
from pathlib import Path

import ee
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.common.gee import init_gee
from app.kharda.routes import router as kharda_router


def init_solar_gee():
    try:
        base_dir = Path(__file__).resolve().parent.parent / "solar-backend-python"
        credentials_path = base_dir / "credentials.json"
        if not credentials_path.exists():
            print(f"Solar GEE credentials.json not found at {credentials_path}")
            return

        with open(credentials_path) as f:
            credentials = json.load(f)

        auth = ee.ServiceAccountCredentials(
            email=credentials["client_email"],
            key_data=json.dumps(credentials),
        )
        ee.Initialize(auth, project=credentials.get("project_id"))
        print("Solar GEE initialized successfully using Service Account.")
    except Exception as e:
        print(f"Solar GEE initialization error: {e}")


init_gee()

app = FastAPI(title="Solar Farm Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(kharda_router, tags=["Kharda Solar Farm"])

solar_backend_dir = Path(__file__).resolve().parent.parent / "solar-backend-python"
if solar_backend_dir.exists():
    if str(solar_backend_dir) not in sys.path:
        sys.path.insert(0, str(solar_backend_dir))
    init_solar_gee()
    try:
        from routes.analyze import router as solar_router

        app.include_router(
            solar_router, prefix="/api/analyze", tags=["Solar Suitability"]
        )
    except Exception as e:
        print(f"Warning: Failed to load solar backend routes: {e}")


@app.get("/")
def read_root():
    return {"message": "Kharda Solar Farm Backend API is running"}
