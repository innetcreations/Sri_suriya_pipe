@echo off
rem ======================================================================
rem  suriya.bat  -  one control panel for the Sri Suriya website (Windows)
rem  Double-click it. Pick a number. Everything else is done for you.
rem  Keep this file ASCII only and keep Windows (CRLF) line endings.
rem ======================================================================
setlocal EnableExtensions
set "BAT_VERSION=1.1.0"
set "BAT_DATE=2026-11-20"
cd /d "%~dp0"
title Sri Suriya Control Panel
set "PORT=3000"
set "ADMIN=admin"
if not exist "package.json" goto notinproject

:menu
cls
call :readversion
call :readenv
echo.
echo   ======================================================================
echo     SRI SURIYA POLYMERS  -  Control Panel
echo     Website version %APPVER%     Launcher version %BAT_VERSION% - %BAT_DATE%
echo   ======================================================================
echo.
echo     SET UP AND RUN
echo       1   First-time setup  - do this once
echo       2   Start the website
echo       3   Stop the website
echo       4   Open the website in my browser
echo       5   Open the admin panel in my browser
echo.
echo     WHEN THE CODE CHANGES
echo       6   I changed the code - install, check, test and restart
echo       7   Apply an update ZIP that I received
echo       8   Developer mode - restarts by itself while I edit
echo.
echo     CHECKS AND SAFETY
echo       9   Health check - is everything OK?
echo      10   Run all automatic tests
echo      11   Security check of the libraries
echo      12   Back up my data now
echo      13   Reset the admin password
echo.
echo     GOING LIVE
echo      14   Vercel and hosting checklist
echo      15   What changed - version history
echo.
echo       0   Exit
echo.
set "CH=-"
set /p "CH=  Type a number and press Enter: "
set "CH=%CH:"=%"
if "%CH%"=="1" goto setup
if "%CH%"=="2" goto start
if "%CH%"=="3" goto stop
if "%CH%"=="4" goto openweb
if "%CH%"=="5" goto openadmin
if "%CH%"=="6" goto afterchange
if "%CH%"=="7" goto update
if "%CH%"=="8" goto dev
if "%CH%"=="9" goto doctor
if "%CH%"=="10" goto runtests
if "%CH%"=="11" goto audit
if "%CH%"=="12" goto backupnow
if "%CH%"=="13" goto resetadmin
if "%CH%"=="14" goto vercel
if "%CH%"=="15" goto changelog
if "%CH%"=="0" goto quit
goto menu

rem ----------------------------------------------------------------------
:notinproject
echo.
echo   This file must stay inside the sri-suriya-app folder, next to package.json.
echo   If you opened it from inside a ZIP file, extract the whole ZIP first.
echo.
pause
exit /b 1

rem ----------------------------------------------------------------------
:setup
call :neednode
if errorlevel 1 goto menu
echo.
echo   Step 1 of 3 - creating your settings file
node scripts\setup-env.js
if errorlevel 1 goto failed
echo.
echo   Step 2 of 3 - installing the libraries, this takes 1 to 2 minutes
call npm install --no-audit --no-fund
if errorlevel 1 goto failed
echo.
echo   Step 3 of 3 - health check
node scripts\doctor.js
echo.
echo   Setup is finished. Choose 2 in the menu to start the website.
pause
goto menu

rem ----------------------------------------------------------------------
:start
call :neednode
if errorlevel 1 goto menu
if not exist "node_modules\express" goto needinstall
if not exist ".env" goto needinstall
call :isrunning
if not errorlevel 1 goto alreadyrunning
echo.
echo   Starting the website in a new window ...
echo   First start only: that window prints the admin e-mail and password ONCE. Copy them.
start "Sri Suriya website" cmd /k call npm start
timeout /t 6 /nobreak >nul
start "" "http://localhost:%PORT%"
echo.
echo   Website:  http://localhost:%PORT%
echo   Admin:    http://localhost:%PORT%/%ADMIN%
pause
goto menu

:alreadyrunning
echo.
echo   The website is already running on port %PORT%. Opening it for you.
start "" "http://localhost:%PORT%"
pause
goto menu

:needinstall
echo.
echo   The website is not set up yet. Choose option 1 first.
pause
goto menu

