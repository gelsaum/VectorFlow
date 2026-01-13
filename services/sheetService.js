const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');
const path = require('path');
const { parse, isSameDay, addDays, format, startOfDay, isBefore, isEqual, isAfter, isValid, isWithinInterval, getDay } = require('date-fns');
const { es, ptBR } = require('date-fns/locale');
const crypto = require('crypto');

require('dotenv').config();

// --- Utility: Simple Mutex for Locking ---
class Mutex {
    constructor() {
        this.queue = [];
        this.locked = false;
    }

    lock() {
        return new Promise(resolve => {
            if (this.locked) {
                this.queue.push(resolve);
            } else {
                this.locked = true;
                resolve();
            }
        });
    }

    unlock() {
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            next();
        } else {
            this.locked = false;
        }
    }
}

// --- Utility: Normalize Text for Comparisons ---
function normalizeText(text) {
    if (!text) return '';
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

class SheetService {
    constructor() {
        this.doc = null;
        this.config = {};
        this.businessHoursCache = null; // Cache for business hours
        this.appointMutex = new Mutex(); // Mutex for appointments
        this.businessHours = [
            '08:00', '09:00', '10:00', '11:00',
            '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'
        ];
    }

    async init() {
        try {
            const credsPath = path.join(process.cwd(), 'credentials.json');
            if (!fs.existsSync(credsPath)) throw new Error('Archivo credentials.json no encontrado');

            const creds = JSON.parse(fs.readFileSync(credsPath));
            const serviceAccountAuth = new JWT({
                email: creds.client_email,
                key: creds.private_key,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });

            this.doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, serviceAccountAuth);
            await this.doc.loadInfo();
            console.log(`[SheetService] Planilla cargada: ${this.doc.title}`);

            // Ensure Agendamentos tab exists
            let sheetAgendamentos = this.doc.sheetsByTitle['Agendamentos'];
            const headerValues = ['id_agendamento', 'data', 'horario', 'cliente_telefone', 'cliente_nome', 'funcionario_nome', 'status'];

            if (!sheetAgendamentos) {
                console.log('[SheetService] Creando hoja Agendamentos...');
                sheetAgendamentos = await this.doc.addSheet({
                    title: 'Agendamentos',
                    headerValues: headerValues
                });
            } else {
                // Check if 'id_agendamento' exists in headers
                await sheetAgendamentos.loadHeaderRow();
                const currentHeaders = sheetAgendamentos.headerValues;

                if (!currentHeaders.includes('id_agendamento')) {
                    console.log('[SheetService] Adicionando coluna id_agendamento...');
                    // Append new column to headers
                    const newHeaders = [...currentHeaders, 'id_agendamento'];
                    await sheetAgendamentos.setHeaderRow(newHeaders);
                }
            }

            await this.loadConfig();
        } catch (error) {
            console.error('[SheetService] Error crítico de conexión:', error);
            throw error;
        }
    }

    async loadConfig() {
        const sheet = this.doc.sheetsByTitle['Config'];
        if (!sheet) return;
        const rows = await sheet.getRows();
        rows.forEach(row => {
            const key = row.get('Chave');
            const value = row.get('Valor');
            if (key) this.config[key] = value;
        });
    }



    async getEmployees() {
        try {
            const sheet = this.doc.sheetsByTitle['Funcionarios'];
            if (!sheet) return [];
            const rows = await sheet.getRows();
            // User requested to remove Status validation as the column doesn't exist
            return rows
                .map(row => ({
                    id: row.rowNumber,
                    name: row.get('Nome')
                }));
        } catch (error) {
            console.error('Error al obtener empleados:', error);
            return [];
        }
    }

    /**
     * Retorna lista de nomes de profissionais disponíveis na dataConsulta.
     * Filtra aqueles com bloqueio TOTAL (Ferias/Permisos) na aba Regras_Horarios.
     * @param {string} dataConsultaStr - "DD/MM/YYYY"
     */
    async listarProfissionaisDisponiveis(dataConsultaStr) {
        try {
            // 1. Obter todos os funcionários
            const todos = await this.getEmployees();
            if (todos.length === 0) return [];

            const sheetRegras = this.doc.sheetsByTitle['Regras_Horarios'];
            if (!sheetRegras) {
                // Se não tem aba de regras, todos estão tecnicamente disponíveis (sem filtros de férias)
                return todos.map(e => e.name);
            }

            const rowsRegras = await sheetRegras.getRows();

            // Validar Data Consulta
            // Usar startOfDay para garantir comparação justa
            // Mas nossos parseDateString já deve cuidar de horas?
            // Vamos fazer parse manual para garantir
            const dataConsulta = parse(dataConsultaStr, 'dd/MM/yyyy', new Date());
            if (!isValid(dataConsulta)) return []; // Data inválida retorna vazio? Ou todos? Vazio é mais seguro.

            // Normalizar para comparação
            const targetDate = startOfDay(dataConsulta);

            // 2. Filtrar
            // Queremos APENAS nomes que NÃO tenham bloqueio na data
            const disponiveis = todos.filter(emp => {
                const normEmpName = normalizeText(emp.name);

                // Verificar se existe regra de BLOQUEIO para este funcionário nesta data
                const estaBloqueado = rowsRegras.some(row => {
                    // Checar nome
                    if (normalizeText(row.get('Profissional')) !== normEmpName) return false;

                    // Checar Tipo (Ferias ou Permisos - Case insensitive roughly)
                    const tipo = normalizeText(row.get('Tipo'));
                    if (tipo !== 'ferias' && tipo !== 'permisos') return false;

                    // Checar Intervalo de Datas
                    const inicioStr = row.get('Data_Inicio');
                    const fimStr = row.get('Data_Fim');

                    if (!inicioStr || !fimStr) return false;

                    const dInicio = parse(inicioStr.trim(), 'dd/MM/yyyy', new Date());
                    const dFim = parse(fimStr.trim(), 'dd/MM/yyyy', new Date());

                    if (!isValid(dInicio) || !isValid(dFim)) return false;

                    // O bloqueio é INCLUSIVO [Inicio, Fim]
                    // isWithinInterval lida bem com inclusive
                    const dateMatch = isWithinInterval(targetDate, {
                        start: startOfDay(dInicio),
                        end: startOfDay(dFim)
                    });

                    if (!dateMatch) return false;

                    // CHECK FOR PARTIAL BLOCK (PERMISOS/HOURS)
                    const hStart = row.get('Hora_Inicio');
                    const hEnd = row.get('Hora_Fim');

                    // If NO time is specified, assume FULL DAY BLOCK (Vacation standard)
                    if (!hStart || !hEnd) return true;

                    // If time is specified, check if it covers the whole day (00:00 to 23:59)
                    if (hStart.trim() === '00:00' && hEnd.trim() === '23:59') return true;

                    // If it has specific hours (e.g. 16:00-17:00), it's a PARTIAL block.
                    // The employee IS available for the rest of the day, so do NOT exclude them from the list.
                    return false;
                });

                return !estaBloqueado;
            });

            return disponiveis.map(e => e.name);

        } catch (error) {
            console.error('[listarProfissionaisDisponiveis] Erro:', error);
            return []; // Fail safe
        }
    }

    // --- SMART SLOTS LOGIC ---
    async getAvailableSlots(dateStr, employeeName) {
        try {
            const sheet = this.doc.sheetsByTitle['Agendamentos'];
            if (!sheet) return [];

            // 1. Prepare Base Slots (Use dynamic config!)
            // Pass the date and employee to the generator for filtering
            let candidateSlots = await this.gerarHorariosDisponiveis(dateStr, employeeName);

            // 2. Filter Past Times if Date is TODAY
            const now = new Date();
            const targetDate = parse(dateStr, 'dd/MM/yyyy', new Date());

            if (isSameDay(targetDate, now)) {
                // Determine current hour
                const currentHour = now.getHours();
                const safeCurrentHour = currentHour;

                candidateSlots = candidateSlots.filter(slot => {
                    const [h] = slot.split(':').map(Number);
                    return h > safeCurrentHour;
                });
            }

            // 3. Filter Occupied Slots from Sheet
            const rows = await sheet.getRows();
            const normalizedEmpName = normalizeText(employeeName);

            const occupiedTimes = rows
                .filter(row => {
                    const rowDate = row.get('data');
                    const rowEmp = normalizeText(row.get('funcionario_nome'));
                    const rowStatus = normalizeText(row.get('status') || '');
                    return rowDate === dateStr && rowEmp === normalizedEmpName && rowStatus !== 'cancelado';
                })
                .map(row => row.get('horario'));

            const finalSlots = candidateSlots.filter(slot => !occupiedTimes.includes(slot));

            return finalSlots;
        } catch (error) {
            console.error('Error calculando slots:', error);
            return [];
        }
    }

    // --- NEW: Dynamic Day Search ---
    async getNextAvailableDays(employeeName) {
        const availableDays = [];
        let today = new Date();
        let checkDate = today;
        let daysFound = 0;
        let attempts = 0;
        const MAX_ATTEMPTS = 7; // Look ahead 7 days max
        const REQUIRED_DAYS = 3;

        while (daysFound < REQUIRED_DAYS && attempts < MAX_ATTEMPTS) {
            // Skip Sundays (0)
            if (getDay(checkDate) === 0) {
                checkDate = addDays(checkDate, 1);
                attempts++; // Still counts as an attempt or should we skip counting? 
                // Let's count it to avoid infinite loops if config is weird, 
                // although strict sunday skipping is fine.
                continue;
            }

            const dateStr = format(checkDate, 'dd/MM/yyyy');

            // Check slots for this day
            const slots = await this.getAvailableSlots(dateStr, employeeName);

            if (slots.length > 0) {
                // Formatting label using date-fns locale
                let label = '';
                if (isSameDay(checkDate, today)) {
                    label = `Hoy (${format(checkDate, 'dd/MM')})`;
                } else if (isSameDay(checkDate, addDays(today, 1))) {
                    label = `Mañana (${format(checkDate, 'dd/MM')})`;
                } else {
                    const dayName = format(checkDate, 'EEEE', { locale: es });
                    // Capitalize first letter
                    const dayNameCap = dayName.charAt(0).toUpperCase() + dayName.slice(1);
                    label = `${dayNameCap} (${format(checkDate, 'dd/MM')})`;
                }

                availableDays.push({
                    date: dateStr,
                    label: label
                });
                daysFound++;
            }

            checkDate = addDays(checkDate, 1);
            attempts++;
        }
        return availableDays;
    }

    async addAppointment(appointmentData) {
        await this.appointMutex.lock(); // 🔒 ACQUIRE LOCK
        try {
            const sheet = this.doc.sheetsByTitle['Agendamentos'];
            if (!sheet) throw new Error('Hoja Agendamentos no encontrada');

            // DOUBLE CHECK: Avoid duplicates
            const rows = await sheet.getRows();
            const exists = rows.some(row => {
                return row.get('data') === appointmentData.Data &&
                    row.get('horario') === appointmentData.Horario &&
                    row.get('funcionario_nome') === appointmentData.Funcionario_Nome &&
                    row.get('status') !== 'cancelado';
            });

            if (exists) {
                console.warn('[addAppointment] Duplicate detected per sheet check. Satus: taken.');
                return { success: false, reason: 'taken' };
            }

            // Generate UUID
            const uniqueId = crypto.randomUUID();

            const rowToAdd = {
                id_agendamento: uniqueId,
                data: appointmentData.Data,
                horario: appointmentData.Horario,
                cliente_telefone: appointmentData.Cliente_Telefone,
                cliente_nome: appointmentData.Cliente_Nome,
                funcionario_nome: appointmentData.Funcionario_Nome,
                status: 'Ativo' // Force status active
            };

            await sheet.addRow(rowToAdd);
            return { success: true, id_agendamento: uniqueId };
        } catch (error) {
            console.error('Error al guardar cita:', error);
            return { success: false, reason: 'error' };
        } finally {
            this.appointMutex.unlock(); // 🔓 RELEASE LOCK
        }
    }

    async getAppointmentsByPhone(phone) {
        try {
            const sheet = this.doc.sheetsByTitle['Agendamentos'];
            if (!sheet) return [];

            const rows = await sheet.getRows();
            const normPhone = normalizeText(phone);

            return rows
                .filter(row => {
                    const rowPhone = normalizeText(row.get('cliente_telefone') || '');
                    return rowPhone.includes(normPhone) || normPhone.includes(rowPhone);
                })
                .map(row => ({
                    date: row.get('data'),
                    time: row.get('horario'),
                    employee: row.get('funcionario_nome')
                }));
        } catch (error) {
            console.error('Error al buscar citas:', error);
            return [];
        }
    }

    // =========================================================================
    // NOVAS FUNÇÕES DE LÓGICA DE NEGÓCIO (SOLICITADAS)
    // =========================================================================

    /**
     * Helper para converter string 'DD/MM/YYYY' para objeto Date (início do dia).
     * @param {string} dateStr 
     * @returns {Date|null}
     */
    parseDateString(dateStr) {
        if (!dateStr) return null;
        // Strict parsing matching 'dd/MM/yyyy' exactly
        const parsed = parse(dateStr.trim(), 'dd/MM/yyyy', new Date());
        return isValid(parsed) ? startOfDay(parsed) : null;
    }

    /**
     * 1. listarMinhasCitas(telefoneUsuario)
     * Retorna agendamentos futuros ou de hoje, não cancelados.
     */
    async listarMinhasCitas(telefoneUsuario) {
        try {
            console.log(`[listarMinhasCitas] Buscando para: ${telefoneUsuario}`);
            const sheet = this.doc.sheetsByTitle['Agendamentos'];
            if (!sheet) {
                console.error('[SheetService] Aba Agendamentos não encontrada.');
                return [];
            }

            const rows = await sheet.getRows();
            const today = startOfDay(new Date());
            const targetPhone = normalizeText(telefoneUsuario);

            // Filtro rigoroso
            const results = rows.filter(row => {
                const rowDateStr = row.get('data');
                const rowPhone = normalizeText(row.get('cliente_telefone') || '');
                const rowStatus = normalizeText(row.get('status') || '');

                if (rowStatus === 'cancelado') return false;

                const phoneMatch = rowPhone.includes(targetPhone) || targetPhone.includes(rowPhone);
                if (!phoneMatch) return false;

                const rowDate = this.parseDateString(rowDateStr);
                // Validation: If date is invalid, do we include or exclude? Exclude to be safe.
                if (!rowDate) return false;

                // Compare timestamps to be absolutely sure
                return rowDate.getTime() >= today.getTime();
            });

            // Mapeamento para objeto limpo (Imutabilidade garantida criando novo array)
            return results.map(row => ({
                data: row.get('data'),
                horario: row.get('horario'),
                cliente_nome: row.get('cliente_nome'),
                funcionario_nome: row.get('funcionario_nome'),
                status: row.get('status') || 'Ativo'
            }));

        } catch (error) {
            console.error('[listarMinhasCitas] Erro:', error);
            return [];
        }
    }

    /**
     * 2. cancelarCita(telefoneUsuario, data, horario)
     * Cancela agendamento exato e salva na planilha.
     */
    async cancelarCita(telefoneUsuario, data, horario) {
        try {
            console.log(`[cancelarCita] Tentando cancelar: ${data} ${horario} para ${telefoneUsuario}`);
            const sheet = this.doc.sheetsByTitle['Agendamentos'];
            if (!sheet) return false;

            const rows = await sheet.getRows();
            const targetPhone = normalizeText(telefoneUsuario);
            const targetDate = data.trim();
            const targetTime = horario.trim();

            // Localizar a linha exata (Early return)
            const rowToCancel = rows.find(row => {
                const get = (col) => normalizeText(row.get(col) || '');

                const rData = row.get('data'); // Manter case original para comparação de data
                const rHorario = row.get('horario');
                const rPhone = get('cliente_telefone');

                // Comparação frouxa no telefone para evitar problemas de formatação
                const phoneMatch = rPhone.includes(targetPhone) || targetPhone.includes(rPhone);

                return phoneMatch && rData === targetDate && rHorario === targetTime;
            });

            if (!rowToCancel) {
                console.warn('[cancelarCita] Agendamento não encontrado.');
                return false;
            }

            // Atualização e Persistência
            // Atualização e Persistência
            console.log(`[cancelarCita] Cancelando agendamento linha ${rowToCancel.rowNumber}`);

            // PROTEÇÃO DE FÓRMULAS: Usar Cell-Based Update em vez de Row-Based Save
            // 1. Achar índice da coluna 'status'
            await sheet.loadHeaderRow(); // Ensure headers are loaded
            const headers = sheet.headerValues;
            const statusColIndex = headers.findIndex(h => normalizeText(h) === 'status');

            if (statusColIndex === -1) {
                console.error('[cancelarCita] Coluna Status não encontrada.');
                return false;
            }

            // 2. Carregar apenas a célula específica
            // rowNumber é 1-based. API usa 0-based.
            const rowIndex = rowToCancel.rowNumber - 1;

            await sheet.loadCells({
                startRowIndex: rowIndex,
                endRowIndex: rowIndex + 1,
                startColumnIndex: statusColIndex,
                endColumnIndex: statusColIndex + 1
            });

            // 3. Atualizar e Salvar
            const cell = sheet.getCell(rowIndex, statusColIndex);
            cell.value = 'cancelado';
            await sheet.saveUpdatedCells();
            console.log('[cancelarCita] Célula atualizada com sucesso.');

            return true;

        } catch (error) {
            console.error('[cancelarCita] Erro ao cancelar:', error);
            return false;
        }
    }

    /**
     * 3. gerarHorariosDisponiveis()
     * Gera array de horas baseado na config, excluindo 12:00.
     */
    /**
     * 3. gerarHorariosDisponiveis()
     * Gera array de horas baseado na config e filtra por BLOQUEIOS.
     * Agora aceita data e funcionário para verificar bloqueios específicos.
     */
    async gerarHorariosDisponiveis(targetDateStr, employeeName) {
        try {
            // --- 1. Ler Horário de Funcionamento (Config) ---
            const sheetConfig = this.doc.sheetsByTitle['Config'];
            let openTime = '08:00';
            let closeTime = '18:00';

            if (sheetConfig) {
                const rows = await sheetConfig.getRows();
                const getVal = (key) => {
                    const r = rows.find(r => normalizeText(r.get('Chave')) === normalizeText(key));
                    return r ? r.get('Valor') : null;
                };
                const cfgOpen = getVal('horario_abrir');
                const cfgClose = getVal('horario_fechar');
                if (cfgOpen && cfgOpen.includes(':')) openTime = cfgOpen.trim();
                if (cfgClose && cfgClose.includes(':')) closeTime = cfgClose.trim();
            }

            // --- 2. Gerar Base de Slots ---
            const baseSlots = [];
            const [startH, startM] = openTime.split(':').map(Number);
            const [endH, endM] = closeTime.split(':').map(Number);

            let currentMinutes = startH * 60 + startM;
            const endMinutes = endH * 60 + endM;

            while (currentMinutes < endMinutes) {
                const h = Math.floor(currentMinutes / 60);
                const m = currentMinutes % 60;
                const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

                // Almoço hardcoded: Excluir 12:00 e 12:30 (Intervalo de almoço das 12h as 13h)
                if (timeStr !== '12:00' && timeStr !== '12:30') {
                    baseSlots.push(timeStr);
                }

                currentMinutes += 30; // Incremento de 30 minutos
            }

            // Se não passou data/func, retorna base (fallback para compatibilidade)
            if (!targetDateStr || !employeeName) {
                return baseSlots;
            }

            // --- 3. Filtrar por BLOQUEIOS ---
            const sheetBloqueios = this.doc.sheetsByTitle['Regras_Horarios'];
            if (!sheetBloqueios) {
                return baseSlots; // Sem aba de bloqueios, sem filtros.
            }

            const rowsBloqueios = await sheetBloqueios.getRows();
            const targetDate = parse(targetDateStr, 'dd/MM/yyyy', new Date());

            // --- NEW: Block Sundays Globally ---
            if (getDay(targetDate) === 0) {
                console.log('[SheeteService] Blocked: Sunday');
                return [];
            }

            // Mapeamento dia da semana (date-fns getDay: 0=Domingo, 1=Segunda...)
            const mapDias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
            const targetDayName = normalizeText(mapDias[getDay(targetDate)]);
            console.log(`[SheetService] Checking availabilty for: ${targetDateStr} (${targetDayName}) - Employee: ${employeeName}`);


            const normalizedEmp = normalizeText(employeeName);

            // Filtra slots que ESTÃO bloqueados
            const filteredSlots = baseSlots.filter(slot => {
                // Verifica se este slot cai em alguma regra de bloqueio
                const isBlocked = rowsBloqueios.some(row => {
                    // 1. Checar Profissional (Loose Match)
                    const rowEmp = normalizeText(row.get('Profissional'));
                    // Check if one contains the other to handle "Victor" vs "Victor Gonsalves"
                    if (!rowEmp.includes(normalizedEmp) && !normalizedEmp.includes(rowEmp)) return false;

                    // Dados da linha
                    const rowDataInicio = row.get('Data_Inicio'); // DD/MM/YYYY
                    const rowDataFim = row.get('Data_Fim');       // DD/MM/YYYY
                    const rowDiaSemana = normalizeText(row.get('Dia_Semana'));

                    const rowHoraInicio = row.get('Hora_Inicio');
                    const rowHoraFim = row.get('Hora_Fim');

                    if (!rowHoraInicio || !rowHoraFim) return false; // Bloqueio inválido sem hora

                    // --- LÓGICA DE DATA ---

                    // Caso A: Bloqueio por Data Específica (Prioridade)
                    if (rowDataInicio) {
                        const dStart = parse(rowDataInicio.trim(), 'dd/MM/yyyy', new Date());
                        // Se Data_Fim vazio, assume apenas 1 dia (Start)
                        const dEnd = rowDataFim ? parse(rowDataFim.trim(), 'dd/MM/yyyy', new Date()) : dStart;

                        // Se data alvo está fora do range, não bloqueia por essa regra
                        if (!isWithinInterval(targetDate, { start: startOfDay(dStart), end: startOfDay(dEnd) })) {
                            return false;
                        }
                    }
                    // Caso B: Bloqueio Recorrente (Sem data, checar dia da semana)
                    else {
                        if (!rowDiaSemana) return false; // Regra vazia
                        if (!rowDiaSemana.includes(targetDayName)) return false; // Dia não bate
                    }

                    // --- LÓGICA DE HORA ---
                    const slotTime = slot;
                    const imBlocked = (slotTime >= rowHoraInicio && slotTime < rowHoraFim);
                    if (imBlocked) console.log(`[SheetService] Slot ${slot} BLOCKED by rule: ${rowEmp} | ${rowDiaSemana || 'Date specific'} | ${rowHoraInicio}-${rowHoraFim}`);
                    return imBlocked;
                });

                return !isBlocked; // Mantém se NÃO estiver bloqueado
            });

            console.log(`[SheetService] Final slots for ${employeeName} on ${targetDateStr}: ${filteredSlots.length} slots found.`);
            return filteredSlots;

        } catch (error) {
            console.error('[gerarHorariosDisponiveis] Erro:', error);
            // Em caso de erro crítico, para segurança, podemos retornar vazio ou abrir tudo.
            // Padrão seguro: Retornar vazio para evitar agendamento indevido? Ou baseSlots?
            // Vamos retornar baseSlots e logar erro, para não parar a operação inteira.
            return [];
        }
    }
}

module.exports = new SheetService();
