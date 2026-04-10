const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

class SessionService {
    constructor() {
        this.db = null;
        this.initPromise = null;
    }

    async init() {
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            try {
                this.db = await open({
                    filename: path.join(__dirname, '..', 'sessions.sqlite'),
                    driver: sqlite3.Database
                });

                // Configurações avançadas de alta disponibilidade para SQLite em Node.js
                await this.db.exec('PRAGMA journal_mode = WAL;');
                await this.db.exec('PRAGMA synchronous = NORMAL;'); // Modo WAL permite baixar para NORMAL (muito mais rápido, sem risco)
                await this.db.exec('PRAGMA busy_timeout = 5000;'); // Instrui o SQLite a aguardar até 5s caso o banco esteja ocupado, na vez de crashear

                await this.db.exec(`
                    CREATE TABLE IF NOT EXISTS UserSessions (
                        phone TEXT PRIMARY KEY,
                        step TEXT,
                        data TEXT,
                        lastActivity INTEGER
                    )
                `);
                console.log('[SessionService] Base de dados SQLite conectada e modo WAL ativo.');
            } catch (error) {
                console.error('[SessionService] Erro crítico ao conectar com SQLite:', error);
                this.initPromise = null; // Permite tentar reconectar 
                throw error;
            }
        })();

        return this.initPromise;
    }

    async getSession(from) {
        if (!this.db) await this.init();

        const now = Date.now();
        const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos timeout

        try {
            let row = await this.db.get('SELECT * FROM UserSessions WHERE phone = ?', from);

            if (!row) {
                const defaultData = {};
                // INSERT OR IGNORE evita erros quando duas mensagens simultâneas tentam "criar" a sessão juntas
                await this.db.run(
                    'INSERT OR IGNORE INTO UserSessions (phone, step, data, lastActivity) VALUES (?, ?, ?, ?)', 
                    [from, 'START', JSON.stringify(defaultData), now]
                );
                
                return { step: 'START', data: defaultData, lastActivity: now };
            } 

            if (now - row.lastActivity > TIMEOUT_MS) {
                console.log(`[Session] Sessão de ${from} expirou por inatividade. Reiniciando...`);
                row = { step: 'START', data: '{}', lastActivity: now };
                await this.db.run(
                    'UPDATE UserSessions SET step = ?, data = ?, lastActivity = ? WHERE phone = ?',
                    [row.step, row.data, row.lastActivity, from]
                );
            } else {
                row.lastActivity = now;
                await this.db.run(
                    'UPDATE UserSessions SET lastActivity = ? WHERE phone = ?', 
                    [now, from]
                );
            }

            let parsedData = {};
            try {
                parsedData = JSON.parse(row.data);
            } catch (e) {
                console.warn(`[Session] Os dados em banco do usuário ${from} estavam corrompidos. Mantendo objeto vazio.`);
            }

            return { step: row.step, data: parsedData, lastActivity: row.lastActivity };

        } catch (error) {
            console.error(`[SessionService Error] Falha de leitura/escrita ao recuperar sessão para ${from}:`, error);
            // Retorna Fallback: mesmo com falha no banco o bot segue para responder a mensagem
            return { step: 'START', data: {}, lastActivity: now }; 
        }
    }

    async saveSession(from, sessionData) {
        if (!this.db) await this.init();
        const now = sessionData.lastActivity || Date.now();
        
        try {
            await this.db.run(
                'UPDATE UserSessions SET step = ?, data = ?, lastActivity = ? WHERE phone = ?',
                [sessionData.step, JSON.stringify(sessionData.data || {}), now, from]
            );
        } catch (error) {
            console.error(`[SessionService Error] Falha ao salvar sessão para ${from}:`, error);
        }
    }

    async resetSession(from) {
        if (!this.db) await this.init();
        const now = Date.now();
        
        try {
            await this.db.run(
                'UPDATE UserSessions SET step = ?, data = ?, lastActivity = ? WHERE phone = ?',
                ['START', '{}', now, from]
            );
        } catch (error) {
            console.error(`[SessionService Error] Falha ao resetar sessão para ${from}:`, error);
        }
    }
}

module.exports = new SessionService();
