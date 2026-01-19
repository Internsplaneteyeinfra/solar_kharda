import dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.common.gee import init_gee
from app.kharda.routes import router as kharda_router
#from app.solar.routes import router as solar_router
 
try:
    from app.kharda.database import init_database
    DB_AVAILABLE = True
except ImportError:
    DB_AVAILABLE = False
    print("Warning: Database module not available.")

dotenv.load_dotenv()

app = FastAPI(title="Solar Farm Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_gee()

app.include_router(kharda_router)
app.include_router(solar_router)


@app.get("/")
async def root():
    return {"message": "Solar Farm Dashboard API", "database_available": DB_AVAILABLE}


@app.on_event("startup")
async def startup_event():
    if DB_AVAILABLE:
        try:
            init_database()
            print("Database initialized successfully")
        except Exception as e:
            print(f"Warning: Could not initialize database: {e}")

