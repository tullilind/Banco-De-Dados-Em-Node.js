// api_server.js
// SERVIDOR BACKEND "ULTIMATE" - LABORATÓRIO BIOTESTE
// Versão: Final Completa e Funcional

// =================================================================
// 1. IMPORTAÇÕES E CONFIGURAÇÕES
// =================================================================
import express from 'express';           
import { open } from 'sqlite';           
import sqlite3 from 'sqlite3';           
import fs from 'fs';                     
import path from 'path';                 
import multer from 'multer';             
import bcrypt from 'bcryptjs';           
import jwt from 'jsonwebtoken';          
import cors from 'cors';                 

const app = express();
const PORT = 3000;
const DB_FILE = './banco_de_dados.sqlite';
const JWT_SECRET = 'BIOTESTE_KEY_MASTER_2024_SECURE'; 
const EMAIL_API = 'https://script.google.com/macros/s/AKfycbwRSQt1nsmkaIAEXZo4MbpLsf4yw6MwuXKowlggvaDJD0wNJR9BdyuseXEuKuiRL2mj9g/exec';

// Configuração de diretórios
const TEMP_UPLOADS_DIR = './temp_uploads';
const BACKUPS_DIR = './backups_automaticos'; 

// Garante que pastas existam
if (!fs.existsSync(TEMP_UPLOADS_DIR)) fs.mkdirSync(TEMP_UPLOADS_DIR);
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR);

const upload = multer({ dest: TEMP_UPLOADS_DIR });

// --- SEGURANÇA: RATE LIMITER ---
const rateLimitMap = new Map();
const rateLimiter = (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();
    if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, { count: 1, start: now });
    
    const data = rateLimitMap.get(ip);
    if (now - data.start > 900000) rateLimitMap.set(ip, { count: 1, start: now }); 
    
    if (data.count > 2000) return res.status(429).json({ error: "Muitas requisições. Aguarde." });
    
    data.count++;
    next();
};

app.disable('x-powered-by');
app.use(cors());
app.use(rateLimiter);
app.use(express.json({ limit: '100mb' }));

let db;

// =================================================================
// 2. FUNÇÕES AUXILIARES
// =================================================================

async function registrarLog(usuario, acao, detalhes) {
    try {
        const dataHora = new Date().toLocaleString('pt-BR');
        const autor = usuario ? (usuario.usuario || usuario.cpf || `ID: ${usuario.id}`) : 'Sistema/Anônimo';
        
        if(db) {
            await db.run(
                `INSERT INTO Logs_Sistema (autor, acao, detalhes, data_hora) VALUES (?, ?, ?, ?)`,
                autor, acao, JSON.stringify(detalhes || {}), dataHora
            );
        }
        console.log(`[LOG] ${autor}: ${acao}`);
    } catch (e) {
        console.error("Falha ao gravar log:", e.message);
    }
}

function gerarTokenRecuperacao() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

async function enviarEmail({ para, assunto, mensagem }) {
    try {
        const params = new URLSearchParams({ to: para, subject: assunto, message: mensagem }).toString();
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 5000);
        await fetch(`${EMAIL_API}?${params}`, { signal: controller.signal }).catch(() => {});
        clearTimeout(id);
    } catch (e) { console.error("Erro envio email:", e.message); }
}

// =================================================================
// 3. BANCO DE DADOS
// =================================================================

