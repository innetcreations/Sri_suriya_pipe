@echo off
title Push to GitHub - Sri Suriya Polymers
echo ===================================================
echo   Pushing code to GitHub: innetcreations/Sri_suriya_pipe
echo ===================================================
echo.

cd /d "%~dp0"

echo Current Git Status:
git status -s
echo.

echo Pushing commits to branch 'main'...
git push origin main

echo.
if %ERRORLEVEL% EQU 0 (
    echo ===================================================
    echo   SUCCESS! Pushed to GitHub successfully.
    echo ===================================================
    timeout /t 3 /nobreak >nul
) else (
    echo ===================================================
    echo   PUSH FAILED.
    echo ===================================================
    pause
)
