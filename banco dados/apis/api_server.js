// api_server.js
// SERVIDOR BACKEND COMPLETO - LABORATÓRIO BIOTESTE
// Versão Final: Auth JWT, Recuperação de Senha, Notificações, Backup, Email e CRUDs.

// 1. IMPORTAÇÕES DE MÓDULOS
import express from 'express';           // Framework Web
import { open } from 'sqlite';           // Conexão SQLite (Promise wrapper)
import sqlite3 from 'sqlite3';           // Driver SQLite
import fs from 'fs';                     // Sistema de Arquivos
import path from 'path';                 // Manipulação de Caminhos
import multer from 'multer';             // Upload de Arquivos (Backup)
import bcrypt from 'bcryptjs';           // Criptografia de Senhas
import jwt from 'jsonwebtoken';          // Tokens de Autenticação
import cors from 'cors';                 // Permite acesso de outros sites/apps (Front-end)

// Em Node 18+ o 'fetch' é nativo. Se usar versão antiga, descomente a linha abaixo:
// import fetch from 'node-fetch'; 

// 2. CONFIGURAÇÕES GERAIS
const app = express();
const PORT = 3000;
const DB_FILE = './banco_de_dados.sqlite'; // Arquivo do banco
const JWT_SECRET = '1526';                 // Chave secreta do JWT
const EMAIL_API = 'https://script.google.com/macros/s/AKfycbwRSQt1nsmkaIAEXZo4MbpLsf4yw6MwuXKowlggvaDJD0wNJR9BdyuseXEuKuiRL2mj9g/exec';

// Configuração de Upload Temporário (apenas para restaurar backup)
const upload = multer({ dest: 'temp_uploads/' });

// Middleware
app.use(cors()); // Libera acesso para qualquer Front-end (React, HTML, etc.)
app.use(express.json({ limit: '100mb' })); // Aumentado para 100MB para aceitar muitas fotos em Base64

// Variável Global de Conexão com Banco
let db;

// =================================================================
// 3. FUNÇÕES AUXILIARES (Email, Tokens, Logs)
// =================================================================

