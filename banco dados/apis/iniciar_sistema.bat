@echo off
setlocal
title SISTEMA BIOTESTE - SERVER LAUNCHER
color 0A

:: ==========================================
:: CONFIGURAÇÃO INICIAL
:: ==========================================
set "JS_FILE=api_server.js"
set "WINDOW_TITLE=BIOTESTE SERVER - LOGS EM TEMPO REAL"

cls
echo =================================================================
echo      BIOTESTE LABORATORIO - INSTALADOR E LAUNCHER AUTOMATICO
echo =================================================================
echo.

:: 1. VERIFICAR SE O NODE.JS ESTA INSTALADO
echo [1/5] Verificando instalacao do Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo [ERRO] O Node.js nao foi encontrado neste computador!
    echo.
    echo Por favor, baixe e instale o Node.js em: https://nodejs.org/
    echo Apos instalar, execute este arquivo novamente.
    echo.
    pause
    exit
)
echo        Node.js detectado com sucesso.
echo.

:: 2. VERIFICAR SE O ARQUIVO DO SISTEMA EXISTE
echo [2/5] Buscando arquivo do sistema (%JS_FILE%)...
if not exist "%JS_FILE%" (
    color 0C
    echo.
    echo [ERRO] O arquivo "%JS_FILE%" nao foi encontrado!
    echo.
    echo Certifique-se de que salvou o codigo do servidor com o nome:
    echo %JS_FILE%
    echo na mesma pasta que este arquivo .bat.
    echo.
    pause
    exit
)
echo        Arquivo encontrado.
echo.

:: 3. CONFIGURAR O AMBIENTE (package.json)
:: Necessário definir "type": "module" porque o código usa "import"
echo [3/5] Configurando ambiente Node.js (ES Modules)...
if not exist "package.json" (
    echo { > package.json
    echo   "name": "bioteste-server", >> package.json
    echo   "version": "1.0.0", >> package.json
    echo   "type": "module", >> package.json
    echo   "description": "Servidor Auto-Gerado", >> package.json
    echo   "main": "%JS_FILE%", >> package.json
    echo   "dependencies": {} >> package.json
    echo } >> package.json
    echo        Arquivo package.json criado.
) else (
    echo        Arquivo package.json ja existe. Verificando...
    findstr /C:"\"type\": \"module\"" package.json >nul
    if %errorlevel% neq 0 (
        echo        [AVISO] Adicionando suporte a ES Modules...
        :: Recria o arquivo se não for module, para garantir compatibilidade
        echo { > package.json
        echo   "name": "bioteste-server", >> package.json
        echo   "version": "1.0.0", >> package.json
        echo   "type": "module", >> package.json
        echo   "main": "%JS_FILE%" >> package.json
        echo } >> package.json
    )
)
echo.

:: 4. INSTALAR DEPENDENCIAS
echo [4/5] Instalando bibliotecas necessarias...
echo        Isso pode demorar um pouco na primeira vez...
echo.
:: Lista de pacotes extraída do seu código: express sqlite sqlite3 fs path multer bcryptjs jsonwebtoken cors
:: fs e path são nativos, não precisa instalar.
if not exist "node_modules" (
    call npm install express sqlite sqlite3 multer bcryptjs jsonwebtoken cors
) else (
    echo        Pasta node_modules detectada. Pulando instalacao pesada.
    echo        Verificando pacotes faltantes...
    call npm install
)
echo.

:: 5. CRIAR DIRETORIOS DO SISTEMA (Prevenção)
echo [5/5] Verificando estrutura de pastas...
if not exist "temp_uploads" mkdir "temp_uploads"
if not exist "backups_automaticos" mkdir "backups_automaticos"
echo        Pastas verificadas.
echo.

:: ==========================================
:: INICIAR O SISTEMA
:: ==========================================
cls
color 0B
echo =================================================================
echo                 SISTEMA PRONTO E INICIANDO
echo =================================================================
echo.
echo ARQUIVO: %JS_FILE%
echo STATUS : Rodando...
echo LOGS   : Veja abaixo em tempo real
echo.
echo Pressione CTRL+C para parar o servidor.
echo =================================================================
echo.

:run_server
title %WINDOW_TITLE% - ONLINE
:: Executa o servidor
node "%JS_FILE%"

:: Se o servidor cair (crashar), ele chega aqui
title %WINDOW_TITLE% - PARADO
color 0E
echo.
echo =================================================================
echo [ALERTA] O servidor parou ou caiu.
echo Reiniciando automaticamente em 5 segundos...
echo =================================================================
echo.
timeout /t 5
cls
echo Reiniciando sistema...
goto run_server
