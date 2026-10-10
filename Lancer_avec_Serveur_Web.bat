@echo off
title Randonneurs Sanaryens - Serveur Local
echo ========================================================
echo   Les Randonneurs Sanaryens - Gestionnaire GPX & Fiches
echo   Lancement du serveur local haute performance...
echo ========================================================
echo.
echo 1. Demarrage du serveur local sur http://localhost:8080
start /b python -m http.server 8080
timeout /t 1 >nul
echo 2. Ouverture de Google Chrome...
start chrome "http://localhost:8080"
if %ERRORLEVEL% NEQ 0 (
    start http://localhost:8080
)
echo.
echo Application ouverte ! Vous pouvez reduire cette fenetre.
pause