// Gera token aleatório para recuperação de senha
function gerarTokenRecuperacao() {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

// Envia E-mail usando o Google Apps Script
async function enviarEmail({ para, assunto, mensagem }) {
    try {
        const params = new URLSearchParams({
            to: para,
            subject: assunto || "Aviso Laboratório Bioteste",
            message: mensagem
        }).toString();

        const resp = await fetch(`${EMAIL_API}?${params}`, { method: 'GET' });
        const json = await resp.json();

        if (json.success) {
            console.log(`[EMAIL SUCESSO] Enviado para: ${para}`);
        } else {
            console.error(`[EMAIL FALHA] Erro ao enviar para ${para}:`, json);
        }
    } catch (erro) {
        console.error("[EMAIL CRÍTICO] Falha na conexão com API de Email:", erro.message);
    }
}

// =================================================================
// 4. BANCO DE DADOS: CRIAÇÃO DE TABELAS
// =================================================================

async function iniciarBancoDados() {
    try {
        if (!db) {
            db = await open({ filename: DB_FILE, driver: sqlite3.Database });
            console.log('✅ Banco de Dados conectado.');
        }

        // --- 1. TABELA USUÁRIOS ---
        // Guarda dados de login, perfil e fotos de perfil
        await db.exec(`
            CREATE TABLE IF NOT EXISTS Usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                cpf TEXT UNIQUE NOT NULL,
                senha TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                token TEXT,
                foto_base64 TEXT,
                acesso TEXT CHECK(acesso IN ('ADM', 'Funcionario', 'Paciente')) NOT NULL,
                data_nascimento TEXT,
                recovery_token TEXT,
                token_expiry INTEGER
            );
        `);

        // --- 2. TABELA AGENDAMENTOS DOMICILIARES ---
        // Tabela completa com todos os campos solicitados (frente/verso RG, pedido médico, etc.)
        await db.exec(`
            CREATE TABLE IF NOT EXISTS Agendamentos_Domiciliares (
                id_pedido INTEGER PRIMARY KEY AUTOINCREMENT,
                id_usuario INTEGER,
                nome_paciente TEXT NOT NULL,
                cpf_paciente TEXT,
                data_nascimento_paciente TEXT,
                cidade TEXT,
                bairro TEXT,
                referencia TEXT,
                possui_plano INTEGER,           -- 0 = Não, 1 = Sim
                qual_plano TEXT,
                data_hora_agendamento TEXT NOT NULL,
                observacoes_cliente TEXT,
                foto_rg_frente_base64 TEXT,
                foto_rg_verso_base64 TEXT,
                foto_pedido_medico_base64 TEXT,
                arquivos_suporte_base64 TEXT,   -- Pode ser JSON string ou base64 único
                status_solicitacao TEXT DEFAULT 'Pendente', -- Pendente, Confirmado, Cancelado
                valor_exames_coleta REAL,
                observacoes_laboratorio TEXT,
                id_atendente INTEGER,
                nome_atendente TEXT,
                forma_pagamento TEXT,
                status TEXT,                    -- Status geral do processo
                FOREIGN KEY (id_usuario) REFERENCES Usuarios(id),
                FOREIGN KEY (id_atendente) REFERENCES Usuarios(id)
            );
        `);

        // --- 3. TABELA ATENDIMENTOS (Geral/Presencial) ---
        await db.exec(`
            CREATE TABLE IF NOT EXISTS Atendimentos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                id_usuario INTEGER,
                nome_usuario TEXT,
                unidade TEXT NOT NULL,
                nome_paciente TEXT NOT NULL,
                plano_convenio TEXT,
                data_entrada TEXT NOT NULL,
                data_resultado TEXT,
                status TEXT DEFAULT 'Em Análise',
                FOREIGN KEY (id_usuario) REFERENCES Usuarios(id)
            );
        `);

        // --- 4. TABELA RELATÓRIOS (Arquivos e Laudos) ---
        await db.exec(`
            CREATE TABLE IF NOT EXISTS Relatorios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                id_usuario INTEGER,
                titulo TEXT,
                arquivo_base64 TEXT NOT NULL,
                unidade TEXT,
                data_upload TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (id_usuario) REFERENCES Usuarios(id)
            );
        `);

        // --- 5. TABELA NOTIFICAÇÕES ---
        await db.exec(`
            CREATE TABLE IF NOT EXISTS Notificacoes (
                id_notificacao INTEGER PRIMARY KEY AUTOINCREMENT,
                id_usuario INTEGER,
                titulo TEXT,
                mensagem TEXT NOT NULL,
                data TEXT DEFAULT CURRENT_TIMESTAMP,
                lida INTEGER DEFAULT 0, -- 0 = Não lida, 1 = Lida
                FOREIGN KEY (id_usuario) REFERENCES Usuarios(id)
            );
        `);

        console.log('✅ Todas as tabelas verificadas/criadas com sucesso.');

        // --- CRIAR ADMINISTRADOR PADRÃO (SE NÃO EXISTIR) ---
        const adminExiste = await db.get('SELECT id FROM Usuarios WHERE cpf = ?', '000.000.000-00');
        if (!adminExiste) {
            const senhaHash = await bcrypt.hash('senha123', 10);
            await db.run(
                `INSERT INTO Usuarios (nome, cpf, senha, email, acesso) 
                 VALUES (?, ?, ?, ?, ?)`,
                'Administrador Sistema', '000.000.000-00', senhaHash, 'admin@bioteste.com.br', 'ADM'
            );
            console.log('🔑 USUÁRIO ADMIN CRIADO: CPF 000.000.000-00 | Senha: senha123');
        }

    } catch (erro) {
        console.error('❌ ERRO CRÍTICO AO INICIAR BANCO:', erro);
    }
}

// =================================================================
// 5. MIDDLEWARES DE SEGURANÇA (Auth)
// =================================================================

// Verifica se o Token JWT é válido
const autenticar = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).json({ success: false, message: "Acesso negado. Token não fornecido." });
    }
    
    const token = authHeader.substring(7);
    try {
        const decodificado = jwt.verify(token, JWT_SECRET);
        req.usuarioId = decodificado.id;
        req.usuarioAcesso = decodificado.acesso;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: "Token expirado ou inválido." });
    }
};

// Verifica se é Administrador
const apenasAdmin = (req, res, next) => {
    if (req.usuarioAcesso !== 'ADM') {
        return res.status(403).json({ success: false, message: "Acesso restrito a administradores." });
    }
    next();
};

// =================================================================
// 6. ROTAS DE SISTEMA (Backup e Restore)
// =================================================================

