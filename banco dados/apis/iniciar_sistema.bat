@echo off
title Sistema Laboratorio Bioteste - Backend
color 0A

:: 1. Garante que o comando seja executado na pasta deste arquivo
cd /d "%~dp0"

echo ========================================================
echo      SISTEMA DE GERENCIAMENTO - LABORATORIO BIOTESTE
echo ========================================================
echo.

:: 2. Verifica se o Node.js está instalado
node -v >nul 2>&1
if %errorlevel% neq 0 goto ERRO_NODE

:: 3. Verifica se precisa instalar bibliotecas
if exist "node_modules" goto INICIAR_SERVER

echo [STATUS] Primeira execucao detectada. Instalando dependencias...
echo.
call npm install express sqlite sqlite3 multer bcryptjs jsonwebtoken cors

if %errorlevel% neq 0 goto ERRO_INSTALL

echo.
echo [SUCESSO] Dependencias instaladas!
echo.

:INICIAR_SERVER
echo [STATUS] Iniciando o servidor...
echo Pressione CTRL+C para parar.
echo.

node api_server.js

if %errorlevel% neq 0 goto ERRO_CRASH
goto FIM

:ERRO_NODE
color 0C
echo.
echo [ERRO CRITICO] Node.js nao encontrado!
echo Instale o Node.js LTS em https://nodejs.org/
echo.
pause
exit

:ERRO_INSTALL
color 0C
echo.
echo [ERRO] Falha ao instalar bibliotecas (npm install).
echo Verifique sua internet.
echo.
pause
exit

:ERRO_CRASH
color 0C
echo.
echo [ATENCAO] O servidor parou com erro.
echo Verifique as mensagens acima.
echo.
pause
exit

:FIM
pause