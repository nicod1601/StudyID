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

REM Installation si Electron est absent (couvre aussi une installation precedente interrompue)
if not exist "node_modules\electron\dist" (
    echo Installation des dependances de StudyIDE.
    echo Cela peut prendre 1 a 2 minutes, merci de patienter...
    echo.
    REM node-llama-cpp, IA locale optionnelle, ne doit jamais bloquer l'installation :
    REM sans Git ou si Windows bloque son binaire, StudyIDE se lance quand meme.
    call npm install --node-llama-cpp-postinstall=skip
    if errorlevel 1 (
        echo.
        echo Une erreur est survenue pendant l'installation.
        echo Si le message parle de EPERM, ferme les autres fenetres et ton antivirus
        echo le temps de l'installation, supprime le dossier node_modules puis relance.
        pause
        exit /b 1
    )
    if not exist "node_modules\electron\dist" (
        echo.
        echo Electron n'a pas pu etre telecharge. Verifie ta connexion internet,
        echo supprime le dossier node_modules puis relance ce fichier.
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

REM ============================================
REM   Serveur de chat LAN (optionnel)
REM ============================================
if exist "server" (
    if not exist "server\node_modules" (
        echo Installation des dependances du serveur de chat LAN...
        pushd server
        call npm install
        popd
        echo.
    )

    echo ============================================
    set /p LAUNCH_SERVER="Lancer aussi le serveur de chat LAN sur ce PC ? (o/n) : "
    if /i "%LAUNCH_SERVER%"=="o" (
        echo Lancement du serveur de chat dans une nouvelle fenetre...
        start "StudyIDE - Serveur de chat LAN" cmd /k "cd /d "%~dp0server" && npm start"
        echo Serveur de chat lance. Laisse cette fenetre ouverte tant que
        echo tu veux que le chat fonctionne pour les autres.
        echo.
    )
)

echo Lancement de StudyIDE...
echo.
call npm start

echo.
echo StudyIDE a ete ferme.
pause
