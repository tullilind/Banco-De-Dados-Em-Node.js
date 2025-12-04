@echo off
chcp 65001 >nul
title Sistema Laboratório Bioteste - Instalador Serviço Windows v2.1
color 0B

:: ====================================================================
:: INSTALADOR AUTOMÁTICO DE SERVIÇO WINDOWS - BIOTESTE API
:: Versão 2.1 - CORRIGIDO - Tudo em um único arquivo
:: ====================================================================

cd /d "%~dp0"

:MENU_PRINCIPAL
cls
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║    SISTEMA LABORATÓRIO BIOTESTE - GERENCIADOR DE SERVIÇO      ║
echo ║                      Versão 2.1 - Windows                      ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

:: Verificar status do serviço
sc query BiotesteAPI 2>nul | find "RUNNING" >nul 2>&1
if %errorLevel% equ 0 (
    set STATUS=🟢 RODANDO
    color 0A
) else (
    sc query BiotesteAPI 2>nul >nul 2>&1
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
echo    (Aguarde - isso pode levar alguns minutos...)
echo.

:: Limpar cache do npm primeiro
echo    • Limpando cache do npm...
call npm cache clean --force >nul 2>&1

:: Instalar pacotes um por um para melhor controle
echo    • Instalando express...
call npm install express --no-audit --no-fund --loglevel=error
if %errorLevel% neq 0 goto ERRO_NPM_INSTALL

echo    • Instalando sqlite e sqlite3...
call npm install sqlite sqlite3 --no-audit --no-fund --loglevel=error
if %errorLevel% neq 0 goto ERRO_NPM_INSTALL

echo    • Instalando multer...
call npm install multer --no-audit --no-fund --loglevel=error
if %errorLevel% neq 0 goto ERRO_NPM_INSTALL

echo    • Instalando bcryptjs...
call npm install bcryptjs --no-audit --no-fund --loglevel=error
if %errorLevel% neq 0 goto ERRO_NPM_INSTALL

echo    • Instalando jsonwebtoken...
call npm install jsonwebtoken --no-audit --no-fund --loglevel=error
if %errorLevel% neq 0 goto ERRO_NPM_INSTALL

echo    • Instalando cors...
call npm install cors --no-audit --no-fund --loglevel=error
if %errorLevel% neq 0 goto ERRO_NPM_INSTALL

echo.
echo    ✓ Todas as dependências instaladas com sucesso
echo.

:: Instalar node-windows
echo [7/8] Instalando node-windows (gerenciador de serviços)...
echo    (Aguarde...)
echo.

call npm install -g node-windows --no-audit --no-fund --loglevel=error
if %errorLevel% neq 0 goto ERRO_NODE_WINDOWS

echo.
echo    ✓ node-windows instalado com sucesso
echo.

:: Criar script de instalação do serviço
echo [8/8] Criando e instalando serviço Windows...
echo.

call :CRIAR_SCRIPT_INSTALACAO

echo    • Executando instalação do serviço...
node __install_service_temp.js
if %errorLevel% neq 0 goto ERRO_INSTALACAO_SERVICO

:: Aguardar serviço iniciar
echo    • Aguardando serviço iniciar...
timeout /t 3 /nobreak >nul

echo.
echo    ✓ Serviço instalado e iniciado com sucesso

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
:: TRATAMENTO DE ERROS
:: ====================================================================

:ERRO_NPM_INSTALL
color 0C
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                  ❌ ERRO NA INSTALAÇÃO                         ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo ❌ Erro ao instalar dependências do projeto
echo.
echo 💡 POSSÍVEIS CAUSAS:
echo    • Sem conexão com internet
echo    • Proxy/Firewall bloqueando npm
echo    • Falta de permissões
echo    • Repositórios do npm inacessíveis
echo.
echo 🔧 SOLUÇÕES:
echo    1. Verifique sua conexão de internet
echo    2. Desative temporariamente o antivírus/firewall
echo    3. Execute novamente como administrador
echo    4. Tente configurar proxy: npm config set proxy http://seu-proxy:porta
echo    5. Tente manualmente: npm install
echo.
echo 📌 Se o erro persistir, instale manualmente:
echo    npm install express sqlite sqlite3 multer bcryptjs jsonwebtoken cors
echo.
pause
del __install_service_temp.js 2>nul
goto MENU_PRINCIPAL

:ERRO_NODE_WINDOWS
color 0C
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                  ❌ ERRO NO NODE-WINDOWS                       ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo ❌ Erro ao instalar node-windows
echo.
echo 💡 POSSÍVEIS SOLUÇÕES:
echo    1. Verifique conexão com internet
echo    2. Execute como administrador
echo    3. Tente: npm install -g node-windows --force
echo    4. Limpe o cache: npm cache clean --force
echo.
pause
del __install_service_temp.js 2>nul
goto MENU_PRINCIPAL

:ERRO_INSTALACAO_SERVICO
color 0C
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                  ❌ ERRO AO CRIAR SERVIÇO                      ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo ❌ Erro ao instalar serviço Windows
echo.
echo 💡 VERIFIQUE:
echo    • Se o node-windows foi instalado corretamente
echo    • Se tem privilégios de administrador
echo    • Os logs acima para mais detalhes
echo    • Se já existe um serviço com o mesmo nome
echo.
echo 🔧 TENTE:
echo    1. Desinstale qualquer serviço anterior (opção 5)
echo    2. Reinicie o computador
echo    3. Execute novamente este instalador
echo.
pause
del __install_service_temp.js 2>nul
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

:: Aguardar conclusão
timeout /t 2 /nobreak >nul

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
sc query BiotesteAPI 2>nul
if %errorLevel% neq 0 (
    echo ⚠️  Serviço não está instalado
) else (
    echo.
    echo ───────────────────────────────────────────────────────────────
    echo.
    sc qc BiotesteAPI
)
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
echo   [5] 🔄 Reinstalar Dependências
echo   [6] 🔙 Voltar ao Menu Principal
echo.
set /p OPC_AV="Digite sua opção: "

if "%OPC_AV%"=="1" goto LOGS_TEMPO_REAL
if "%OPC_AV%"=="2" goto CONFIG_INIT
if "%OPC_AV%"=="3" goto INFO_SISTEMA
if "%OPC_AV%"=="4" goto LIMPAR_LOGS
if "%OPC_AV%"=="5" goto REINSTALAR_DEPS
if "%OPC_AV%"=="6" goto MENU_PRINCIPAL
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

:REINSTALAR_DEPS
cls
echo.
echo 🔄 Reinstalar Dependências
echo.
echo ⚠️  Esta ação irá reinstalar todos os pacotes npm
echo.
set /p CONFIRMA_REINSTALL="Confirma? (S/N): "

if /i not "%CONFIRMA_REINSTALL%"=="S" (
    echo ❌ Cancelado
    pause
    goto AVANCADO
)

echo.
echo 📦 Removendo node_modules...
if exist "node_modules" (
    rmdir /S /Q node_modules
)

echo 🔄 Reinstalando dependências...
call npm install
echo.
echo ✅ Concluído!
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