// Fazer Backup (Download do arquivo .sqlite)
app.get('/api/admin/backup', autenticar, apenasAdmin, async (req, res) => {
    try {
        const nomeArquivo = `backup_bioteste_${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
        const caminhoTemp = path.resolve(`./${nomeArquivo}`);

        // Fecha banco para cópia segura
        if (db) await db.close();
        
        // Copia
        fs.copyFileSync(DB_FILE, caminhoTemp);
        
        // Reabre banco
        await iniciarBancoDados();

        res.download(caminhoTemp, nomeArquivo, (err) => {
            if (err) console.error("Erro no download:", err);
            // Deleta cópia temporária após download
            try { fs.unlinkSync(caminhoTemp); } catch(e) {}
        });

    } catch (erro) {
        await iniciarBancoDados(); // Tenta reabrir em caso de erro
        res.status(500).json({ success: false, message: "Erro ao gerar backup.", error: erro.message });
    }
});

// Restaurar Backup (Upload de arquivo)
app.post('/api/admin/restore', autenticar, apenasAdmin, upload.single('backup_file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "Nenhum arquivo enviado. Use o campo 'backup_file'." });
    }

    try {
        // Fecha conexão atual
        if (db) await db.close();
        db = null;

        // Substitui o arquivo do banco pelo arquivo enviado
        fs.renameSync(req.file.path, DB_FILE);

        // Reconecta
        await iniciarBancoDados();

        res.json({ success: true, message: "Banco de dados restaurado com sucesso!" });
    } catch (erro) {
        await iniciarBancoDados();
        res.status(500).json({ success: false, message: "Falha crítica na restauração.", error: erro.message });
    }
});

// =================================================================
// 7. ROTAS DE AUTENTICAÇÃO (Login, Recuperação e Reset)
// =================================================================

// Login
app.post('/api/auth/login', async (req, res) => {
    const { cpf, senha } = req.body;
    
    if (!cpf || !senha) {
        return res.status(400).json({ success: false, message: "Informe CPF e Senha." });
    }

    try {
        const usuario = await db.get('SELECT * FROM Usuarios WHERE cpf = ?', cpf);
        
        if (!usuario) {
            return res.status(401).json({ success: false, message: "CPF ou senha incorretos." });
        }

        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) {
            return res.status(401).json({ success: false, message: "CPF ou senha incorretos." });
        }

        // Gera Token (Validade: 24 horas)
        const token = jwt.sign(
            { id: usuario.id, acesso: usuario.acesso }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );

        // Salva token no banco (opcional, bom para controle de sessão)
        await db.run('UPDATE Usuarios SET token = ? WHERE id = ?', token, usuario.id);

        // Remove senha do objeto de retorno
        const { senha: _, ...dadosUsuario } = usuario;

        res.json({ 
            success: true, 
            message: "Login realizado com sucesso.", 
            data: { token, usuario: dadosUsuario } 
        });

    } catch (erro) {
        res.status(500).json({ success: false, message: "Erro no servidor.", error: erro.message });
    }
});

// Solicitar Recuperação de Senha (Envia Email)
// AQUI ESTÁ A RECUPERAÇÃO DE SENHA QUE VOCÊ PEDIU
app.post('/api/auth/recuperar', async (req, res) => {
    const { email } = req.body;

    try {
        const usuario = await db.get('SELECT * FROM Usuarios WHERE email = ?', email);
        
        // Mensagem genérica por segurança
        const msgRetorno = "Se o e-mail estiver cadastrado, você receberá instruções.";

        if (usuario) {
            const tokenRecup = gerarTokenRecuperacao();
            const validade = Date.now() + 3600000; // 1 hora

            await db.run(
                'UPDATE Usuarios SET recovery_token = ?, token_expiry = ? WHERE id = ?', 
                tokenRecup, validade, usuario.id
            );

            const msgEmail = `
                Olá, ${usuario.nome}.<br><br>
                Você solicitou a recuperação de senha.<br>
                Seu código de recuperação é: <h2>${tokenRecup}</h2><br>
                Válido por 1 hora.
            `;

            enviarEmail({ 
                para: usuario.email, 
                assunto: "Recuperação de Senha - Bioteste", 
                mensagem: msgEmail 
            });
        }

        res.json({ success: true, message: msgRetorno });

    } catch (erro) {
        res.status(500).json({ success: false, message: "Erro ao processar.", error: erro.message });
    }
});

// Redefinir Senha (com Token)
// AQUI ESTÁ O RESET DE SENHA
app.post('/api/auth/reset-password', async (req, res) => {
    const { token, novaSenha, cpf } = req.body;

    if (!token || !novaSenha || !cpf) {
        return res.status(400).json({ success: false, message: "Token, CPF e Nova Senha são obrigatórios." });
    }

    try {
        const usuario = await db.get('SELECT * FROM Usuarios WHERE recovery_token = ? AND cpf = ?', token, cpf);

        if (!usuario) {
            return res.status(400).json({ success: false, message: "Token inválido ou CPF incorreto." });
        }

        if (usuario.token_expiry < Date.now()) {
            return res.status(400).json({ success: false, message: "Token expirado. Solicite novamente." });
        }

        const novaHash = await bcrypt.hash(novaSenha, 10);

        await db.run(
            'UPDATE Usuarios SET senha = ?, recovery_token = NULL, token_expiry = NULL WHERE id = ?', 
            novaHash, usuario.id
        );

        res.json({ success: true, message: "Senha alterada com sucesso." });

    } catch (erro) {
        res.status(500).json({ success: false, message: "Erro ao redefinir senha.", error: erro.message });
    }
});

// =================================================================
// 8. CRUD: USUÁRIOS
// =================================================================

// Criar Usuário (Cadastro Público ou Admin)
app.post('/api/usuarios', async (req, res) => {
    const { nome, cpf, senha, email, foto_base64, acesso, data_nascimento } = req.body;

    // Validação
    if (!nome || !cpf || !senha || !email || !acesso) {
        return res.status(400).json({ success: false, message: "Preencha todos os campos obrigatórios." });
    }

    try {
        const hashSenha = await bcrypt.hash(senha, 10);
        
        const result = await db.run(
            `INSERT INTO Usuarios (nome, cpf, senha, email, foto_base64, acesso, data_nascimento) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            nome, cpf, hashSenha, email, foto_base64, acesso, data_nascimento
        );

        const novoUsuario = await db.get('SELECT id, nome, email, acesso FROM Usuarios WHERE id = ?', result.lastID);

        // Enviar Boas-Vindas
        enviarEmail({
            para: email,
            assunto: "Bem-vindo ao Bioteste!",
            mensagem: `Olá ${nome}, seu cadastro foi realizado com sucesso. Nível de acesso: ${acesso}.`
        });

        res.status(201).json({ success: true, message: "Usuário criado com sucesso.", data: novoUsuario });

    } catch (erro) {
        if (erro.code === 'SQLITE_CONSTRAINT') {
            return res.status(400).json({ success: false, message: "CPF ou E-mail já cadastrados." });
        }
        res.status(500).json({ success: false, message: "Erro ao criar usuário.", error: erro.message });
    }
});

