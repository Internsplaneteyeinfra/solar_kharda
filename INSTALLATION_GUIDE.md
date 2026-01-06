# Complete Installation Guide - Step by Step

## Prerequisites Installation

### Step 1: Install Python 3.8+

1. **Download Python:**
   - Go to https://www.python.org/downloads/
   - Download Python 3.10 or 3.11 (64-bit)
   - **IMPORTANT:** During installation, check "Add Python to PATH"

2. **Verify Installation:**
   ```bash
   python --version
   ```
   Should show: `Python 3.10.x` or similar

### Step 2: Install Node.js

1. **Download Node.js:**
   - Go to https://nodejs.org/
   - Download LTS version (v18 or v20)
   - Run the installer and follow the setup wizard

2. **Verify Installation:**
   ```bash
   node --version
   npm --version
   ```
   Should show version numbers

### Step 3: Install Git (Optional but Recommended)

1. **Download Git:**
   - Go to https://git-scm.com/download/win
   - Download and install

## Project Setup

### Step 4: Get the Project Files

**Option A: If you have the project folder:**
- Copy the entire `Kharda` folder to your PC

**Option B: If using Git:**
```bash
git clone <repository-url>
cd Kharda
```

### Step 5: Set Up Google Earth Engine (GEE)

1. **Create a Google Cloud Project:**
   - Go to https://console.cloud.google.com/
   - Create a new project (or use existing)
   - Note your project ID

2. **Enable Earth Engine API:**
   - In Google Cloud Console, go to "APIs & Services" > "Library"
   - Search for "Earth Engine API"
   - Click "Enable"

3. **Create Service Account:**
   - Go to "IAM & Admin" > "Service Accounts"
   - Click "Create Service Account"
   - Name: `earthengine-service`
   - Click "Create and Continue"
   - Grant role: "Earth Engine User"
   - Click "Done"

4. **Create and Download Key:**
   - Click on the service account you just created
   - Go to "Keys" tab
   - Click "Add Key" > "Create new key"
   - Choose "JSON"
   - Download the JSON file
   - **Rename it to `credentials.json`**
   - Move it to `backend/credentials.json`

5. **Register Service Account with Earth Engine:**
   - Go to https://earthengine.google.com/
   - Sign in with your Google account
   - Go to "Settings" or visit: https://code.earthengine.google.com/register
   - Register your service account email (found in credentials.json as `client_email`)

## Backend Setup

### Step 6: Set Up Python Virtual Environment

1. **Open Command Prompt or PowerShell:**
   - Navigate to the project folder:
   ```bash
   cd C:\Users\YourName\Desktop\Kharda\backend
   ```

2. **Create Virtual Environment:**
   ```bash
   python -m venv venv
   ```

3. **Activate Virtual Environment:**
   ```bash
   venv\Scripts\activate
   ```
   You should see `(venv)` in your prompt

4. **Upgrade pip:**
   ```bash
   python -m pip install --upgrade pip
   ```

### Step 7: Install Backend Dependencies

1. **Install Requirements:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Verify Installation:**
   ```bash
   pip list
   ```
   Should show packages like: fastapi, earthengine-api, uvicorn, etc.

### Step 8: Configure Backend

1. **Check credentials.json:**
   - Make sure `backend/credentials.json` exists
   - It should contain your GEE service account credentials

2. **Create .env file (Optional):**
   - Create `backend/.env` file with:
   ```
   GEE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
   GEE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
   ```
   (You can get these from credentials.json)

3. **Verify Polygon File:**
   - Check that `asset/solar_panel_polygons.geojson` exists

### Step 9: Test Backend

1. **Run Backend:**
   ```bash
   python main.py
   ```

2. **Verify it's running:**
   - Should see: "Server running on http://0.0.0.0:8000"
   - Open browser: http://localhost:8000/docs
   - You should see the API documentation

3. **If there are errors:**
   - Check that credentials.json is in the backend folder
   - Verify Earth Engine API is enabled
   - Check that service account is registered with Earth Engine

