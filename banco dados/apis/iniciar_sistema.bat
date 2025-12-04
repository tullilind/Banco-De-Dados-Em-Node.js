@echo off
chcp 65001 >nul
title Sistema Laboratório Bioteste - Instalador Serviço Windows v2.0
color 0B

:: ====================================================================
:: INSTALADOR AUTOMÁTICO DE SERVIÇO WINDOWS - BIOTESTE API
:: Versão 2.0 - Tudo em um único arquivo
:: ====================================================================

cd /d "%~dp0"

:MENU_PRINCIPAL
cls
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║    SISTEMA LABORATÓRIO BIOTESTE - GERENCIADOR DE SERVIÇO      ║
echo ║                      Versão 2.0 - Windows                      ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

:: Verificar status do serviço
sc query BiotesteAPI | find "RUNNING" >nul 2>&1
if %errorLevel% equ 0 (
    set STATUS=🟢 RODANDO
    color 0A
) else (
    sc query BiotesteAPI >nul 2>&1
    if %errorLevel% equ 0 (
        set STATUS=🟡 PARADO
        color 0E
    ) else (
        set STATUS=⚫ NÃO INSTALADO
        color 0B
    )
)

echo 📊 STATUS DO SERVIÇO: %STATUS%
echo.
echo ═══════════════════════════════════════════════════════════════
echo.
echo   [1] 📦 INSTALAR Serviço (primeira vez)
echo   [2] 🚀 INICIAR Serviço
echo   [3] ⏹️  PARAR Serviço
echo   [4] 🔄 REINICIAR Serviço
echo   [5] 🗑️  DESINSTALAR Serviço
echo   [6] 📋 Ver Status Detalhado
echo   [7] 📁 Abrir Logs
echo   [8] 🌐 Testar API no Navegador
echo   [9] ⚙️  Configurações Avançadas
echo   [0] ❌ Sair
echo.
echo ═══════════════════════════════════════════════════════════════
echo.
set /p OPCAO="Digite sua opção: "

if "%OPCAO%"=="1" goto INSTALAR
if "%OPCAO%"=="2" goto INICIAR_SERVICO
if "%OPCAO%"=="3" goto PARAR_SERVICO
if "%OPCAO%"=="4" goto REINICIAR_SERVICO
if "%OPCAO%"=="5" goto DESINSTALAR
if "%OPCAO%"=="6" goto STATUS_DETALHADO
if "%OPCAO%"=="7" goto ABRIR_LOGS
if "%OPCAO%"=="8" goto TESTAR_API
if "%OPCAO%"=="9" goto AVANCADO
if "%OPCAO%"=="0" goto SAIR
goto MENU_PRINCIPAL

:: ====================================================================
:: INSTALAÇÃO DO SERVIÇO
:: ====================================================================

:INSTALAR
cls
color 0A
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                  INSTALAÇÃO DO SERVIÇO WINDOWS                 ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

:: Verificar privilégios de administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    color 0C
    echo ❌ ERRO: Este instalador precisa de privilégios de ADMINISTRADOR
    echo.
    echo 👉 SOLUÇÃO:
    echo    1. Feche este programa
    echo    2. Clique com botão DIREITO neste arquivo .bat
    echo    3. Escolha "Executar como administrador"
    echo.
    pause
    goto MENU_PRINCIPAL
)

echo ✅ Privilégios de administrador confirmados
echo.