rem ----------------------------------------------------------------------
:stop
call :stopserver
echo.
pause
goto menu

rem ----------------------------------------------------------------------
:openweb
start "" "http://localhost:%PORT%"
goto menu

:openadmin
start "" "http://localhost:%PORT%/%ADMIN%"
goto menu

rem ----------------------------------------------------------------------
:afterchange
call :neednode
if errorlevel 1 goto menu
echo.
echo   1 of 3 - installing any new libraries
call npm install --no-audit --no-fund
if errorlevel 1 goto failed
echo.
echo   2 of 3 - health check
node scripts\doctor.js
if errorlevel 1 goto failed
echo.
echo   3 of 3 - automatic tests, about 1 minute
call npm test
if errorlevel 1 goto testsfailed
echo.
echo   All good. 
set "R=N"
set /p "R=  Restart the website now? Type Y or N: "
set "R=%R:"=%"
if /i "%R%"=="Y" goto restart
goto menu

:restart
call :stopserver
timeout /t 2 /nobreak >nul
goto start

:testsfailed
echo.
echo   Some tests failed, so the change is NOT safe to publish yet.
echo   Copy the red lines above, paste them into Antigravity and write:  fix this and run npm test again.
pause
goto menu

rem ----------------------------------------------------------------------
:update
call :neednode
if errorlevel 1 goto menu
echo.
echo   APPLY AN UPDATE
echo   ---------------
echo   Your website data, your pictures, videos, logos (public\assets) and your .env settings are never overwritten.
echo   A backup copy is saved first, in the _backups folder.
echo.
set "ZIP="
set /p "ZIP=  Drag the update ZIP file onto this window, then press Enter: "
if not defined ZIP goto menu
set "ZIP=%ZIP:"=%"
if not exist "%ZIP%" goto zipmissing
call :stopserver
call :dobackup
if errorlevel 1 goto failed
set "TMPD=%TEMP%\suriya-update-%RANDOM%"
if exist "%TMPD%" rmdir /s /q "%TMPD%"
mkdir "%TMPD%"
echo   Unpacking the ZIP ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath $env:ZIP -DestinationPath $env:TMPD -Force"
if errorlevel 1 goto failed
set "SRC=%TMPD%"
if exist "%TMPD%\sri-suriya-app\package.json" set "SRC=%TMPD%\sri-suriya-app"
if not exist "%SRC%\package.json" goto badzip
echo   Copying the new files ...
robocopy "%SRC%" "%CD%" /E /XD "%CD%\data" "%CD%\node_modules" "%CD%\_backups" "%CD%\public\assets\uploads" "%CD%\public\assets\images" "%CD%\public\assets\videos" "%CD%\public\assets\brand" "%SRC%\data" "%SRC%\node_modules" "%SRC%\_backups" "%SRC%\public\assets\uploads" "%SRC%\public\assets\images" "%SRC%\public\assets\videos" "%SRC%\public\assets\brand" /XF .env suriya.bat suriya-last-run.log /NFL /NDL /NJH /NJS /NP
if errorlevel 8 goto failed
if exist "%SRC%\suriya.bat" copy /y "%SRC%\suriya.bat" "%CD%\suriya.new.bat" >nul
rmdir /s /q "%TMPD%"
echo.
echo   Installing libraries ...
call npm install --no-audit --no-fund
if errorlevel 1 goto failed
echo.
echo   Running the automatic tests, about 1 minute ...
call npm test
if errorlevel 1 goto testsfailed
echo.
echo   Update applied. Choose 2 to start the website.
if exist "suriya.new.bat" goto swaplauncher
pause
goto menu

:swaplauncher
echo   This update also has a newer launcher. It is swapped in when this window closes.
echo   Open suriya.bat again afterwards.
start "" cmd /c ping -n 3 127.0.0.1 ^>nul ^& move /y suriya.new.bat suriya.bat
pause
exit /b 0

:zipmissing
echo.
echo   That file was not found: %ZIP%
pause
goto menu

:badzip
echo.
echo   That ZIP does not look like the Sri Suriya project - package.json is missing.
rmdir /s /q "%TMPD%"
pause
goto menu

