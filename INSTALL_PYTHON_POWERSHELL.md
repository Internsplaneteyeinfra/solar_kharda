# Installing Python from PowerShell - Step by Step

## Method 1: Download and Install Manually (Recommended for First Time)

### Step 1: Open PowerShell
- Press `Windows Key + X`
- Select "Windows PowerShell" or "Terminal"
- Or search "PowerShell" in Start Menu

### Step 2: Check if Python is Already Installed
```powershell
python --version
```
If you see a version number, Python is already installed. Skip to Step 6.

If you see an error like "python is not recognized", continue to Step 3.

### Step 3: Download Python Installer
You can download Python directly from PowerShell:

```powershell
# Navigate to your Downloads folder
cd $HOME\Downloads

# Download Python 3.11 (64-bit) using PowerShell
Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe" -OutFile "python-installer.exe"
```

**OR** manually download:
1. Open browser: https://www.python.org/downloads/
2. Click "Download Python 3.11.x" (latest version)
3. The installer will download to your Downloads folder

### Step 4: Install Python
```powershell
# Run the installer
.\python-installer.exe
```

**OR** double-click the downloaded file from Downloads folder

### Step 5: IMPORTANT - During Installation

1. **Check "Add Python to PATH"** - This is crucial!
   - At the bottom of the installer window
   - Check the box that says "Add Python 3.11 to PATH"
   - This allows you to use `python` command from anywhere

2. **Choose Installation Type:**
   - Click "Install Now" (recommended)
   - OR "Customize installation" if you want to change location

3. **Wait for Installation:**
   - Installation takes 2-5 minutes
   - You'll see "Setup was successful" when done

### Step 6: Verify Installation

**Close and reopen PowerShell** (important to refresh PATH):

```powershell
# Check Python version
python --version
# Should show: Python 3.11.x

# Check pip (Python package manager)
pip --version
# Should show: pip 24.x.x
```

### Step 7: Upgrade pip (Recommended)
```powershell
python -m pip install --upgrade pip
```

---

## Method 2: Using Windows Package Manager (winget) - Windows 11/10

If you have Windows 11 or Windows 10 with winget:

### Step 1: Check if winget is available
```powershell
winget --version
```

If you see a version number, continue. If not, use Method 1.

### Step 2: Install Python using winget
```powershell
# Install Python 3.11
winget install Python.Python.3.11
```

### Step 3: Verify Installation
Close and reopen PowerShell, then:
```powershell
python --version
```

---

## Method 3: Using Chocolatey (If Installed)

If you have Chocolatey package manager:

```powershell
# Install Python
choco install python

# Verify
python --version
```

---

## Troubleshooting

### Problem: "python is not recognized" after installation

**Solution 1: Restart PowerShell**
- Close PowerShell completely
- Open a new PowerShell window
- Try `python --version` again

**Solution 2: Add Python to PATH manually**

1. Find Python installation path (usually):
   ```
   C:\Users\YourName\AppData\Local\Programs\Python\Python311\
   C:\Python311\
   ```

2. Add to PATH:
   ```powershell
   # Check current PATH
   $env:PATH
   
   # Add Python to PATH for current session
   $env:PATH += ";C:\Users\$env:USERNAME\AppData\Local\Programs\Python\Python311\;C:\Users\$env:USERNAME\AppData\Local\Programs\Python\Python311\Scripts\"
   ```

3. **To make permanent:**
   - Press `Windows Key + X`
   - Select "System"
   - Click "Advanced system settings"
   - Click "Environment Variables"
   - Under "User variables", select "Path" and click "Edit"
   - Click "New" and add:
     - `C:\Users\YourName\AppData\Local\Programs\Python\Python311\`
     - `C:\Users\YourName\AppData\Local\Programs\Python\Python311\Scripts\`
   - Click OK on all windows
   - Restart PowerShell

### Problem: "pip is not recognized"

**Solution:**
```powershell
python -m pip --version
```

If this works, pip is installed but not in PATH. Use `python -m pip` instead of `pip`:
```powershell
python -m pip install --upgrade pip
```

### Problem: "Access Denied" when installing packages

**Solution:** Run PowerShell as Administrator:
1. Right-click PowerShell
2. Select "Run as Administrator"
3. Try again

---

## Quick Verification Commands

After installation, run these to verify everything works:

```powershell
# Check Python
python --version

# Check pip
pip --version
# OR
python -m pip --version

# Check Python location
where python
# OR
(Get-Command python).Path

# Test Python
python -c "print('Python is working!')"
```

---

## Next Steps After Python Installation

Once Python is installed:

1. **Navigate to your project:**
   ```powershell
   cd C:\Users\YourName\Desktop\Kharda\backend
   ```

2. **Create virtual environment:**
   ```powershell
   python -m venv venv
   ```

3. **Activate virtual environment:**
   ```powershell
   .\venv\Scripts\Activate.ps1
   ```

4. **If you get "execution policy" error:**
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
   Then try activating again.

5. **Install dependencies:**
   ```powershell
   pip install -r requirements.txt
   ```

---

## Summary

**Easiest Method for First Time:**
1. Download Python from https://www.python.org/downloads/
2. Run installer
3. **Check "Add Python to PATH"** ✅
4. Click "Install Now"
5. Close and reopen PowerShell
6. Verify with `python --version`

That's it! You're ready to use Python.

