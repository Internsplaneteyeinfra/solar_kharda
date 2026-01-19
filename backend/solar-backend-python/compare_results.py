import requests
import json
import time
import sys

# Configuration
NODE_URL = "http://localhost:3007/api/analyze"
PYTHON_URL = "http://localhost:8000/api/analyze"

PAYLOAD = {
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

def call_api(name, url, payload):
    print(f"--- Calling {name} Backend ({url}) ---")
    try:
        start = time.time()
        resp = requests.post(url, json=payload, timeout=60)
        duration = time.time() - start
        print(f"  Status: {resp.status_code}")
        print(f"  Time: {duration:.2f}s")
        if resp.status_code == 200:
            return resp.json()
        else:
            print(f"  Error: {resp.text[:200]}") # Truncate error
            return None
    except Exception as e:
        print(f"  Failed: {e}")
        return None

def compare(node_data, python_data):
    if not node_data:
        print("\nNode.js data missing.")
    if not python_data:
        print("\nPython data missing.")
        
    if not node_data or not python_data:
        return

    print("\n--- Comparison (Node vs Python) ---")
    keys = set(node_data.keys()) | set(python_data.keys())
    
    # Sort keys for consistent output
    sorted_keys = sorted(list(keys))
    
    print(f"{'Key':<20} | {'Node.js':<15} | {'Python':<15} | {'Match'}")
    print("-" * 65)
    
    match_count = 0
    total_count = 0
    
    for k in sorted_keys:
        val_node = node_data.get(k, "N/A")
        val_py = python_data.get(k, "N/A")
        
        # Determine match
        is_match = False
        if isinstance(val_node, (int, float)) and isinstance(val_py, (int, float)):
            # Allow small tolerance
            if abs(val_node - val_py) < 0.01:
                is_match = True
        elif str(val_node) == str(val_py):
            is_match = True
            
        match_str = "✅" if is_match else "❌"
        if is_match: match_count += 1
        total_count += 1
        
        print(f"{k:<20} | {str(val_node):<15} | {str(val_py):<15} | {match_str}")

    print("-" * 65)
    print(f"Summary: {match_count}/{total_count} fields match.")

if __name__ == "__main__":
    print("Ensure both backends are running!")
    print(f"Node: {NODE_URL}")
    print(f"Python: {PYTHON_URL}")
    print("Payload: Small polygon in Mojave Desert")
    
    node_res = call_api("Node.js", NODE_URL, PAYLOAD)
    python_res = call_api("Python", PYTHON_URL, PAYLOAD)
    
    compare(node_res, python_res)
