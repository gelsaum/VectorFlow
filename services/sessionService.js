const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

class SessionService {
    constructor() {
        this.db = null;
    }

    async init() {
        // Initialize SQLite DB connection
        this.db = await open({
            filename: path.join(__dirname, '..', 'sessions.sqlite'),
            driver: sqlite3.Database
        });

        // Create table if not exists
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS UserSessions (
                phone TEXT PRIMARY KEY,
                step TEXT,
                data TEXT,
                lastActivity INTEGER
            )
        `);
        console.log('[SessionService] Base de dados SQLite (sessions.sqlite) conectada.');
    }

    async getSession(from) {
        if (!this.db) await this.init();

        const now = Date.now();
        const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos timeout

        let row = await this.db.get('SELECT * FROM UserSessions WHERE phone = ?', from);

        if (!row) {
            row = { step: 'START', data: JSON.stringify({}), lastActivity: now };
            await this.db.run('INSERT INTO UserSessions (phone, step, data, lastActivity) VALUES (?, ?, ?, ?)', [from, row.step, row.data, row.lastActivity]);
        } else {
            if (now - row.lastActivity > TIMEOUT_MS) {
                console.log(`[Session] Sessão de ${from} expirou por inatividade. Reiniciando...`);
                row = { step: 'START', data: JSON.stringify({}), lastActivity: now };
            } else {
                row.lastActivity = now;
            }
            await this.saveSession(from, { step: row.step, data: JSON.parse(row.data), lastActivity: row.lastActivity });
        }

        return {
            step: row.step,
            data: JSON.parse(row.data),
            lastActivity: row.lastActivity
        };
    }

    async saveSession(from, sessionData) {
        if (!this.db) await this.init();
        const now = sessionData.lastActivity || Date.now();
        await this.db.run(
            'UPDATE UserSessions SET step = ?, data = ?, lastActivity = ? WHERE phone = ?',
            [sessionData.step, JSON.stringify(sessionData.data), now, from]
        );
    }

    async resetSession(from) {
        if (!this.db) await this.init();
        const now = Date.now();
        await this.db.run(
            'UPDATE UserSessions SET step = ?, data = ?, lastActivity = ? WHERE phone = ?',
            ['START', JSON.stringify({}), now, from]
        );
    }
}

module.exports = new SessionService();
