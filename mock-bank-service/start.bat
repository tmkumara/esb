@echo off
REM ─────────────────────────────────────────────────────────────
REM  Mock Bank SOAP Service — start script (Windows)
REM ─────────────────────────────────────────────────────────────

SET JAR=mock-bank-service.jar
SET PORT=8085
IF NOT "%1"=="" SET PORT=%1

IF NOT EXIST %JAR% (
    echo ERROR: %JAR% not found.
    echo Run: mvn clean package -DskipTests  then copy target\mock-bank-service.jar here.
    pause
    exit /b 1
)

echo Starting Mock Bank SOAP Service on port %PORT%...
start "Mock Bank SOAP Service" java -jar %JAR% --server.port=%PORT%

echo.
echo Service starting...
echo Endpoints:
echo   SOAP  : http://localhost:%PORT%/soap/balance-service
echo   WSDL  : http://localhost:%PORT%/soap/balance-service  (GET)
echo   Health: http://localhost:%PORT%/soap/health
echo.
echo Log is printed in the new window.
