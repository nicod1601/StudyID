@echo off
setlocal enabledelayedexpansion
title StudyIDE - Desinstallation
cd /d "%~dp0"

set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

echo ============================================
echo   DESINSTALLATION COMPLETE DE STUDYIDE
echo ============================================
echo.
echo Ceci va supprimer DEFINITIVEMENT :
echo.
echo   1. Le dossier de l'application (code, node_modules...) :
echo      %APP_DIR%
echo.
echo   2. Ton espace de travail (exercices, cours PDF, notes,
echo      IA locale telechargee, plusieurs Go possible) :
echo      %USERPROFILE%\StudyIDE
echo.
echo   3. Les donnees internes d'Electron (cache, reglages) :
echo      %APPDATA%\StudyIDE
echo.
echo   4. Le raccourci sur le Bureau, s'il existe.
echo.
echo   /!\ Cette action est IRREVERSIBLE.
echo   /!\ Ferme StudyIDE avant de continuer si ce n'est pas deja fait.
echo.

set /p CONFIRM="Tape SUPPRIMER en majuscules pour confirmer : "
if not "%CONFIRM%"=="SUPPRIMER" (
    echo.
    echo Annule. Rien n'a ete supprime.
    pause
    exit /b 0
)

echo.
echo Fermeture de StudyIDE si elle est encore ouverte...
powershell -NoProfile -Command "Get-Process | Where-Object { $_.Path -like '%APP_DIR%*' } | Stop-Process -Force -ErrorAction SilentlyContinue" >nul 2>nul
timeout /t 1 /nobreak >nul

echo Suppression en cours...

if exist "%USERPROFILE%\StudyIDE" (
    rd /s /q "%USERPROFILE%\StudyIDE"
    echo   - Espace de travail supprime.
)

if exist "%APPDATA%\StudyIDE" (
    rd /s /q "%APPDATA%\StudyIDE"
    echo   - Cache/reglages Electron supprimes.
)

if exist "%USERPROFILE%\Desktop\StudyIDE.lnk" (
    del /f /q "%USERPROFILE%\Desktop\StudyIDE.lnk"
    echo   - Raccourci Bureau supprime.
)

echo   - Suppression du dossier de l'application...
echo.
echo StudyIDE va etre completement supprime dans 2 secondes.
echo Cette fenetre va se fermer automatiquement.

set "HELPER=%TEMP%\studyide_uninstall_helper_%RANDOM%.bat"
(
    echo @echo off
    echo timeout /t 2 /nobreak ^>nul
    echo rd /s /q "%APP_DIR%"
    echo del "%%~f0"
) > "%HELPER%"

start "" /min "%HELPER%"
exit
