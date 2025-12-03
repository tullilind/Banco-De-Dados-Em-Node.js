@echo off
title Sistema Laboratorio Bioteste - Backend Server v1.0
color 0A
chcp 65001 >nul 2>&1

:: ========================================================
:: SISTEMA DE GERENCIAMENTO - LABORATÓRIO BIOTESTE
:: Versão Ultimate - Backend Server Completo
:: ========================================================

:: 1. Garante que o comando seja executado na pasta deste arquivo
cd /d "%~dp0"

cls
echo ╔════════════════════════════════════════════════════════╗
echo ║   SISTEMA DE GERENCIAMENTO - LABORATÓRIO BIOTESTE      ║
echo ║        Versão Ultimate - Backend Server v1.0           ║
echo ╚════════════════════════════════════════════════════════╝
echo.

:: 2. Verifica se o Node.js está instalado
echo [1/5] Verificando Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 goto ERRO_NODE
for /f "tokens=*" %%v in ('node -v') do set NODE_VERSION=%%v
echo       ✓ Node.js %NODE_VERSION% detectado
echo.

:: 3. Configuração essencial para ES Modules
echo [2/5] Configurando módulos ES...
if exist "package.json" (
    echo       ✓ package.json já existe
) else (
    echo       • Criando package.json...
    (
        echo {
        echo   "name": "bioteste-backend-ultimate",
        echo   "version": "1.0.0",
        echo   "description": "Sistema de Gerenciamento Laboratorial - API Backend",
        echo   "type": "module",
        echo   "main": "api_server.js",
        echo   "scripts": {
        echo     "start": "node api_server.js",
        echo     "dev": "node --watch api_server.js"
        echo   },
        echo   "keywords": ["laboratorio", "bioteste", "api", "backend"],
        echo   "author": "Bioteste Lab",
        echo   "license": "MIT"
        echo }
    ) > package.json
    echo       ✓ package.json criado com sucesso
)
echo.

:: 4. Verifica e instala dependências
echo [3/5] Verificando dependências...
if exist "node_modules" (
    echo       ✓ Dependências já instaladas
    goto VERIFICAR_ESTRUTURA
)

echo       • Instalando bibliotecas necessárias...
echo.
echo       Aguarde, isso pode levar alguns minutos...
echo.
call npm install express sqlite sqlite3 multer bcryptjs jsonwebtoken cors

if %errorlevel% neq 0 goto ERRO_INSTALL
echo.
echo       ✓ Todas as dependências foram instaladas!
echo.

:VERIFICAR_ESTRUTURA
:: 5. Verifica estrutura de pastas
echo [4/5] Verificando estrutura de pastas...
if not exist "temp_uploads" (
    mkdir temp_uploads
    echo       • Pasta temp_uploads criada
)
if not exist "backups_automaticos" (
    mkdir backups_automaticos
    echo       • Pasta backups_automaticos criada
)
echo       ✓ Estrutura de pastas OK
echo.

:: 6. Verifica se o arquivo principal existe
echo [5/5] Verificando arquivos do sistema...
if not exist "api_server.js" goto ERRO_ARQUIVO
echo       ✓ api_server.js encontrado
echo.

:: 7. Inicia o servidor
cls
echo ╔════════════════════════════════════════════════════════╗
echo ║     LABORATÓRIO BIOTESTE - SERVIDOR INICIALIZADO       ║
echo ╚════════════════════════════════════════════════════════╝
echo.
echo ┌────────────────────────────────────────────────────────┐
echo │  STATUS: ONLINE                                        │
echo │  Porta: 3000                                           │
echo │  URL: http://localhost:3000                            │
echo │  Health Check: http://localhost:3000/api/status        │
echo └────────────────────────────────────────────────────────┘
echo.
echo [INFO] Iniciando API e Banco de Dados SQLite...
echo [DICA] Para parar o servidor: pressione CTRL+C
echo.
echo ════════════════════════════════════════════════════════
echo  LOGS DO SISTEMA:
echo ════════════════════════════════════════════════════════
echo.

:: Executa o servidor
node api_server.js

:: Se o servidor parar, verifica se foi erro ou encerramento normal
if %errorlevel% equ 0 goto FIM_NORMAL
goto ERRO_CRASH

:: ========================================================
:: TRATAMENTO DE ERROS
:: ========================================================

:ERRO_NODE
color 0C
cls
echo ╔════════════════════════════════════════════════════════╗
echo ║                   ERRO CRÍTICO                         ║
echo ╚════════════════════════════════════════════════════════╝
echo.
echo [X] Node.js não encontrado no sistema!
echo.
echo O sistema precisa do Node.js para funcionar.
echo.
echo SOLUÇÃO:
echo 1. Acesse: https://nodejs.org/
echo 2. Baixe a versão LTS (recomendada)
echo 3. Instale e reinicie este script
echo.
echo ════════════════════════════════════════════════════════
pause
exit /b 1

:ERRO_INSTALL
color 0C
cls
echo ╔════════════════════════════════════════════════════════╗
echo ║              ERRO NA INSTALAÇÃO                        ║
echo ╚════════════════════════════════════════════════════════╝
echo.
echo [X] Falha ao instalar as dependências do sistema.
echo.
echo POSSÍVEIS CAUSAS:
echo • Sem conexão com a internet
echo • npm não está configurado corretamente
echo • Permissões insuficientes
echo.
echo SOLUÇÕES:
echo 1. Verifique sua conexão com a internet
echo 2. Execute como Administrador
echo 3. Tente executar manualmente: npm install
echo.
echo ════════════════════════════════════════════════════════
pause
exit /b 1

:ERRO_ARQUIVO
color 0C
cls
echo ╔════════════════════════════════════════════════════════╗
echo ║           ERRO: ARQUIVO NÃO ENCONTRADO                 ║
echo ╚════════════════════════════════════════════════════════╝
echo.
echo [X] O arquivo 'api_server.js' não foi encontrado!
echo.
echo SOLUÇÃO:
echo • Certifique-se de que o arquivo api_server.js está
echo   na mesma pasta deste arquivo .bat
echo.
echo Pasta atual: %CD%
echo.
echo ════════════════════════════════════════════════════════
pause
exit /b 1

:ERRO_CRASH
color 0C
cls
echo ╔════════════════════════════════════════════════════════╗
echo ║         SERVIDOR PAROU INESPERADAMENTE                 ║
echo ╚════════════════════════════════════════════════════════╝
echo.
echo [!] O servidor encontrou um erro e foi encerrado.
echo.
echo VERIFIQUE:
echo • As mensagens de erro acima
echo • Se a porta 3000 já está em uso
echo • Se o arquivo api_server.js está correto
echo • Se o banco de dados não está corrompido
echo.
echo DICA: Verifique o arquivo de log para mais detalhes
echo.
echo ════════════════════════════════════════════════════════
pause
exit /b 1

:FIM_NORMAL
color 0A
echo.
echo ════════════════════════════════════════════════════════
echo [✓] Servidor encerrado normalmente
echo ════════════════════════════════════════════════════════
echo.
pause
exit /b 0