:: Verificar Node.js
echo [1/8] Verificando Node.js...
node --version >nul 2>&1
if %errorLevel% neq 0 (
    color 0C
    echo    ❌ Node.js NÃO encontrado!
    echo.
    echo    📥 Você precisa instalar o Node.js primeiro:
    echo       https://nodejs.org (versão LTS recomendada)
    echo.
    pause
    goto MENU_PRINCIPAL
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo    ✓ Node.js %NODE_VERSION% detectado
echo.

:: Verificar npm
echo [2/8] Verificando npm...
npm --version >nul 2>&1
if %errorLevel% neq 0 (
    color 0C
    echo    ❌ npm não encontrado!
    echo.
    pause
    goto MENU_PRINCIPAL
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo    ✓ npm %NPM_VERSION% detectado
echo.

:: Verificar arquivo principal
echo [3/8] Verificando arquivos do sistema...
if not exist "api_server.js" (
    color 0C
    echo    ❌ Arquivo 'api_server.js' não encontrado!
    echo.
    echo    💡 Certifique-se de que o arquivo api_server.js está na mesma pasta.
    echo.
    pause
    goto MENU_PRINCIPAL
)
echo    ✓ api_server.js encontrado
echo.

:: Criar package.json se não existir
echo [4/8] Configurando package.json...
if exist "package.json" (
    echo    ✓ package.json já existe
) else (
    echo    • Criando package.json...
    (
        echo {
        echo   "name": "bioteste-api-service",
        echo   "version": "2.0.0",
        echo   "description": "Laboratório Bioteste - API Backend Service",
        echo   "type": "module",
        echo   "main": "api_server.js",
        echo   "scripts": {
        echo     "start": "node api_server.js"
        echo   },
        echo   "author": "Bioteste Lab",
        echo   "license": "MIT"
        echo }
    ) > package.json
    echo    ✓ package.json criado
)
echo.

:: Criar estrutura de pastas
echo [5/8] Criando estrutura de pastas...
if not exist "temp_uploads" mkdir temp_uploads
if not exist "backups_automaticos" mkdir backups_automaticos
if not exist "logs_servico" mkdir logs_servico
echo    ✓ Pastas criadas
echo.

:: Instalar dependências principais
echo [6/8] Instalando dependências do projeto...
echo    (Isso pode levar alguns minutos)
echo.
call npm install express sqlite sqlite3 multer bcryptjs jsonwebtoken cors crypto >nul 2>&1
if %errorLevel% neq 0 (
    color 0C
    echo    ❌ Erro ao instalar dependências
    echo.
    pause
    goto MENU_PRINCIPAL
)
echo    ✓ Dependências instaladas
echo.

:: Instalar node-windows
echo [7/8] Instalando node-windows (gerenciador de serviços)...
call npm install -g node-windows >nul 2>&1
if %errorLevel% neq 0 (
    color 0C
    echo    ❌ Erro ao instalar node-windows
    echo.
    echo    💡 Tente executar manualmente: npm install -g node-windows
    echo.
    pause
    goto MENU_PRINCIPAL
)
echo    ✓ node-windows instalado
echo.

:: Criar script de instalação do serviço
echo [8/8] Criando e instalando serviço Windows...
call :CRIAR_SCRIPT_INSTALACAO
node __install_service_temp.js >nul 2>&1
if %errorLevel% neq 0 (
    color 0C
    echo    ❌ Erro ao instalar serviço
    echo.
    echo    💡 Verifique os logs ou tente manualmente
    echo.
    pause
    del __install_service_temp.js 2>nul
    goto MENU_PRINCIPAL
)
echo    ✓ Serviço instalado e iniciado

:: Limpar arquivo temporário
del __install_service_temp.js 2>nul

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                  ✅ INSTALAÇÃO CONCLUÍDA!                      ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo 🎉 Serviço "BiotesteAPI" instalado e iniciado com sucesso!
echo.
echo 📋 INFORMAÇÕES:
echo    • Nome: BiotesteAPI
echo    • Porta: 3000
echo    • Inicialização: Automática com Windows
echo    • Logs: pasta "logs_servico"
echo.
echo 🔧 GERENCIAR:
echo    Use este menu ou comandos do Windows:
echo    • Parar:    net stop BiotesteAPI
echo    • Iniciar:  net start BiotesteAPI
echo.
echo 🌐 TESTAR: http://localhost:3000/api/status
echo.
pause
goto MENU_PRINCIPAL

:: ====================================================================
:: INICIAR SERVIÇO
:: ====================================================================

:INICIAR_SERVICO
cls
echo.
echo 🚀 Iniciando serviço BiotesteAPI...
echo.
net start BiotesteAPI
if %errorLevel% equ 0 (
    color 0A
    echo.
    echo ✅ Serviço iniciado com sucesso!
    echo 🌐 API disponível em: http://localhost:3000
) else (
    color 0C
    echo.
    echo ❌ Erro ao iniciar serviço
    echo 💡 Verifique se já está rodando ou se há erros nos logs
)
echo.
pause
goto MENU_PRINCIPAL

:: ====================================================================
:: PARAR SERVIÇO
:: ====================================================================

:PARAR_SERVICO
cls
echo.
echo ⏹️  Parando serviço BiotesteAPI...
echo.
net stop BiotesteAPI
if %errorLevel% equ 0 (
    color 0E
    echo.
    echo ✅ Serviço parado com sucesso!
) else (
    color 0C
    echo.
    echo ❌ Erro ao parar serviço
)
echo.
pause
goto MENU_PRINCIPAL

:: ====================================================================
:: REINICIAR SERVIÇO
:: ====================================================================

:REINICIAR_SERVICO
cls
echo.
echo 🔄 Reiniciando serviço BiotesteAPI...
echo.
net stop BiotesteAPI
timeout /t 2 /nobreak >nul
net start BiotesteAPI
if %errorLevel% equ 0 (
    color 0A
    echo.
    echo ✅ Serviço reiniciado com sucesso!
) else (
    color 0C
    echo.
    echo ❌ Erro ao reiniciar serviço
)
echo.
pause
goto MENU_PRINCIPAL

:: ====================================================================
:: DESINSTALAR SERVIÇO
:: ====================================================================

:DESINSTALAR
cls
color 0C
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                  DESINSTALAÇÃO DO SERVIÇO                      ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo ⚠️  ATENÇÃO: Esta ação irá remover o serviço BiotesteAPI
echo.
echo 📋 O que será feito:
echo    • Parar o serviço
echo    • Remover do sistema Windows
echo    • Manter arquivos, banco de dados e backups
echo.
set /p CONFIRMA="Deseja continuar? (S/N): "

if /i not "%CONFIRMA%"=="S" (
    echo.
    echo ❌ Operação cancelada
    echo.
    pause
    goto MENU_PRINCIPAL
)

:: Verificar admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo ❌ Privilégios de administrador necessários
    pause
    goto MENU_PRINCIPAL
)

echo.
echo 🔧 Desinstalando serviço...
echo.

call :CRIAR_SCRIPT_DESINSTALACAO
node __uninstall_service_temp.js

del __uninstall_service_temp.js 2>nul

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║               ✅ DESINSTALAÇÃO CONCLUÍDA!                      ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo 🗑️  Serviço removido do Windows
echo 📁 Arquivos do projeto mantidos
echo 💾 Banco de dados preservado
echo.
pause
goto MENU_PRINCIPAL

:: ====================================================================
:: STATUS DETALHADO
:: ====================================================================

:STATUS_DETALHADO
cls
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                  STATUS DETALHADO DO SERVIÇO                   ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
sc query BiotesteAPI
echo.
echo ───────────────────────────────────────────────────────────────
echo.
sc qc BiotesteAPI
echo.
pause
goto MENU_PRINCIPAL

:: ====================================================================
:: ABRIR LOGS
:: ====================================================================

:ABRIR_LOGS
cls
echo.
echo 📁 Abrindo pasta de logs...
echo.
if exist "logs_servico" (
    start explorer.exe "logs_servico"
    echo ✅ Pasta aberta no Explorador
) else (
    echo ⚠️  Pasta de logs não encontrada
    echo 💡 Logs são criados após primeira execução
)
echo.
pause
goto MENU_PRINCIPAL

:: ====================================================================
:: TESTAR API
:: ====================================================================

:TESTAR_API
cls
echo.
echo 🌐 Abrindo API no navegador...
echo.
start http://localhost:3000/api/status
echo ✅ Navegador aberto
echo 🔗 URL: http://localhost:3000/api/status
echo.
pause
goto MENU_PRINCIPAL

:: ====================================================================
:: CONFIGURAÇÕES AVANÇADAS
:: ====================================================================

:AVANCADO
cls
color 0D
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                  CONFIGURAÇÕES AVANÇADAS                       ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo   [1] 📊 Ver Logs em Tempo Real
echo   [2] 🔧 Configurar Tipo de Inicialização
echo   [3] 💾 Informações do Sistema
echo   [4] 🗑️  Limpar Logs Antigos
echo   [5] 🔙 Voltar ao Menu Principal
echo.
set /p OPC_AV="Digite sua opção: "

if "%OPC_AV%"=="1" goto LOGS_TEMPO_REAL
if "%OPC_AV%"=="2" goto CONFIG_INIT
if "%OPC_AV%"=="3" goto INFO_SISTEMA
if "%OPC_AV%"=="4" goto LIMPAR_LOGS
if "%OPC_AV%"=="5" goto MENU_PRINCIPAL
goto AVANCADO

:LOGS_TEMPO_REAL
cls
echo.
echo 📊 Logs em Tempo Real - Pressione CTRL+C para sair
echo.
if exist "logs_servico\BiotesteAPI.out.log" (
    powershell -Command "Get-Content 'logs_servico\BiotesteAPI.out.log' -Wait -Tail 50"
) else (
    echo ⚠️  Arquivo de log não encontrado
)
pause
goto AVANCADO

:CONFIG_INIT
cls
echo.
echo 🔧 Configurar Tipo de Inicialização
echo.
echo   [1] Automático (padrão - inicia com Windows)
echo   [2] Manual (só inicia quando solicitado)
echo   [3] Desabilitado
echo   [4] Voltar
echo.
set /p TIPO_INIT="Digite sua opção: "

if "%TIPO_INIT%"=="1" sc config BiotesteAPI start= auto
if "%TIPO_INIT%"=="2" sc config BiotesteAPI start= demand
if "%TIPO_INIT%"=="3" sc config BiotesteAPI start= disabled

if "%TIPO_INIT%" neq "4" (
    echo.
    echo ✅ Configuração alterada!
)
pause
goto AVANCADO

:INFO_SISTEMA
cls
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                  INFORMAÇÕES DO SISTEMA                        ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo 🖥️  Sistema Operacional:
systeminfo | findstr /B /C:"Nome do sistema operacional" /C:"Versão do sistema"
echo.
echo 📁 Diretório do Projeto:
cd
echo.
echo 🔢 Versão Node.js:
node --version 2>nul || echo Não instalado
echo.
echo 📦 Versão npm:
npm --version 2>nul || echo Não instalado
echo.
echo 💾 Banco de Dados:
if exist "banco_de_dados.sqlite" (
    echo ✅ banco_de_dados.sqlite
    dir "banco_de_dados.sqlite" | findstr "banco_de_dados.sqlite"
) else (
    echo ⚠️  Não encontrado (será criado na primeira execução)
)
echo.
echo 📦 Dependências:
if exist "node_modules" (
    echo ✅ node_modules instalado
) else (
    echo ⚠️  node_modules não encontrado
)
echo.
pause
goto AVANCADO

:LIMPAR_LOGS
cls
echo.
echo 🗑️  Limpar Logs Antigos
echo.
echo ⚠️  Esta ação irá deletar TODOS os arquivos de log
echo.
set /p CONFIRMA_LIMPAR="Confirma? (S/N): "

if /i "%CONFIRMA_LIMPAR%"=="S" (
    if exist "logs_servico" (
        del /Q "logs_servico\*.*" 2>nul
        echo ✅ Logs limpos!
    ) else (
        echo ⚠️  Pasta não encontrada
    )
) else (
    echo ❌ Cancelado
)
echo.
pause
goto AVANCADO

:: ====================================================================
:: SAIR
:: ====================================================================

:SAIR
cls
echo.
echo 👋 Encerrando gerenciador...
echo.
timeout /t 1 /nobreak >nul
exit /b 0

:: ====================================================================
:: FUNÇÕES AUXILIARES - CRIAR SCRIPTS TEMPORÁRIOS
:: ====================================================================

:CRIAR_SCRIPT_INSTALACAO
(
echo const Service = require('node-windows'^).Service;
echo const path = require('path'^);
echo.
echo const svc = new Service({
echo     name: 'BiotesteAPI',
echo     description: 'Servidor API do Laboratório Bioteste - Sistema de Gestão',
echo     script: path.join(__dirname, 'api_server.js'^),
echo     nodeOptions: ['--harmony', '--max_old_space_size=4096'],
echo     workingDirectory: __dirname,
echo     allowServiceLogon: true,
echo     logpath: path.join(__dirname, 'logs_servico'^)
echo }^);
echo.
echo svc.on('install', function(^) {
echo     console.log('✅ Serviço instalado com sucesso!'^);
echo     console.log('🚀 Iniciando serviço...'^);
echo     svc.start(^);
echo }^);
echo.
echo svc.on('start', function(^) {
echo     console.log('✅ Serviço rodando!'^);
echo }^);
echo.
echo svc.on('error', function(err^) {
echo     console.error('❌ Erro:', err^);
echo }^);
echo.
echo if (svc.exists^) {
echo     console.log('⚠️  Serviço já instalado!'^);
echo     process.exit(0^);
echo } else {
echo     svc.install(^);
echo }
) > __install_service_temp.js
goto :eof

:CRIAR_SCRIPT_DESINSTALACAO
(
echo const Service = require('node-windows'^).Service;
echo const path = require('path'^);
echo.
echo const svc = new Service({
echo     name: 'BiotesteAPI',
echo     script: path.join(__dirname, 'api_server.js'^)
echo }^);
echo.
echo svc.on('uninstall', function(^) {
echo     console.log('✅ Serviço desinstalado!'^);
echo     process.exit(0^);
echo }^);
echo.
echo if (!svc.exists^) {
echo     console.log('⚠️  Serviço não está instalado.'^);
echo     process.exit(0^);
echo }
echo.
echo svc.uninstall(^);
) > __uninstall_service_temp.js
goto :eof