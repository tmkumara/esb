@echo off
REM ─────────────────────────────────────────────────────────────
REM  Mock Bank SOAP Service — stop script (Windows)
REM ─────────────────────────────────────────────────────────────

SET PORT=8085
IF NOT "%1"=="" SET PORT=%1
SET LOG=mock-bank.log

echo Stopping Mock Bank SOAP Service on port %PORT%...

FOR /F "tokens=5" %%P IN ('netstat -ano ^| findstr ":%PORT% "') DO (
  echo Stopping PID %%P...
  taskkill /F /PID %%P >nul 2>&1
)

REM Clear log
IF EXIST %LOG% (
  type nul > %LOG%
  echo Log cleared: %LOG%
)

echo Done.
