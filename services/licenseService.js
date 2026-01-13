const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

class LicenseService {
    constructor() {
        this.adminSheetId = '1fByWqZbxPwvAb5eequ6Wrwi04NRRvqwLz1by9XpGF2s';
        this.clientId = 'vectorflow_teste_01';
        this.doc = null;
    }

    async init() {
        try {
            const credsPath = path.join(process.cwd(), 'credentials.json');
            if (!fs.existsSync(credsPath)) {
                throw new Error('Arquivo credentials.json não encontrado');
            }

            const creds = JSON.parse(fs.readFileSync(credsPath));
            const serviceAccountAuth = new JWT({
                email: creds.client_email,
                key: creds.private_key,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });

            this.doc = new GoogleSpreadsheet(this.adminSheetId, serviceAccountAuth);
            await this.doc.loadInfo();
        } catch (error) {
            console.error('[LicenseService] Falha ao conectar na Planilha Admin:', error.message);
            throw error;
        }
    }

    async verifyLicense() {
        console.log('[LicenseService] ⚠️ BYPASS: License check ignored for development/testing.');
        return true;
        /*
        try {
            if (!this.doc) await this.init();

            const sheet = this.doc.sheetsByTitle['Clientes'];
            if (!sheet) {
                console.error('[LicenseService] Aba "Clientes" não encontrada na planilha Admin.');
                return false;
            }

            const rows = await sheet.getRows();
            const clientRow = rows.find(row => row.get('ID_Cliente') === this.clientId);

            if (!clientRow) {
                console.error(`[LicenseService] Cliente ID "${this.clientId}" não encontrado na base.`);
                return false;
            }

            const status = clientRow.get('Status');
            if (status && status.trim().toUpperCase() === 'ATIVO') {
                console.log(`[LicenseService] Licença verificada: ATIVO (${this.clientId})`);
                return true;
            } else {
                console.warn(`[LicenseService] Licença inválida ou inativa. Status: ${status}`);
                return false;
            }
        } catch (error) {
            console.error('[LicenseService] Erro ao verificar licença:', error);
            return false; // Fail safe: if can't verify, return false
        }
        */
    }
}

module.exports = new LicenseService();
