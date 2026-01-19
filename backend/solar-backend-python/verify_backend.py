import os
import sys
import json
import warnings
from fastapi.testclient import TestClient
from main import app

# Suppress DeprecationWarning
warnings.filterwarnings("ignore", category=DeprecationWarning)

# Ensure we are in the correct directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))

def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    print("Health check passed:", response.json())

def test_analyze_structure(client):
    # Mojave Desert, California (Solar rich area, Land)
    # 35.0 N, 115.0 W
    payload = {
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [-115.0, 35.0],
                [-115.0, 35.01],
                [-114.99, 35.01],
                [-114.99, 35.0],
                [-115.0, 35.0]
            ]]
        }
    }
    
    try:
        response = client.post("/api/analyze/", json=payload)
        print("Analyze Response Code:", response.status_code)
        if response.status_code == 200:
            data = response.json()
            print("Analyze Success!")
            with open('result.json', 'w') as f:
                json.dump(data, f, indent=2)
            print("Result saved to result.json")
        else:
            print("Analyze Error:", response.json())
    except Exception as e:
        print(f"Analyze Request Failed: {e}")

if __name__ == "__main__":
    print("Starting verification...")
    # Use context manager to trigger lifespan events
    with TestClient(app) as client:
        test_health(client)
        test_analyze_structure(client)
    print("Verification script finished.")