rem ----------------------------------------------------------------------
:dev
call :neednode
if errorlevel 1 goto menu
if not exist "node_modules\express" goto needinstall
echo.
echo   Developer mode starts in a new window and restarts by itself when you save a file.
start "Sri Suriya developer mode" cmd /k call npm run dev
timeout /t 6 /nobreak >nul
start "" "http://localhost:%PORT%"
goto menu

rem ----------------------------------------------------------------------
:doctor
call :neednode
if errorlevel 1 goto menu
node scripts\doctor.js
pause
goto menu

:runtests
call :neednode
if errorlevel 1 goto menu
echo.
call npm test
pause
goto menu

:audit
call :neednode
if errorlevel 1 goto menu
echo.
call npm run audit
pause
goto menu

:backupnow
echo.
echo   For the safest copy, stop the website first with option 3.
call :dobackup
pause
goto menu

:resetadmin
call :neednode
if errorlevel 1 goto menu
echo.
call npm run reset-admin
pause
goto menu

:vercel
call :neednode
if errorlevel 1 goto menu
node scripts\vercel-check.js
pause
goto menu

:changelog
if not exist "CHANGELOG.md" goto nochangelog
cls
more < "CHANGELOG.md"
pause
goto menu

:nochangelog
echo.
echo   CHANGELOG.md was not found.
pause
goto menu

rem ----------------------------------------------------------------------
:failed
echo.
echo   Something went wrong - please read the messages above.
echo   Tip: copy them into Antigravity and write:  fix this error.
pause
goto menu

:quit
endlocal
exit /b 0

rem ======================================================================
rem  small helpers - used by the menu code above
rem ======================================================================
:readversion
set "APPVER=?"
for /f "usebackq delims=" %%v in (`node -p "require('./package.json').version" 2^>nul`) do set "APPVER=%%v"
exit /b 0

:readenv
set "PORT=3000"
set "ADMIN=admin"
if not exist ".env" exit /b 0
for /f "usebackq tokens=2 delims==" %%p in (`findstr /b /c:"PORT=" ".env"`) do set "PORT=%%p"
for /f "usebackq tokens=2 delims==" %%a in (`findstr /b /c:"ADMIN_PATH=" ".env"`) do set "ADMIN=%%a"
set "PORT=%PORT: =%"
set "ADMIN=%ADMIN: =%"
exit /b 0

:neednode
where node >nul 2>nul
if errorlevel 1 goto nonode
node -e "process.exit(Number(process.versions.node.split('.')[0])>=22?0:1)"
if errorlevel 1 goto oldnode
exit /b 0
:nonode
echo.
echo   Node.js is not installed. Download the LTS version from https://nodejs.org ,
echo   install it, then close this window and open suriya.bat again.
pause
exit /b 1
:oldnode
echo.
echo   Your Node.js is too old - version 22 or newer is needed.
echo   Download the LTS version from https://nodejs.org , install it, then try again.
pause
exit /b 1

:isrunning
netstat -ano | findstr ":%PORT% " | findstr LISTENING >nul
exit /b %errorlevel%

:stopserver
call :isrunning
if errorlevel 1 goto notrunning
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do taskkill /pid %%p /f >nul 2>nul
echo   Stopped whatever was using port %PORT% (that is the website).
exit /b 0
:notrunning
echo   The website is not running.
exit /b 0

:dobackup
set "STAMP="
for /f "usebackq delims=" %%t in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"`) do set "STAMP=%%t"
if not defined STAMP set "STAMP=%RANDOM%"
set "BK=%CD%\_backups\%STAMP%"
mkdir "%BK%" 2>nul
if exist "data" robocopy "data" "%BK%\data" /E /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 exit /b 1
if exist ".env" copy /y ".env" "%BK%\.env" >nul
if exist "public\assets\uploads" robocopy "public\assets\uploads" "%BK%\uploads" /E /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 exit /b 1
if exist "public\assets\images" robocopy "public\assets\images" "%BK%\images" /E /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 exit /b 1
if exist "public\assets\videos" robocopy "public\assets\videos" "%BK%\videos" /E /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 exit /b 1
if exist "public\assets\brand" robocopy "public\assets\brand" "%BK%\brand" /E /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 exit /b 1
echo   Backup saved in %BK%
exit /b 0
