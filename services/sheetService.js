const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

// Load environment variables if not already loaded (usually done in index.js)
require('dotenv').config();

class SheetService {
    constructor() {
        this.doc = null;
        this.config = {};
    }

    async init() {
        try {
            // Load credentials from file
            const credsPath = path.join(process.cwd(), 'credentials.json');
            if (!fs.existsSync(credsPath)) {
                throw new Error('Arquivo credentials.json não encontrado!');
            }
            const creds = JSON.parse(fs.readFileSync(credsPath));

            // Initialize auth - this is for google-spreadsheet v4
            const serviceAccountAuth = new JWT({
                email: creds.client_email,
                key: creds.private_key,
                scopes: [
                    'https://www.googleapis.com/auth/spreadsheets',
                ],
            });

            this.doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, serviceAccountAuth);

            await this.doc.loadInfo();
            console.log(`Planilha carregada: ${this.doc.title}`);

            await this.loadConfig();
        } catch (error) {
            console.error('Erro ao conectar com Google Sheets:', error);
            throw error; // Let main loop handle crash/restart logic if needed, or handle gracefully
        }
    }

    async loadConfig() {
        const sheet = this.doc.sheetsByTitle['Config'];
        if (!sheet) return;

        const rows = await sheet.getRows();
        // Assuming columns are [Chave, Valor]
        rows.forEach(row => {
            const key = row.get('Chave');
            const value = row.get('Valor');
            if (key) this.config[key] = value;
        });
        console.log('Configurações carregadas:', this.config);
    }

    async getPromotions() {
        try {
            const sheet = this.doc.sheetsByTitle['Promocoes'];
            if (!sheet) return [];

            const rows = await sheet.getRows();
            // Filter where 'Ativa' is TRUE (string comparison likely needed for Sheets)
            const activePromos = rows
                .filter(row => {
                    const active = row.get('Ativa');
                    return active === true || active === 'TRUE' || active === 'verdadeiro';
                })
                .map(row => row.get('Texto_Promocao'));

            return activePromos;
        } catch (error) {
            console.error('Erro ao ler promoções:', error);
            return [];
        }
    }

    async getEmployees() {
        try {
            const sheet = this.doc.sheetsByTitle['Funcionarios'];
            if (!sheet) return [];
            const rows = await sheet.getRows();
            return rows.map(row => ({
                id: row.rowNumber, // simple ID
                name: row.get('Nome'),
                specialty: row.get('Especialidade')
            }));
        } catch (error) {
            console.error('Erro ao buscar funcionários:', error);
            return [];
        }
    }

    // Logic to check if a slot is taken
    async checkAvailability(date, time, employeeName) {
        try {
            const sheet = this.doc.sheetsByTitle['Agendamentos'];
            if (!sheet) return false; // Fail safe

            const rows = await sheet.getRows();

            // Verificação de conflito: Data + Horario + Funcionario
            const conflict = rows.find(row => {
                return (
                    row.get('Data') === date &&
                    row.get('Horario') === time &&
                    row.get('Funcionario_Nome') === employeeName
                );
            });

            return !conflict; // Returns true if Available (no conflict)
        } catch (error) {
            console.error('Erro ao verificar disponibilidade:', error);
            throw new Error('Erro ao verificar disponibilidade');
        }
    }

    async addAppointment(appointmentData) {
        try {
            const sheet = this.doc.sheetsByTitle['Agendamentos'];
            if (!sheet) throw new Error('Aba Agendamentos não encontrada');

            // appointmentData: { Data, Horario, Cliente_Telefone, Cliente_Nome, Funcionario_Nome }
            await sheet.addRow(appointmentData);
            return true;
        } catch (error) {
            console.error('Erro ao adicionar agendamento:', error);
            return false;
        }
    }

    async getAppointmentsByPhone(phone) {
        try {
            const sheet = this.doc.sheetsByTitle['Agendamentos'];
            if (!sheet) return [];

            const rows = await sheet.getRows();

            // Normalize phone if necessary, but for now assuming strict match or simple includes
            // Typically WhatsApp numbers come with country code, so we might need fuzzy match.
            // For this MVP, we check if the stored phone contains the user phone or vice versa.
            return rows
                .filter(row => {
                    const rowPhone = row.get('Cliente_Telefone') || '';
                    return rowPhone.includes(phone) || phone.includes(rowPhone);
                })
                .map(row => ({
                    date: row.get('Data'),
                    time: row.get('Horario'),
                    employee: row.get('Funcionario_Nome')
                }));
        } catch (error) {
            console.error('Erro ao buscar agendamentos:', error);
            return [];
        }
    }
}

module.exports = new SheetService();
