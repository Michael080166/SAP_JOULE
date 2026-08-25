@echo off
setlocal
chcp 65001 >nul
title Antragsroboter

rem ======================================================================
rem  Antragsroboter - Starter fuer Windows
rem
rem  Startet Microsoft Edge mit geladenem Roboter und einem eigenen
rem  Benutzerprofil. Das Profil liegt neben dieser Datei, dadurch bleibt
rem  die Anmeldung am Portal ueber Neustarts hinweg erhalten und die
rem  normale Edge-Nutzung bleibt unberuehrt.
rem
rem  ANPASSEN: Adresse des Antragsportals eintragen.
rem ======================================================================

set "PORTAL=https://wohnweb-stage1.nrwbanki.de/"

rem ---------------------------------------------------------------------
set "HIER=%~dp0"
set "ERWEITERUNG=%HIER%erweiterung"
set "PROFIL=%HIER%browserprofil"

if not exist "%ERWEITERUNG%\manifest.json" (
  echo.
  echo   FEHLER: Der Ordner "erweiterung" wurde nicht gefunden.
  echo   Erwartet unter: %ERWEITERUNG%
  echo.
  echo   Diese Datei muss im selben Ordner liegen wie der Ordner
  echo   "erweiterung". Bitte den entpackten Ordner vollstaendig lassen.
  echo.
  pause
  exit /b 1
)

rem Edge und Chrome teilen denselben Unterbau - der Roboter laeuft in beiden.
rem Chrome wird bevorzugt, weil WohnWeb in Edge einen Hinweiskasten zeigt.
rem Steht nur Edge zur Verfuegung, ist das kein Hindernis: den Kasten klickt
rem der Roboter selbst weg.
set "BROWSER="
set "BROWSERNAME="
for %%P in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do if not defined BROWSER if exist %%P (
  set "BROWSER=%%~P"
  set "BROWSERNAME=Google Chrome"
)

if not defined BROWSER (
  for %%P in (
    "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
    "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
    "%LocalAppData%\Microsoft\Edge\Application\msedge.exe"
  ) do if not defined BROWSER if exist %%P (
    set "BROWSER=%%~P"
    set "BROWSERNAME=Microsoft Edge"
  )
)

if not defined BROWSER (
  echo.
  echo   Weder Microsoft Edge noch Google Chrome gefunden.
  echo   Bitte den Roboter von Hand laden - siehe LIESMICH.md, Abschnitt
  echo   "Einrichten in 4 Klicks".
  echo.
  pause
  exit /b 1
)

if not exist "%PROFIL%" mkdir "%PROFIL%"

echo.
echo   Antragsroboter wird gestartet ...
echo.
echo   Browser: %BROWSERNAME%
echo   Roboter: %ERWEITERUNG%
echo   Profil:  %PROFIL%
echo   Portal:  %PORTAL%
echo.
echo   Nach dem Start:
echo     1. Am Portal anmelden - ganz normal von Hand.
echo     2. Oben rechts auf das Puzzleteil, dann auf "Antragsroboter".
echo.

start "" "%BROWSER%" ^
  --user-data-dir="%PROFIL%" ^
  --load-extension="%ERWEITERUNG%" ^
  --disable-extensions-except="%ERWEITERUNG%" ^
  --no-first-run ^
  --no-default-browser-check ^
  "%PORTAL%"

rem Fenster kurz stehen lassen, damit Meldungen lesbar bleiben.
timeout /t 4 >nul
endlocal
