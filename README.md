# Solar Farm Dashboard

A web-based dashboard for monitoring solar farm panels with real-time data visualization using Google Earth Engine (GEE) and Sentinel images.

## Features

- **Interactive Map**: View 1955 solar panel polygons on an interactive map
- **Multiple Parameters**: Select from LST (Land Surface Temperature), SWIR (Shortwave Infrared), or Soiling Index
- **Historical Data**: Click on any panel to view historical time-series data
- **Date Range Selection**: Customize the time range for data analysis
- **Real-time Visualization**: Charts and statistics update based on selected parameters

## Project Structure

```
Kharda/
├── asset/
│   └── solar_panel_polygons.geojson    # Panel polygon data
├── backend/
│   ├── main.py                          # FastAPI backend
│   ├── requirements.txt                 # Python dependencies
│   ├── .env                             # Environment variables (GEE credentials)
│   └── credentials.json                 # GEE service account credentials
└── frontend/
    ├── src/
    │   ├── App.jsx                       # Main React component
    │   ├── components/
    │   │   ├── ControlPanel.jsx         # Left sidebar controls
    │   │   └── DataPanel.jsx            # Right panel for data display
    │   └── ...
    ├── package.json
    └── vite.config.js
```

## Setup Instructions

### Prerequisites

- Python 3.8 or higher
- Node.js 16 or higher
- npm or yarn
- Google Earth Engine account with service account credentials

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment (recommended):
   ```bash
   python -m venv venv
   
   # On Windows:
   venv\Scripts\activate
   
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Set up GEE credentials:
   - Copy your `.env` file to the `backend` directory with your GEE credentials:
     ```
     GEE_CLIENT_EMAIL="your-service-account@project.iam.gserviceaccount.com"
     GEE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
     ```
   - Alternatively, place your `credentials.json` file in the `backend` directory

5. Run the backend server:
   ```bash
   python main.py
   ```
   
   Or using uvicorn directly:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

   The API will be available at `http://localhost:8000`

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

   The frontend will be available at `http://localhost:3000`

## Usage

1. **Select Parameter**: Choose from LST, SWIR, or Soiling Index from the left panel
2. **Set Date Range**: Select start and end dates for the analysis period
3. **Click Panel**: Click on any panel on the map to view its data
4. **View Data**: The right panel will display:
   - Current value (for LST and SWIR)
   - Historical time-series chart
   - Status information (for Soiling Index)

## API Endpoints

### GET `/polygons`
Returns the GeoJSON file with all panel polygons

### POST `/api/panel-data`
Get historical data for a specific panel

**Request Body:**
```json
{
  "panel_id": 0,
  "parameter": "LST",
  "start_date": "2024-01-01",
  "end_date": "2024-12-31"
}
```

**Response:**
```json
{
  "parameter": "LST",
  "current_value": 45.2,
  "unit": "°C",
  "timeseries": [
    {
      "date": "2024-01-01",
      "value": 42.5,
      "unit": "°C"
    }
  ]
}
```

## Parameters

### LST (Land Surface Temperature)
- **Dataset**: MODIS Terra MOD11A2
- **Resolution**: 1km
- **Unit**: °C
- **Time Range**: Historical data from 2020 to present

### SWIR (Shortwave Infrared)
- **Dataset**: Sentinel-2 Surface Reflectance
- **Resolution**: 10m
- **Unit**: Reflectance
- **Cloud Filter**: < 20% cloud coverage

### Soiling Index
- **Dataset**: Sentinel-2 Surface Reflectance Harmonized
- **Resolution**: 10m
- **Calculation**: (B2 + B4) / (B8 + 0.0001)
- **Status**: Clean or Needs Cleaning (>15% drop)

## Troubleshooting

### Backend Issues

- **GEE Initialization Error**: Ensure your credentials are correctly set in `.env` or `credentials.json`
- **Polygon File Not Found**: Make sure `solar_panel_polygons.geojson` is in the `asset` directory
- **Port Already in Use**: Change the port in `main.py` or use `--port` flag with uvicorn

### Frontend Issues

- **Map Not Loading**: Check that Leaflet CSS is loaded (should be automatic)
- **API Connection Error**: Verify backend is running on port 8000
- **CORS Errors**: Check backend CORS settings in `main.py`

## Development

To modify the application:

- **Backend**: Edit `backend/main.py` for API endpoints and GEE processing logic
- **Frontend**: Edit React components in `frontend/src/`
- **Styling**: Modify CSS files in `frontend/src/`

## License

This project is for internal use only.

author- prachi kasar

