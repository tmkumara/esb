@echo off
echo ============================================================
echo  ESB Platform Demo Environment
echo ============================================================
echo.

echo [1/3] Starting ESB Runtime (port 9090)...
start "ESB Runtime" cmd /k "cd /d %~dp0esb-runtime && mvn spring-boot:run -Dspring-boot.run.profiles=demo"

echo Waiting 15 seconds for Runtime to initialise...
timeout /t 15 /nobreak >nul

echo [2/3] Starting ESB Designer (port 9191)...
start "ESB Designer" cmd /k "cd /d %~dp0esb-designer && mvn spring-boot:run"

echo Waiting 5 seconds for Designer to initialise...
timeout /t 5 /nobreak >nul

echo [3/3] Starting ESB UI (port 3000)...
start "ESB UI" cmd /k "cd /d %~dp0esb-ui && npm run dev:designer"

echo.
echo ============================================================
echo  All services starting:
echo    Runtime   -^> http://localhost:9090
echo    Designer  -^> http://localhost:9191
echo    UI        -^> http://localhost:3000
echo ============================================================
echo.
echo Open http://localhost:3000 in your browser.
pause
