import ee
import json
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from routes.analyze import router as suitability_router

# Define lifespan context manager for startup/shutdown events
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize GEE
    try:
        credentials_path = 'credentials.json'
        if not os.path.exists(credentials_path):
            print(f"Warning: {credentials_path} not found.")
        else:
            with open(credentials_path) as f:
                credentials = json.load(f)
            
            # Use ServiceAccountCredentials as requested
            auth = ee.ServiceAccountCredentials(
                email=credentials['client_email'], 
                key_data=json.dumps(credentials)
            )
            
            # Initialize with auth and project_id
            ee.Initialize(auth, project=credentials['project_id'])
            print("GEE Initialized successfully using Service Account.")
    except Exception as e:
        print(f"GEE Initialization Error: {e}")
    
    yield
    # Shutdown logic (if any) can go here

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include our converted routes
app.include_router(suitability_router, prefix="/api/analyze")

@app.get("/")
def home():
    return {"message": "Solar Suitability FastAPI is running"}

@app.get("/health")
def health():
    return {"status": "OK"}