## Frontend Setup

### Step 10: Install Frontend Dependencies

1. **Open a NEW Command Prompt/PowerShell:**
   - Navigate to frontend:
   ```bash
   cd C:\Users\YourName\Desktop\Kharda\frontend
   ```

2. **Install Node Modules:**
   ```bash
   npm install
   ```
   This may take 2-5 minutes

3. **Verify Installation:**
   ```bash
   npm list
   ```
   Should show installed packages

### Step 11: Test Frontend

1. **Start Development Server:**
   ```bash
   npm run dev
   ```

2. **Verify it's running:**
   - Should see: "Local: http://localhost:5173"
   - Browser should open automatically
   - You should see the login page

## Running the Application

### Step 12: Start Both Servers

**You need TWO terminal windows:**

**Terminal 1 - Backend:**
```bash
cd C:\Users\YourName\Desktop\Kharda\backend
venv\Scripts\activate
python main.py
```
Keep this running!

**Terminal 2 - Frontend:**
```bash
cd C:\Users\YourName\Desktop\Kharda\frontend
npm run dev
```
Keep this running!

### Step 13: Access the Application

1. **Open Browser:**
   - Go to: http://localhost:5173 (or the port shown in terminal)
   - You should see the login page

2. **Login:**
   - Use the login credentials (check your setup)

3. **Use the Dashboard:**
   - Select a parameter (LST, SWIR, etc.)
   - Select date range
   - Click "Analyze" button
   - Click on panels to view data

## Troubleshooting

### Python Issues

**Problem: "python is not recognized"**
- Solution: Reinstall Python and check "Add to PATH"

**Problem: "pip is not recognized"**
- Solution: `python -m pip install --upgrade pip`

### Node.js Issues

**Problem: "npm is not recognized"**
- Solution: Reinstall Node.js

**Problem: "npm install" fails**
- Solution: Delete `node_modules` folder and `package-lock.json`, then run `npm install` again

### GEE Issues

**Problem: "Authentication Error"**
- Solution: Verify credentials.json is in backend folder
- Check service account is registered with Earth Engine
- Verify Earth Engine API is enabled in Google Cloud

**Problem: "Image asset not found"**
- Solution: This is normal for some datasets - the app has fallbacks

### Port Issues

**Problem: "Port 8000 already in use"**
- Solution: Change port in backend/main.py or kill the process using port 8000

**Problem: "Port 5173 already in use"**
- Solution: Vite will automatically use next available port (5174, 5175, etc.)

### Backend Won't Start

1. Check virtual environment is activated: `(venv)` should be in prompt
2. Verify all dependencies installed: `pip list`
3. Check credentials.json exists
4. Look at error messages in terminal

### Frontend Won't Start

1. Verify node_modules exists: `ls node_modules` (or `dir node_modules`)
2. Try deleting node_modules and running `npm install` again
3. Check for errors in terminal

## Quick Start Scripts (After Initial Setup)

**Backend:**
```bash
cd backend
start.bat
```

**Frontend:**
```bash
cd frontend
start.bat
```

## Verification Checklist

✅ Python installed and in PATH
✅ Node.js installed
✅ GEE credentials.json in backend folder
✅ Virtual environment created and activated
✅ Backend dependencies installed
✅ Frontend dependencies installed
✅ Backend runs without errors
✅ Frontend runs without errors
✅ Can access http://localhost:8000/docs
✅ Can access http://localhost:5173

## Next Steps

Once everything is running:
1. Test the login
2. Select LST parameter
3. Choose a date range (use historical dates like 2023-09-01 to 2023-11-05)
4. Click "Analyze"
5. Click on a panel to see data

## Getting Help

If you encounter issues:
1. Check the error messages in the terminal
2. Verify all prerequisites are installed
3. Check that credentials.json is correct
4. Ensure both backend and frontend are running
5. Check browser console (F12) for frontend errors