async function iniciarBancoDados() {
    if (!db) db = await open({ filename: DB_FILE, driver: sqlite3.Database });
    await db.run('PRAGMA foreign_keys = ON;');
    await db.run('PRAGMA journal_mode = WAL;'); 

    // TABELAS
    await db.exec(`CREATE TABLE IF NOT EXISTS Usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL, cpf TEXT UNIQUE NOT NULL, senha TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
        foto_base64 TEXT, acesso TEXT NOT NULL, data_nascimento TEXT,
        recovery_token TEXT, token_expiry INTEGER, data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS Funcionarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL, usuario TEXT UNIQUE NOT NULL, senha TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
        cargo TEXT, foto_base64 TEXT, recovery_token TEXT, token_expiry INTEGER, ativo INTEGER DEFAULT 1
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS Exames (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE, nome TEXT NOT NULL, preco REAL, prazo_dias INTEGER, instrucoes_coleta TEXT, ativo INTEGER DEFAULT 1
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS Agendamentos_Domiciliares (
        id_pedido INTEGER PRIMARY KEY AUTOINCREMENT,
        id_usuario INTEGER, nome_paciente TEXT, cpf_paciente TEXT, data_nascimento_paciente TEXT,
        cidade TEXT, bairro TEXT, referencia TEXT, possui_plano INTEGER, qual_plano TEXT,
        data_hora_agendamento TEXT, observacoes_cliente TEXT, arquivos_pedidos_json TEXT,
        foto_rg_frente_base64 TEXT, foto_rg_verso_base64 TEXT, valor_exames_coleta REAL,
        status_solicitacao TEXT DEFAULT 'Pendente', id_atendente INTEGER, nome_atendente TEXT,
        observacoes_laboratorio TEXT,
        FOREIGN KEY (id_usuario) REFERENCES Usuarios(id)
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS Atendimentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_usuario INTEGER, nome_paciente TEXT, unidade TEXT, plano_convenio TEXT,
        data_entrada TEXT, data_resultado TEXT, status TEXT DEFAULT 'Em Análise',
        FOREIGN KEY (id_usuario) REFERENCES Usuarios(id)
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS Relatorios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_usuario INTEGER, titulo TEXT, arquivo_base64 TEXT, unidade TEXT,
        data_upload DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (id_usuario) REFERENCES Usuarios(id)
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS Notificacoes (
        id_notificacao INTEGER PRIMARY KEY AUTOINCREMENT,
        id_usuario INTEGER, titulo TEXT, mensagem TEXT, data DATETIME DEFAULT CURRENT_TIMESTAMP, lida INTEGER DEFAULT 0,
        FOREIGN KEY (id_usuario) REFERENCES Usuarios(id)
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS Logs_Sistema (
        id INTEGER PRIMARY KEY AUTOINCREMENT, autor TEXT, acao TEXT, detalhes TEXT, data_hora TEXT
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS Horarios_Agendamento (
        id INTEGER PRIMARY KEY AUTOINCREMENT, dia TEXT NOT NULL, horario TEXT NOT NULL,
        status TEXT DEFAULT 'disponivel', UNIQUE(dia, horario)
    )`);

    console.log('✅ Banco de Dados Conectado e Otimizado.');

    const admin = await db.get("SELECT id FROM Usuarios WHERE cpf='000'");
    if (!admin) {
        const hash = await bcrypt.hash('admin', 10);
        await db.run("INSERT INTO Usuarios (nome, cpf, senha, email, acesso) VALUES (?,?,?,?,?)", 
            'Super Admin', '000', hash, 'admin@lab.com', 'ADM');
        console.log('👤 Usuário Admin criado: CPF=000, Senha=admin');
    }
}

// =================================================================
// 4. MIDDLEWARES DE AUTH
// =================================================================

const autenticar = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Token não fornecido" });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ error: "Token inválido" });
        req.user = decoded;
        next();
    });
};

const isAdminOrStaff = (req, res, next) => {
    if (req.user.acesso === 'ADM' || req.user.tipo === 'Funcionario') next();
    else res.status(403).json({ error: "Acesso restrito" });
};

// =================================================================
// 5. SISTEMA DE BACKUP E RESTAURAÇÃO
// =================================================================

app.get('/api/admin/backup', autenticar, isAdminOrStaff, async (req, res) => {
    try {
        const date = new Date();
        const dateStr = date.toISOString().slice(0,10);
        const timeStr = date.toTimeString().slice(0,5).replace(':','-');
        const backupName = `bioteste_backup_${dateStr}_${timeStr}.sqlite`;
        const tempPath = path.resolve(TEMP_UPLOADS_DIR, backupName);

        await db.run('PRAGMA wal_checkpoint(FULL)');
        await db.close();
        
        fs.copyFileSync(DB_FILE, tempPath);
        
        await iniciarBancoDados();
        await registrarLog(req.user, 'REALIZAR_BACKUP', { arquivo: backupName });

        res.download(tempPath, backupName, (err) => {
            if (!err) {
                try { fs.unlinkSync(tempPath); } catch(e){}
            } else {
                console.error("Erro no download:", err);
            }
        });
    } catch (erro) {
        try { await iniciarBancoDados(); } catch(e){}
        console.error(erro);
        res.status(500).json({ error: "Falha ao gerar backup." });
    }
});

