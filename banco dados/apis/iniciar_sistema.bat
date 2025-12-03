@echo off
title Sistema Laboratorio Bioteste - Backend (ULTIMATE)
color 0A

:: 1. Garante que o comando seja executado na pasta deste arquivo
cd /d "%~dp0"

echo ========================================================
echo   SISTEMA DE GERENCIAMENTO - LABORATORIO BIOTESTE
echo         Versao Ultimate - Backend Server
echo ========================================================
echo.

:: 2. Verifica se o Node.js esta instalado
:: Se der erro aqui, ele pula para o final com PAUSE para voce ler
node -v >nul 2>&1
if %errorlevel% neq 0 goto ERRO_NODE

:: 3. Configuracao essencial para ES Modules (sem parenteses para evitar erro de sintaxe)
if exist "package.json" goto SKIP_JSON
echo [CONFIG] Criando configuracao para modulos modernos (ESM)...
echo { "name": "bioteste-backend", "version": "1.0.0", "type": "module", "main": "api_server.js" } > package.json
:SKIP_JSON

:: 4. Verifica se precisa instalar bibliotecas
if exist "node_modules" goto INICIAR_SERVER

echo [STATUS] Primeira execucao detectada. Instalando dependencias...
echo.
call npm install express sqlite sqlite3 multer bcryptjs jsonwebtoken cors

if %errorlevel% neq 0 goto ERRO_INSTALL

echo.
echo [SUCESSO] Dependencias instaladas!
echo.

:INICIAR_SERVER
cls
echo ========================================================
echo   LABORATORIO BIOTESTE - SERVIDOR ONLINE
echo ========================================================
echo.
echo [INFO] Iniciando API e Banco de Dados...
echo [DICA] Para parar o servidor, pressione CTRL+C
echo.

:: Executa o servidor
node api_server.js

:: Se o servidor parar (crashar), mostra erro
if %errorlevel% neq 0 goto ERRO_CRASH
goto FIM

:ERRO_NODE
color 0C
echo.
echo [ERRO CRITICO] Node.js nao encontrado!
echo O sistema precisa do Node.js para funcionar.
echo Baixe e instale a versao LTS em: https://nodejs.org/
echo.
pause
exit

:ERRO_INSTALL
color 0C
echo.
echo [ERRO] Falha ao instalar as bibliotecas do sistema.
echo Verifique sua conexao com a internet e tente novamente.
echo.
pause
exit

:ERRO_CRASH
color 0C
echo.
echo [ATENCAO] O servidor parou inesperadamente.
echo Verifique se o arquivo 'api_server.js' esta na mesma pasta.
echo Verifique as mensagens de erro acima para corrigir.
echo.
pause
exit

:FIM
pause
