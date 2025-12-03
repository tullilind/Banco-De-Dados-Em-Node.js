// api_server.js
// SERVIDOR BACKEND "ULTIMATE" - LABORATÓRIO BIOTESTE
// Versão: Final Corrigida e Completa (Sem Resumos)

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

// --- 6.1 CRUD DE USUÁRIOS (PARA FUNCIONAR O CADASTRO NO HTML) ---
app.post('/api/usuarios', async (req, res) => {
    const { nome, cpf, senha, email, foto_base64, acesso, data_nascimento } = req.body;
    
    // Validação básica
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
    const lista = await db.all("SELECT id, nome, cpf, email, acesso, data_nascimento FROM Usuarios");
    res.json({ success: true, data: lista });
});

app.put('/api/usuarios/:id', autenticar, async (req, res) => {
    // Apenas o próprio usuário ou Admin/Staff pode editar
    if (req.user.tipo === 'Usuario' && req.user.id != req.params.id) {
        return res.status(403).json({ error: "Proibido" });
    }
    
    const body = req.body;
    if (body.senha) body.senha = await bcrypt.hash(body.senha, 10);
    
    const keys = Object.keys(body);
    if (keys.length === 0) return res.status(400).json({ error: "Sem dados para atualizar" });

    const sets = keys.map(k => `${k}=?`).join(',');
    const vals = Object.values(body);
    
    try {
        await db.run(`UPDATE Usuarios SET ${sets} WHERE id=?`, ...vals, req.params.id);
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/usuarios/:id', autenticar, isAdminOrStaff, async (req, res) => {
    await db.run('DELETE FROM Usuarios WHERE id = ?', req.params.id);
    await registrarLog(req.user, 'DELETAR_USUARIO', { id: req.params.id });
    res.json({ success: true });
});

// --- 6.2 AUTH E RECUPERAÇÃO ---

app.post('/api/auth/login', async (req, res) => {
    const { cpf, senha } = req.body;
    try {
        const user = await db.get("SELECT * FROM Usuarios WHERE cpf = ?", cpf);
        if (!user || !(await bcrypt.compare(senha, user.senha))) return res.status(401).json({ error: "Inválido" });
        const token = jwt.sign({ id: user.id, tipo: 'Usuario', acesso: user.acesso }, JWT_SECRET, { expiresIn: '24h' });
        await registrarLog(user, 'LOGIN', { ip: req.ip });
        const { senha: _, ...dados } = user;
        res.json({ success: true, token, user: dados });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/funcionario/login', async (req, res) => {
    const { usuario, senha } = req.body;
    try {
        const func = await db.get("SELECT * FROM Funcionarios WHERE usuario = ?", usuario);
        if (!func || !(await bcrypt.compare(senha, func.senha))) return res.status(401).json({ error: "Inválido" });
        if (!func.ativo) return res.status(403).json({ error: "Inativo" });
        const token = jwt.sign({ id: func.id, tipo: 'Funcionario', acesso: 'Funcionario', cargo: func.cargo }, JWT_SECRET, { expiresIn: '12h' });
        await registrarLog({ usuario: func.usuario }, 'LOGIN_FUNC', { ip: req.ip });
        const { senha: _, ...dados } = func;
        res.json({ success: true, token, user: dados });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/recuperar', async (req, res) => {
    await recuperarSenha('Usuarios', req.body.email);
    res.json({ success: true, message: "Enviado" });
});

app.post('/api/auth/funcionario/recuperar', async (req, res) => {
    await recuperarSenha('Funcionarios', req.body.email);
    res.json({ success: true, message: "Enviado" });
});

const recuperarSenha = async (tabela, email) => {
    const user = await db.get(`SELECT * FROM ${tabela} WHERE email = ?`, email);
    if (user) {
        const code = gerarTokenRecuperacao();
        await db.run(`UPDATE ${tabela} SET recovery_token = ?, token_expiry = ? WHERE id = ?`, code, Date.now() + 3600000, user.id);
        enviarEmail({ para: email, assunto: "Recuperar Senha", mensagem: `Código: ${code}` });
    }
};

// --- AGENDAMENTOS ---
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
        d.id_usuario, d.nome_paciente, d.cpf_paciente, d.data_nascimento_paciente,
        d.cidade, d.bairro, d.referencia, d.possui_plano, d.qual_plano,
        d.data_hora_agendamento, d.observacoes_cliente, arquivosJson,
        d.foto_rg_frente_base64, d.foto_rg_verso_base64);
        await registrarLog(req.user, 'NOVO_AGENDAMENTO', { id: r.lastID });
        res.status(201).json({ success: true, id: r.lastID });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/agendamentos', autenticar, async (req, res) => {
    let q = "SELECT * FROM Agendamentos_Domiciliares ORDER BY data_hora_agendamento DESC";
    let p = [];
    if (req.user.tipo === 'Usuario' && req.user.acesso !== 'ADM') {
        q = "SELECT * FROM Agendamentos_Domiciliares WHERE id_usuario = ? ORDER BY data_hora_agendamento DESC";
        p = [req.user.id];
    }
    const l = await db.all(q, p);
    const f = l.map(i => ({ ...i, arquivos_pedidos: JSON.parse(i.arquivos_pedidos_json || '[]'), arquivos_pedidos_json: undefined }));
    res.json({ success: true, data: f });
});

