@echo off
REM Frontend startup script for Windows
cd /d "%~dp0"
if not exist node_modules (
    echo Installing dependencies...
    npm install
)
echo Starting frontend development server...
npm run dev