// Listar Usuários (Requer Auth)
app.get('/api/usuarios', autenticar, async (req, res) => {
    try {
        const usuarios = await db.all('SELECT id, nome, cpf, email, acesso, data_nascimento, foto_base64 FROM Usuarios');
        res.json({ success: true, data: usuarios });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

// Buscar um Usuário
app.get('/api/usuarios/:id', autenticar, async (req, res) => {
    try {
        const usuario = await db.get('SELECT id, nome, cpf, email, acesso, data_nascimento, foto_base64 FROM Usuarios WHERE id = ?', req.params.id);
        if (!usuario) return res.status(404).json({ success: false, message: "Usuário não encontrado." });
        res.json({ success: true, data: usuario });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

// Atualizar Usuário
app.put('/api/usuarios/:id', autenticar, async (req, res) => {
    const { id } = req.params;
    const body = req.body;

    try {
        if (body.senha) {
            body.senha = await bcrypt.hash(body.senha, 10);
        }

        // Construção dinâmica da query SQL (Atualiza só o que foi enviado)
        const campos = Object.keys(body).map(chave => `${chave} = ?`).join(', ');
        const valores = Object.values(body);

        if (!campos) return res.status(400).json({ success: false, message: "Nenhum dado enviado para atualização." });

        await db.run(`UPDATE Usuarios SET ${campos} WHERE id = ?`, ...valores, id);

        res.json({ success: true, message: "Dados atualizados com sucesso." });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

// Excluir Usuário (Apenas Admin)
app.delete('/api/usuarios/:id', autenticar, apenasAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM Usuarios WHERE id = ?', req.params.id);
        res.json({ success: true, message: "Usuário excluído." });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

// =================================================================
// 9. CRUD: AGENDAMENTOS DOMICILIARES
// =================================================================

// Criar Agendamento (Paciente/Funcionario)
app.post('/api/agendamentos', autenticar, async (req, res) => {
    const d = req.body; // Dados do corpo

    // Validação mínima
    if (!d.id_usuario || !d.nome_paciente || !d.data_hora_agendamento) {
        return res.status(400).json({ success: false, message: "Faltam dados obrigatórios (id_usuario, nome, data/hora)." });
    }

    try {
        const result = await db.run(
            `INSERT INTO Agendamentos_Domiciliares (
                id_usuario, nome_paciente, cpf_paciente, data_nascimento_paciente, cidade, bairro, referencia, 
                possui_plano, qual_plano, data_hora_agendamento, observacoes_cliente, foto_rg_frente_base64, 
                foto_rg_verso_base64, foto_pedido_medico_base64, arquivos_suporte_base64, valor_exames_coleta
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            d.id_usuario, d.nome_paciente, d.cpf_paciente, d.data_nascimento_paciente, d.cidade, d.bairro, d.referencia, 
            d.possui_plano, d.qual_plano, d.data_hora_agendamento, d.observacoes_cliente, d.foto_rg_frente_base64, 
            d.foto_rg_verso_base64, d.foto_pedido_medico_base64, d.arquivos_suporte_base64, d.valor_exames_coleta
        );

        res.status(201).json({ success: true, message: "Agendamento solicitado com sucesso!", data: { id: result.lastID } });

    } catch (erro) {
        res.status(500).json({ success: false, message: "Erro ao agendar.", error: erro.message });
    }
});

// Listar Todos Agendamentos
app.get('/api/agendamentos', autenticar, async (req, res) => {
    try {
        const agendamentos = await db.all('SELECT * FROM Agendamentos_Domiciliares ORDER BY data_hora_agendamento DESC');
        res.json({ success: true, data: agendamentos });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

// Buscar Agendamento Único
app.get('/api/agendamentos/:id', autenticar, async (req, res) => {
    try {
        const item = await db.get('SELECT * FROM Agendamentos_Domiciliares WHERE id_pedido = ?', req.params.id);
        if (!item) return res.status(404).json({ success: false, message: "Agendamento não encontrado." });
        res.json({ success: true, data: item });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

// Atualizar Agendamento (Usado pelo Lab para colocar valor, status, obs, atendente)
app.put('/api/agendamentos/:id', autenticar, async (req, res) => {
    const { id } = req.params;
    const body = req.body;

    try {
        const campos = Object.keys(body).filter(k => k !== 'id_pedido').map(k => `${k} = ?`).join(', ');
        const valores = Object.values(body).filter((_, i) => Object.keys(body)[i] !== 'id_pedido');

        if (!campos) return res.status(400).json({ success: false, message: "Nenhum dado para atualizar." });

        await db.run(`UPDATE Agendamentos_Domiciliares SET ${campos} WHERE id_pedido = ?`, ...valores, id);

        res.json({ success: true, message: "Agendamento atualizado com sucesso." });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

// Excluir Agendamento
app.delete('/api/agendamentos/:id', autenticar, async (req, res) => {
    try {
        await db.run('DELETE FROM Agendamentos_Domiciliares WHERE id_pedido = ?', req.params.id);
        res.json({ success: true, message: "Agendamento removido." });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

// =================================================================
// 10. CRUD: ATENDIMENTOS (Presencial/Geral)
// =================================================================

app.post('/api/atendimentos', autenticar, async (req, res) => {
    const d = req.body;
    try {
        const result = await db.run(
            `INSERT INTO Atendimentos (id_usuario, nome_usuario, unidade, nome_paciente, plano_convenio, data_entrada, data_resultado) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            d.id_usuario, d.nome_usuario, d.unidade, d.nome_paciente, d.plano_convenio, d.data_entrada, d.data_resultado
        );
        res.status(201).json({ success: true, message: "Atendimento registrado.", data: { id: result.lastID } });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

app.get('/api/atendimentos', autenticar, async (req, res) => {
    try {
        const lista = await db.all('SELECT * FROM Atendimentos ORDER BY data_entrada DESC');
        res.json({ success: true, data: lista });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

app.put('/api/atendimentos/:id', autenticar, async (req, res) => {
    const { id } = req.params;
    const body = req.body;
    try {
        const campos = Object.keys(body).filter(k => k !== 'id').map(k => `${k} = ?`).join(', ');
        const valores = Object.values(body).filter((_, i) => Object.keys(body)[i] !== 'id');
        
        await db.run(`UPDATE Atendimentos SET ${campos} WHERE id = ?`, ...valores, id);
        res.json({ success: true, message: "Atendimento atualizado." });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

app.delete('/api/atendimentos/:id', autenticar, async (req, res) => {
    try {
        await db.run('DELETE FROM Atendimentos WHERE id = ?', req.params.id);
        res.json({ success: true, message: "Atendimento excluído." });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

// =================================================================
// 11. CRUD: RELATÓRIOS (Laudos/Documentos)
// =================================================================

app.post('/api/relatorios', autenticar, async (req, res) => {
    const { id_usuario, titulo, arquivo_base64, unidade } = req.body;
    
    if (!arquivo_base64 || !id_usuario) {
        return res.status(400).json({ success: false, message: "Arquivo e ID do Usuário são obrigatórios." });
    }

    try {
        const result = await db.run(
            `INSERT INTO Relatorios (id_usuario, titulo, arquivo_base64, unidade) VALUES (?, ?, ?, ?)`,
            id_usuario, titulo, arquivo_base64, unidade
        );
        res.status(201).json({ success: true, message: "Relatório salvo.", data: { id: result.lastID } });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

app.get('/api/relatorios', autenticar, async (req, res) => {
    try {
        // Traz apenas metadados para não pesar a lista. O download é feito no GET /:id
        const lista = await db.all('SELECT id, id_usuario, titulo, unidade, data_upload FROM Relatorios ORDER BY data_upload DESC');
        res.json({ success: true, data: lista });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

app.get('/api/relatorios/:id', autenticar, async (req, res) => {
    try {
        const item = await db.get('SELECT * FROM Relatorios WHERE id = ?', req.params.id);
        if (!item) return res.status(404).json({ success: false, message: "Não encontrado" });
        res.json({ success: true, data: item });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

app.delete('/api/relatorios/:id', autenticar, async (req, res) => {
    try {
        await db.run('DELETE FROM Relatorios WHERE id = ?', req.params.id);
        res.json({ success: true, message: "Relatório excluído." });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

// =================================================================
// 12. CRUD: NOTIFICAÇÕES
// =================================================================

// AQUI ESTÃO AS ROTAS DE NOTIFICAÇÃO QUE VOCÊ PEDIU
app.post('/api/notificacoes', autenticar, async (req, res) => {
    const { id_usuario, titulo, mensagem } = req.body;
    try {
        const result = await db.run(
            `INSERT INTO Notificacoes (id_usuario, titulo, mensagem, lida) VALUES (?, ?, ?, 0)`,
            id_usuario, titulo, mensagem
        );
        res.status(201).json({ success: true, message: "Notificação enviada.", data: { id: result.lastID } });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

// Listar notificações de um usuário
app.get('/api/notificacoes/usuario/:id_usuario', autenticar, async (req, res) => {
    try {
        const lista = await db.all('SELECT * FROM Notificacoes WHERE id_usuario = ? ORDER BY data DESC', req.params.id_usuario);
        res.json({ success: true, data: lista });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

// Marcar notificação como lida
app.put('/api/notificacoes/:id/ler', autenticar, async (req, res) => {
    try {
        await db.run('UPDATE Notificacoes SET lida = 1 WHERE id_notificacao = ?', req.params.id);
        res.json({ success: true, message: "Marcada como lida." });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

app.delete('/api/notificacoes/:id', autenticar, async (req, res) => {
    try {
        await db.run('DELETE FROM Notificacoes WHERE id_notificacao = ?', req.params.id);
        res.json({ success: true, message: "Notificação removida." });
    } catch (erro) {
        res.status(500).json({ success: false, error: erro.message });
    }
});

// =================================================================
// 13. INICIALIZAÇÃO DO SERVIDOR
// =================================================================

iniciarBancoDados().then(() => {
    app.listen(PORT, () => {
        console.log(`\n🚀 SERVIDOR ONLINE`);
        console.log(`📡 URL: http://localhost:${PORT}`);
        console.log(`💾 Banco: ${DB_FILE}`);
        console.log(`📧 Sistema de Email Ativo`);
        console.log(`🛡️  Segurança: JWT + BCrypt + CORS\n`);
    });
});