@echo off
title StudyIDE - Lancement
cd /d "%~dp0"

echo ============================================
echo   StudyIDE - Verification de l'environnement
echo ============================================
echo.

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js / npm n'est pas installe sur ce PC.
    echo.
    where winget >nul 2>nul
    if %errorlevel% equ 0 (
        echo Installation automatique de Node.js via winget...
        echo ^(une fenetre Windows peut demander une confirmation^)
        echo.
        winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
        echo.
        echo ============================================
        echo Installation terminee.
        echo Ferme cette fenetre et redouble-clique sur
        echo Lancer-StudyIDE.bat pour continuer.
        echo ============================================
        pause
        exit /b 0
    ) else (
        echo Impossible d'installer Node.js automatiquement sur ce PC
        echo ^(winget non disponible^).
        echo.
        echo Installe Node.js manuellement :
        echo   1. Va sur https://nodejs.org
        echo   2. Telecharge et installe la version LTS
        echo   3. Redouble-clique ensuite sur Lancer-StudyIDE.bat
        echo.
        pause
        exit /b 1
    )
)

echo Node.js / npm detecte : OK
echo.

if not exist "node_modules" (
    echo Premiere installation des dependances de StudyIDE.
    echo Cela peut prendre 1 a 2 minutes, merci de patienter...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo Une erreur est survenue pendant l'installation.
        pause
        exit /b 1
    )
    echo.
    echo Dependances installees avec succes.
    echo.
) else (
    echo Dependances deja installees : OK
    echo.
)

echo Lancement de StudyIDE...
echo.
call npm start

echo.
echo StudyIDE a ete ferme.
pause