app.post('/api/admin/restore', autenticar, isAdminOrStaff, upload.single('backup'), async (req, res) => {
    if(!req.file) return res.status(400).json({ error: "Arquivo de backup não enviado." });

    try {
        const novoDbPath = req.file.path;
        
        const buffer = Buffer.alloc(16);
        const fd = fs.openSync(novoDbPath, 'r');
        fs.readSync(fd, buffer, 0, 16, 0);
        fs.closeSync(fd);
        
        if (buffer.toString() !== 'SQLite format 3\0') {
            fs.unlinkSync(novoDbPath);
            return res.status(400).json({ error: "Arquivo inválido." });
        }

        const timestamp = Date.now();
        const safetyBackupPath = path.resolve(BACKUPS_DIR, `safety_before_restore_${timestamp}.sqlite`);
        
        await db.close();
        if (fs.existsSync(DB_FILE)) {
            fs.copyFileSync(DB_FILE, safetyBackupPath);
        }
        fs.renameSync(novoDbPath, DB_FILE);
        
        await iniciarBancoDados();
        await registrarLog(req.user, 'RESTAURAR_BACKUP', { status: 'Sucesso' });

        res.json({ success: true, message: "Sistema restaurado com sucesso!" });

    } catch (erro) {
        try { await iniciarBancoDados(); } catch(e){}
        res.status(500).json({ error: "Erro crítico na restauração." });
    }
});

app.get('/api/admin/logs', autenticar, isAdminOrStaff, async (req, res) => {
    const logs = await db.all("SELECT * FROM Logs_Sistema ORDER BY id DESC LIMIT 100");
    res.json({ success: true, data: logs });
});

// =================================================================
// 6. ROTAS: AUTH, USUÁRIOS E FUNCIONALIDADES
// =================================================================

