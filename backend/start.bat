@echo off
REM Backend startup script for Windows
cd /d "%~dp0"
if exist venv (
    echo Removing old venv...
    rmdir /s /q venv
)
echo Creating new virtual environment...
python -m venv venv
call venv\Scripts\activate.bat
echo Upgrading pip, setuptools, and wheel...
python -m pip install --upgrade pip setuptools wheel
echo Installing requirements...
pip install -r requirements.txt
echo Starting server...
python main.py