app.put('/api/agendamentos/:id', autenticar, isAdminOrStaff, async (req, res) => {
    const { status, valor, obs_lab, atendente } = req.body;
    await db.run(`UPDATE Agendamentos_Domiciliares SET status_solicitacao=?, valor_exames_coleta=?, observacoes_laboratorio=?, nome_atendente=? WHERE id_pedido=?`, status, valor, obs_lab, atendente, req.params.id);
    await registrarLog(req.user, 'ATUALIZAR_AGENDAMENTO', { id: req.params.id, status });
    res.json({ success: true });
});

// --- AGENDA / HORÁRIOS ---
app.post('/api/horarios', autenticar, isAdminOrStaff, async (req, res) => {
    const { dia, horarios } = req.body;
    let count = 0;
    if(Array.isArray(horarios)) {
        for(const h of horarios) {
            try { await db.run(`INSERT INTO Horarios_Agendamento (dia, horario) VALUES (?,?)`, dia, h); count++; } catch(e){}
        }
    }
    await registrarLog(req.user, 'CRIAR_HORARIOS', { dia, count });
    res.json({ success: true, count });
});

app.get('/api/horarios', autenticar, async (req, res) => {
    const { dia } = req.query;
    let q = "SELECT * FROM Horarios_Agendamento";
    let p = [];
    if(dia) { q += " WHERE dia = ?"; p.push(dia); }
    q += " ORDER BY dia, horario";
    const l = await db.all(q, p);
    res.json({ success: true, data: l });
});

app.put('/api/horarios/:id', autenticar, async (req, res) => {
    const { status } = req.body;
    await db.run("UPDATE Horarios_Agendamento SET status = ? WHERE id = ?", status, req.params.id);
    res.json({ success: true });
});

app.delete('/api/horarios/:id', autenticar, isAdminOrStaff, async (req, res) => {
    await db.run("DELETE FROM Horarios_Agendamento WHERE id = ?", req.params.id);
    res.json({ success: true });
});

// --- EXAMES ---
app.get('/api/exames', async (req, res) => {
    const l = await db.all("SELECT * FROM Exames WHERE ativo=1 ORDER BY nome");
    res.json({ success: true, data: l });
});

app.post('/api/exames', autenticar, isAdminOrStaff, async (req, res) => {
    const { codigo, nome, preco, instrucoes } = req.body;
    await db.run("INSERT INTO Exames (codigo, nome, preco, instrucoes_coleta) VALUES (?,?,?,?)", codigo, nome, preco, instrucoes);
    await registrarLog(req.user, 'CRIAR_EXAME', { nome });
    res.json({ success: true });
});

app.delete('/api/exames/:id', autenticar, isAdminOrStaff, async (req, res) => {
    await db.run("UPDATE Exames SET ativo=0 WHERE id=?", req.params.id);
    res.json({ success: true });
});

// --- FUNCIONÁRIOS ---
app.post('/api/funcionarios', autenticar, isAdminOrStaff, async (req, res) => {
    const { nome, usuario, senha, email, cargo } = req.body;
    try {
        const hash = await bcrypt.hash(senha, 10);
        await db.run("INSERT INTO Funcionarios (nome, usuario, senha, email, cargo) VALUES (?,?,?,?,?)", nome, usuario, hash, email, cargo);
        await registrarLog(req.user, 'CRIAR_FUNCIONARIO', { usuario });
        res.status(201).json({ success: true });
    } catch (e) { res.status(400).json({ error: "Erro" }); }
});

app.get('/api/funcionarios', autenticar, isAdminOrStaff, async (req, res) => {
    const l = await db.all("SELECT id, nome, usuario, email, cargo, ativo FROM Funcionarios");
    res.json({ success: true, data: l });
});

// =================================================================
// 7. INICIALIZAÇÃO
// =================================================================

iniciarBancoDados().then(() => {
    app.listen(PORT, () => {
        console.log(`\n🚀 BIOTESTE ULTIMATE SERVER - PORTA ${PORT}`);
        console.log(`💾 Sistema de Backup Profissional ATIVO`);
        console.log(`📂 Logs em: ${BACKUPS_DIR}`);
    });
});