// --- 6.1 CRUD DE USUÁRIOS ---
app.post('/api/usuarios', async (req, res) => {
    const { nome, cpf, senha, email, foto_base64, acesso, data_nascimento } = req.body;
    
    if (!nome || !cpf || !senha || !email) {
        return res.status(400).json({ error: "Dados incompletos (Nome, CPF, Senha, Email são obrigatórios)." });
    }

    try {
        const hash = await bcrypt.hash(senha, 10);
        const r = await db.run(
            `INSERT INTO Usuarios (nome, cpf, senha, email, foto_base64, acesso, data_nascimento) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            nome, cpf, hash, email, foto_base64, acesso || 'Paciente', data_nascimento
        );
        
        await registrarLog(null, 'CADASTRO_USUARIO', { id: r.lastID, nome });
        res.status(201).json({ success: true, id: r.lastID });
    } catch (e) {
        res.status(400).json({ error: "Erro ao criar usuário. CPF ou Email já cadastrados?" });
    }
});

app.get('/api/usuarios', autenticar, isAdminOrStaff, async (req, res) => {
    const lista = await db.all("SELECT id, nome, cpf, email, acesso, data_nascimento, data_criacao FROM Usuarios");
    res.json({ success: true, data: lista });
});

app.get('/api/usuarios/:id', autenticar, async (req, res) => {
    // Apenas o próprio usuário ou Admin/Staff pode ver detalhes
    if (req.user.tipo === 'Usuario' && req.user.id != req.params.id && req.user.acesso !== 'ADM') {
        return res.status(403).json({ error: "Proibido" });
    }
    
    const user = await db.get("SELECT id, nome, cpf, email, acesso, data_nascimento, foto_base64, data_criacao FROM Usuarios WHERE id = ?", req.params.id);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    
    res.json({ success: true, data: user });
});

app.put('/api/usuarios/:id', autenticar, async (req, res) => {
    if (req.user.tipo === 'Usuario' && req.user.id != req.params.id && req.user.acesso !== 'ADM') {
        return res.status(403).json({ error: "Proibido" });
    }
    
    const body = { ...req.body };
    delete body.id; // Previne alteração de ID
    
    if (body.senha) body.senha = await bcrypt.hash(body.senha, 10);
    
    const keys = Object.keys(body);
    if (keys.length === 0) return res.status(400).json({ error: "Sem dados para atualizar" });

    const sets = keys.map(k => `${k}=?`).join(',');
    const vals = Object.values(body);
    
    try {
        await db.run(`UPDATE Usuarios SET ${sets} WHERE id=?`, ...vals, req.params.id);
        await registrarLog(req.user, 'ATUALIZAR_USUARIO', { id: req.params.id });
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/usuarios/:id', autenticar, isAdminOrStaff, async (req, res) => {
    if (req.params.id === '1') {
        return res.status(400).json({ error: "Não é possível deletar o usuário admin" });
    }
    
    await db.run('DELETE FROM Usuarios WHERE id = ?', req.params.id);
    await registrarLog(req.user, 'DELETAR_USUARIO', { id: req.params.id });
    res.json({ success: true });
});

// --- 6.2 AUTH E RECUPERAÇÃO ---

app.post('/api/auth/login', async (req, res) => {
    const { cpf, senha } = req.body;
    try {
        const user = await db.get("SELECT * FROM Usuarios WHERE cpf = ?", cpf);
        if (!user || !(await bcrypt.compare(senha, user.senha))) {
            return res.status(401).json({ error: "CPF ou senha inválidos" });
        }
        
        const token = jwt.sign({ id: user.id, tipo: 'Usuario', acesso: user.acesso }, JWT_SECRET, { expiresIn: '24h' });
        await registrarLog(user, 'LOGIN', { ip: req.ip });
        
        const { senha: _, recovery_token, token_expiry, ...dados } = user;
        res.json({ success: true, token, user: dados });
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

app.post('/api/auth/funcionario/login', async (req, res) => {
    const { usuario, senha } = req.body;
    try {
        const func = await db.get("SELECT * FROM Funcionarios WHERE usuario = ?", usuario);
        if (!func || !(await bcrypt.compare(senha, func.senha))) {
            return res.status(401).json({ error: "Usuário ou senha inválidos" });
        }
        if (!func.ativo) return res.status(403).json({ error: "Funcionário inativo" });
        
        const token = jwt.sign({ id: func.id, tipo: 'Funcionario', acesso: 'Funcionario', cargo: func.cargo }, JWT_SECRET, { expiresIn: '12h' });
        await registrarLog({ usuario: func.usuario }, 'LOGIN_FUNC', { ip: req.ip });
        
        const { senha: _, recovery_token, token_expiry, ...dados } = func;
        res.json({ success: true, token, user: dados });
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

app.post('/api/auth/recuperar', async (req, res) => {
    await recuperarSenha('Usuarios', req.body.email);
    res.json({ success: true, message: "Se o email existir, você receberá instruções em breve." });
});

app.post('/api/auth/funcionario/recuperar', async (req, res) => {
    await recuperarSenha('Funcionarios', req.body.email);
    res.json({ success: true, message: "Se o email existir, você receberá instruções em breve." });
});

app.post('/api/auth/resetar-senha', async (req, res) => {
    const { email, token, novaSenha, tipo } = req.body;
    const tabela = tipo === 'funcionario' ? 'Funcionarios' : 'Usuarios';
    
    try {
        const user = await db.get(`SELECT * FROM ${tabela} WHERE email = ? AND recovery_token = ?`, email, token);
        
        if (!user || user.token_expiry < Date.now()) {
            return res.status(400).json({ error: "Token inválido ou expirado" });
        }
        
        const hash = await bcrypt.hash(novaSenha, 10);
        await db.run(`UPDATE ${tabela} SET senha = ?, recovery_token = NULL, token_expiry = NULL WHERE id = ?`, hash, user.id);
        await registrarLog(user, 'RESETAR_SENHA', { email });
        
        res.json({ success: true, message: "Senha alterada com sucesso!" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const recuperarSenha = async (tabela, email) => {
    const user = await db.get(`SELECT * FROM ${tabela} WHERE email = ?`, email);
    if (user) {
        const code = gerarTokenRecuperacao();
        await db.run(`UPDATE ${tabela} SET recovery_token = ?, token_expiry = ? WHERE id = ?`, code, Date.now() + 3600000, user.id);
        await enviarEmail({ 
            para: email, 
            assunto: "Recuperação de Senha - Bioteste", 
            mensagem: `Seu código de recuperação é: ${code}\n\nEste código expira em 1 hora.` 
        });
    }
};

// --- 6.3 AGENDAMENTOS ---
app.post('/api/agendamentos', autenticar, async (req, res) => {
    const d = req.body;
    const arquivosJson = JSON.stringify(d.arquivos_pedidos || []);
    try {
        const r = await db.run(`INSERT INTO Agendamentos_Domiciliares (
            id_usuario, nome_paciente, cpf_paciente, data_nascimento_paciente,
            cidade, bairro, referencia, possui_plano, qual_plano,
            data_hora_agendamento, observacoes_cliente, arquivos_pedidos_json,
            foto_rg_frente_base64, foto_rg_verso_base64
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, 
        d.id_usuario || req.user.id, d.nome_paciente, d.cpf_paciente, d.data_nascimento_paciente,
        d.cidade, d.bairro, d.referencia, d.possui_plano, d.qual_plano,
        d.data_hora_agendamento, d.observacoes_cliente, arquivosJson,
        d.foto_rg_frente_base64, d.foto_rg_verso_base64);
        
        await registrarLog(req.user, 'NOVO_AGENDAMENTO', { id: r.lastID });
        
        // Criar notificação para o usuário
        await db.run(
            `INSERT INTO Notificacoes (id_usuario, titulo, mensagem) VALUES (?, ?, ?)`,
            d.id_usuario || req.user.id,
            'Agendamento Criado',
            `Seu agendamento domiciliar foi registrado com sucesso!`
        );
        
        res.status(201).json({ success: true, id: r.lastID });
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

app.get('/api/agendamentos', autenticar, async (req, res) => {
    let q = "SELECT * FROM Agendamentos_Domiciliares ORDER BY data_hora_agendamento DESC";
    let p = [];
    
    if (req.user.tipo === 'Usuario' && req.user.acesso !== 'ADM') {
        q = "SELECT * FROM Agendamentos_Domiciliares WHERE id_usuario = ? ORDER BY data_hora_agendamento DESC";
        p = [req.user.id];
    }
    
    const l = await db.all(q, p);
    const f = l.map(i => ({ 
        ...i, 
        arquivos_pedidos: JSON.parse(i.arquivos_pedidos_json || '[]'), 
        arquivos_pedidos_json: undefined 
    }));
    
    res.json({ success: true, data: f });
});

app.get('/api/agendamentos/:id', autenticar, async (req, res) => {
    const agendamento = await db.get("SELECT * FROM Agendamentos_Domiciliares WHERE id_pedido = ?", req.params.id);
    
    if (!agendamento) {
        return res.status(404).json({ error: "Agendamento não encontrado" });
    }
    
    // Verifica permissão
    if (req.user.tipo === 'Usuario' && req.user.acesso !== 'ADM' && agendamento.id_usuario !== req.user.id) {
        return res.status(403).json({ error: "Acesso negado" });
    }
    
    agendamento.arquivos_pedidos = JSON.parse(agendamento.arquivos_pedidos_json || '[]');
    delete agendamento.arquivos_pedidos_json;
    
    res.json({ success: true, data: agendamento });
});

app.put('/api/agendamentos/:id', autenticar, isAdminOrStaff, async (req, res) => {
    const { status_solicitacao, valor_exames_coleta, observacoes_laboratorio, nome_atendente } = req.body;
    
    try {
        await db.run(
            `UPDATE Agendamentos_Domiciliares 
             SET status_solicitacao=?, valor_exames_coleta=?, observacoes_laboratorio=?, nome_atendente=?, id_atendente=?
             WHERE id_pedido=?`,
            status_solicitacao, valor_exames_coleta, observacoes_laboratorio, 
            nome_atendente || req.user.nome, req.user.id, req.params.id
        );
        
        await registrarLog(req.user, 'ATUALIZAR_AGENDAMENTO', { id: req.params.id, status: status_solicitacao });
        
        // Notificar usuário sobre mudança de status
        const agendamento = await db.get("SELECT id_usuario FROM Agendamentos_Domiciliares WHERE id_pedido = ?", req.params.id);
        if (agendamento) {
            await db.run(
                `INSERT INTO Notificacoes (id_usuario, titulo, mensagem) VALUES (?, ?, ?)`,
                agendamento.id_usuario,
                'Status Atualizado',
                `Seu agendamento foi atualizado para: ${status_solicitacao}`
            );
        }
        
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/agendamentos/:id', autenticar, isAdminOrStaff, async (req, res) => {
    await db.run("DELETE FROM Agendamentos_Domiciliares WHERE id_pedido = ?", req.params.id);
    await registrarLog(req.user, 'DELETAR_AGENDAMENTO', { id: req.params.id });
    res.json({ success: true });
});

// --- 6.4 AGENDA / HORÁRIOS ---
app.post('/api/horarios', autenticar, isAdminOrStaff, async (req, res) => {
    const { dia, horarios } = req.body;
    let count = 0;
    
    if(Array.isArray(horarios)) {
        for(const h of horarios) {
            try { 
                await db.run(`INSERT INTO Horarios_Agendamento (dia, horario) VALUES (?,?)`, dia, h); 
                count++; 
            } catch(e){
                console.log(`Horário ${h} já existe para ${dia}`);
            }
        }
    }
    
    await registrarLog(req.user, 'CRIAR_HORARIOS', { dia, count });
    res.json({ success: true, count });
});

app.get('/api/horarios', autenticar, async (req, res) => {
    const { dia } = req.query;
    let q = "SELECT * FROM Horarios_Agendamento";
    let p = [];
    
    if(dia) { 
        q += " WHERE dia = ?"; 
        p.push(dia); 
    }
    
    q += " ORDER BY dia, horario";
    const l = await db.all(q, p);
    res.json({ success: true, data: l });
});

app.put('/api/horarios/:id', autenticar, async (req, res) => {
    const { status } = req.body;
    await db.run("UPDATE Horarios_Agendamento SET status = ? WHERE id = ?", status, req.params.id);
    await registrarLog(req.user, 'ATUALIZAR_HORARIO', { id: req.params.id, status });
    res.json({ success: true });
});

app.delete('/api/horarios/:id', autenticar, isAdminOrStaff, async (req, res) => {
    await db.run("DELETE FROM Horarios_Agendamento WHERE id = ?", req.params.id);
    await registrarLog(req.user, 'DELETAR_HORARIO', { id: req.params.id });
    res.json({ success: true });
});

// --- 6.5 EXAMES ---
app.get('/api/exames', async (req, res) => {
    const l = await db.all("SELECT * FROM Exames WHERE ativo=1 ORDER BY nome");
    res.json({ success: true, data: l });
});

app.get('/api/exames/:id', autenticar, async (req, res) => {
    const exame = await db.get("SELECT * FROM Exames WHERE id = ?", req.params.id);
    if (!exame) return res.status(404).json({ error: "Exame não encontrado" });
    res.json({ success: true, data: exame });
});

app.post('/api/exames', autenticar, isAdminOrStaff, async (req, res) => {
    const { codigo, nome, preco, prazo_dias, instrucoes_coleta } = req.body;
    
    try {
        const r = await db.run(
            "INSERT INTO Exames (codigo, nome, preco, prazo_dias, instrucoes_coleta) VALUES (?,?,?,?,?)", 
            codigo, nome, preco, prazo_dias, instrucoes_coleta
        );
        await registrarLog(req.user, 'CRIAR_EXAME', { nome, id: r.lastID });
        res.status(201).json({ success: true, id: r.lastID });
    } catch (e) {
        res.status(400).json({ error: "Erro ao criar exame. Código já existe?" });
    }
});

app.put('/api/exames/:id', autenticar, isAdminOrStaff, async (req, res) => {
    const { codigo, nome, preco, prazo_dias, instrucoes_coleta } = req.body;
    
    const keys = Object.keys(req.body).filter(k => req.body[k] !== undefined);
    if (keys.length === 0) return res.status(400).json({ error: "Sem dados para atualizar" });
    
    const sets = keys.map(k => `${k}=?`).join(',');
    const vals = keys.map(k => req.body[k]);
    
    await db.run(`UPDATE Exames SET ${sets} WHERE id=?`, ...vals, req.params.id);
    await registrarLog(req.user, 'ATUALIZAR_EXAME', { id: req.params.id });
    res.json({ success: true });
});

app.delete('/api/exames/:id', autenticar, isAdminOrStaff, async (req, res) => {
    await db.run("UPDATE Exames SET ativo=0 WHERE id=?", req.params.id);
    await registrarLog(req.user, 'DESATIVAR_EXAME', { id: req.params.id });
    res.json({ success: true });
});

// --- 6.6 FUNCIONÁRIOS ---
app.post('/api/funcionarios', autenticar, isAdminOrStaff, async (req, res) => {
    const { nome, usuario, senha, email, cargo, foto_base64 } = req.body;
    
    if (!nome || !usuario || !senha || !email) {
        return res.status(400).json({ error: "Dados incompletos" });
    }
    
    try {
        const hash = await bcrypt.hash(senha, 10);
        const r = await db.run(
            "INSERT INTO Funcionarios (nome, usuario, senha, email, cargo, foto_base64) VALUES (?,?,?,?,?,?)", 
            nome, usuario, hash, email, cargo, foto_base64
        );
        await registrarLog(req.user, 'CRIAR_FUNCIONARIO', { usuario, id: r.lastID });
        res.status(201).json({ success: true, id: r.lastID });
    } catch (e) { 
        res.status(400).json({ error: "Erro. Usuário ou email já cadastrados?" }); 
    }
});

app.get('/api/funcionarios', autenticar, isAdminOrStaff, async (req, res) => {
    const l = await db.all("SELECT id, nome, usuario, email, cargo, ativo FROM Funcionarios");
    res.json({ success: true, data: l });
});

app.get('/api/funcionarios/:id', autenticar, isAdminOrStaff, async (req, res) => {
    const func = await db.get("SELECT id, nome, usuario, email, cargo, foto_base64, ativo FROM Funcionarios WHERE id = ?", req.params.id);
    if (!func) return res.status(404).json({ error: "Funcionário não encontrado" });
    res.json({ success: true, data: func });
});

app.put('/api/funcionarios/:id', autenticar, isAdminOrStaff, async (req, res) => {
    const body = { ...req.body };
    delete body.id;
    
    if (body.senha) body.senha = await bcrypt.hash(body.senha, 10);
    
    const keys = Object.keys(body).filter(k => body[k] !== undefined);
    if (keys.length === 0) return res.status(400).json({ error: "Sem dados para atualizar" });
    
    const sets = keys.map(k => `${k}=?`).join(',');
    const vals = keys.map(k => body[k]);
    
    await db.run(`UPDATE Funcionarios SET ${sets} WHERE id=?`, ...vals, req.params.id);
    await registrarLog(req.user, 'ATUALIZAR_FUNCIONARIO', { id: req.params.id });
    res.json({ success: true });
});

app.delete('/api/funcionarios/:id', autenticar, isAdminOrStaff, async (req, res) => {
    await db.run("UPDATE Funcionarios SET ativo=0 WHERE id = ?", req.params.id);
    await registrarLog(req.user, 'DESATIVAR_FUNCIONARIO', { id: req.params.id });
    res.json({ success: true });
});

// --- 6.7 ATENDIMENTOS ---
app.post('/api/atendimentos', autenticar, async (req, res) => {
    const { id_usuario, nome_paciente, unidade, plano_convenio, data_entrada } = req.body;
    
    try {
        const r = await db.run(
            `INSERT INTO Atendimentos (id_usuario, nome_paciente, unidade, plano_convenio, data_entrada) 
             VALUES (?,?,?,?,?)`,
            id_usuario || req.user.id, nome_paciente, unidade, plano_convenio, data_entrada
        );
        await registrarLog(req.user, 'CRIAR_ATENDIMENTO', { id: r.lastID });
        res.status(201).json({ success: true, id: r.lastID });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/atendimentos', autenticar, async (req, res) => {
    let q = "SELECT * FROM Atendimentos ORDER BY data_entrada DESC";
    let p = [];
    
    if (req.user.tipo === 'Usuario' && req.user.acesso !== 'ADM') {
        q = "SELECT * FROM Atendimentos WHERE id_usuario = ? ORDER BY data_entrada DESC";
        p = [req.user.id];
    }
    
    const l = await db.all(q, p);
    res.json({ success: true, data: l });
});

app.put('/api/atendimentos/:id', autenticar, isAdminOrStaff, async (req, res) => {
    const { status, data_resultado } = req.body;
    
    await db.run(
        "UPDATE Atendimentos SET status=?, data_resultado=? WHERE id=?",
        status, data_resultado, req.params.id
    );
    
    await registrarLog(req.user, 'ATUALIZAR_ATENDIMENTO', { id: req.params.id, status });
    
    // Notificar usuário
    const atend = await db.get("SELECT id_usuario FROM Atendimentos WHERE id = ?", req.params.id);
    if (atend && status === 'Concluído') {
        await db.run(
            `INSERT INTO Notificacoes (id_usuario, titulo, mensagem) VALUES (?, ?, ?)`,
            atend.id_usuario,
            'Resultado Disponível',
            'Seu resultado de exame está disponível!'
        );
    }
    
    res.json({ success: true });
});

// --- 6.8 RELATÓRIOS ---
app.post('/api/relatorios', autenticar, isAdminOrStaff, upload.single('arquivo'), async (req, res) => {
    const { titulo, unidade, id_usuario } = req.body;
    let arquivo_base64 = req.body.arquivo_base64;
    
    if (req.file) {
        const fileBuffer = fs.readFileSync(req.file.path);
        arquivo_base64 = fileBuffer.toString('base64');
        fs.unlinkSync(req.file.path);
    }
    
    try {
        const r = await db.run(
            "INSERT INTO Relatorios (id_usuario, titulo, arquivo_base64, unidade) VALUES (?,?,?,?)",
            id_usuario, titulo, arquivo_base64, unidade
        );
        
        await registrarLog(req.user, 'CRIAR_RELATORIO', { id: r.lastID, titulo });
        
        // Notificar usuário
        if (id_usuario) {
            await db.run(
                `INSERT INTO Notificacoes (id_usuario, titulo, mensagem) VALUES (?, ?, ?)`,
                id_usuario,
                'Novo Relatório',
                `Relatório "${titulo}" foi disponibilizado`
            );
        }
        
        res.status(201).json({ success: true, id: r.lastID });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/relatorios', autenticar, async (req, res) => {
    let q = "SELECT id, id_usuario, titulo, unidade, data_upload FROM Relatorios ORDER BY data_upload DESC";
    let p = [];
    
    if (req.user.tipo === 'Usuario' && req.user.acesso !== 'ADM') {
        q = "SELECT id, id_usuario, titulo, unidade, data_upload FROM Relatorios WHERE id_usuario = ? ORDER BY data_upload DESC";
        p = [req.user.id];
    }
    
    const l = await db.all(q, p);
    res.json({ success: true, data: l });
});

app.get('/api/relatorios/:id', autenticar, async (req, res) => {
    const relatorio = await db.get("SELECT * FROM Relatorios WHERE id = ?", req.params.id);
    
    if (!relatorio) {
        return res.status(404).json({ error: "Relatório não encontrado" });
    }
    
    // Verifica permissão
    if (req.user.tipo === 'Usuario' && req.user.acesso !== 'ADM' && relatorio.id_usuario !== req.user.id) {
        return res.status(403).json({ error: "Acesso negado" });
    }
    
    res.json({ success: true, data: relatorio });
});

app.delete('/api/relatorios/:id', autenticar, isAdminOrStaff, async (req, res) => {
    await db.run("DELETE FROM Relatorios WHERE id = ?", req.params.id);
    await registrarLog(req.user, 'DELETAR_RELATORIO', { id: req.params.id });
    res.json({ success: true });
});

// --- 6.9 NOTIFICAÇÕES ---
app.get('/api/notificacoes', autenticar, async (req, res) => {
    const l = await db.all(
        "SELECT * FROM Notificacoes WHERE id_usuario = ? ORDER BY data DESC",
        req.user.id
    );
    res.json({ success: true, data: l });
});

app.put('/api/notificacoes/:id/ler', autenticar, async (req, res) => {
    await db.run(
        "UPDATE Notificacoes SET lida = 1 WHERE id_notificacao = ? AND id_usuario = ?",
        req.params.id, req.user.id
    );
    res.json({ success: true });
});

app.delete('/api/notificacoes/:id', autenticar, async (req, res) => {
    await db.run(
        "DELETE FROM Notificacoes WHERE id_notificacao = ? AND id_usuario = ?",
        req.params.id, req.user.id
    );
    res.json({ success: true });
});

// --- 6.10 ESTATÍSTICAS (Admin) ---
app.get('/api/admin/estatisticas', autenticar, isAdminOrStaff, async (req, res) => {
    try {
        const totalUsuarios = await db.get("SELECT COUNT(*) as count FROM Usuarios");
        const totalFuncionarios = await db.get("SELECT COUNT(*) as count FROM Funcionarios WHERE ativo=1");
        const totalExames = await db.get("SELECT COUNT(*) as count FROM Exames WHERE ativo=1");
        const totalAgendamentos = await db.get("SELECT COUNT(*) as count FROM Agendamentos_Domiciliares");
        const agendamentosPendentes = await db.get("SELECT COUNT(*) as count FROM Agendamentos_Domiciliares WHERE status_solicitacao='Pendente'");
        const atendimentosHoje = await db.get("SELECT COUNT(*) as count FROM Atendimentos WHERE DATE(data_entrada) = DATE('now')");
        
        res.json({
            success: true,
            data: {
                totalUsuarios: totalUsuarios.count,
                totalFuncionarios: totalFuncionarios.count,
                totalExames: totalExames.count,
                totalAgendamentos: totalAgendamentos.count,
                agendamentosPendentes: agendamentosPendentes.count,
                atendimentosHoje: atendimentosHoje.count
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- 6.11 ROTA DE TESTE ---
app.get('/api/status', (req, res) => {
    res.json({ 
        success: true, 
        message: "API Bioteste funcionando!", 
        timestamp: new Date().toISOString(),
        version: "1.0.0"
    });
});

// --- 6.12 ROTA 404 ---
app.use((req, res) => {
    res.status(404).json({ error: "Rota não encontrada" });
});

// =================================================================
// 7. TRATAMENTO DE ERROS GLOBAL
// =================================================================
app.use((err, req, res, next) => {
    console.error('Erro não tratado:', err);
    res.status(500).json({ error: "Erro interno do servidor" });
});

// =================================================================
// 8. INICIALIZAÇÃO E GRACEFUL SHUTDOWN
// =================================================================

iniciarBancoDados().then(() => {
    app.listen(PORT, () => {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🚀 BIOTESTE API SERVER - RODANDO`);
        console.log(`${'='.repeat(60)}`);
        console.log(`📡 Porta: ${PORT}`);
        console.log(`💾 Banco: ${DB_FILE}`);
        console.log(`🔐 Sistema de Autenticação: ATIVO`);
        console.log(`💾 Sistema de Backup: ATIVO`);
        console.log(`📂 Pasta Backups: ${BACKUPS_DIR}`);
        console.log(`📂 Pasta Uploads: ${TEMP_UPLOADS_DIR}`);
        console.log(`${'='.repeat(60)}\n`);
        console.log(`✅ Servidor pronto para receber requisições!`);
        console.log(`📖 Acesse: http://localhost:${PORT}/api/status\n`);
    });
}).catch(err => {
    console.error('❌ Erro ao iniciar servidor:', err);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n⚠️  Encerrando servidor...');
    if (db) {
        await db.close();
        console.log('✅ Banco de dados fechado');
    }
    console.log('👋 Servidor encerrado com sucesso!\n');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    if (db) await db.close();
    process.exit(0);
});