const sessionService = require('../services/sessionService');
const whatsapp = require('../services/whatsappService');
const apiService = require('../services/apiService');
const msgs = require('../constants/messages');
const { format, addDays, parse, isValid } = require('date-fns');
const { es } = require('date-fns/locale');

const STEPS = {
    START: 'START',
    MENU: 'MENU',
    SELECT_EMPLOYEE: 'SELECT_EMPLOYEE',
    SELECT_DATE: 'SELECT_DATE',
    SELECT_TIME: 'SELECT_TIME',
    ASK_CLIENT_NAME: 'ASK_CLIENT_NAME',
    CONFIRM_APPOINTMENT: 'CONFIRM_APPOINTMENT',
    RETRY_AGENDAMENTO: 'RETRY_AGENDAMENTO',
    MANAGE_APPOINTMENTS: 'MANAGE_APPOINTMENTS',
    POST_APPOINTMENT_ACTION: 'POST_APPOINTMENT_ACTION',
    ASK_MANUAL_DATE: 'ASK_MANUAL_DATE'
};

function normalizeText(text) {
    if (!text) return '';
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function getCleanPhone(message) {
    let raw = message.from;
    if (raw.includes('@lid') && message.sender && message.sender.id) {
        let senderId = typeof message.sender.id === 'string' ? message.sender.id : (message.sender.id._serialized || message.sender.id.user || raw);
        if (typeof senderId === 'string' && senderId.includes('@c.us')) {
            raw = senderId;
        }
    }
    return raw.replace(/@c\.us|@s\.whatsapp\.net|@lid|@g\.us/g, '');
}

async function sendWelcome(from, session) {
    await whatsapp.sendText(from, msgs.WELCOME + msgs.MAIN_MENU_TEXT);
    session.step = STEPS.MENU;
}

// Data Selection (Entry point for scheduling)
async function startScheduling(from, session) {
    const dates = [];
    let checkDate = new Date();
    let daysFound = 0;

    while (daysFound < 6) {
        if (checkDate.getDay() !== 0) {
            dates.push({
                date: format(checkDate, 'dd/MM/yyyy'),
                label: format(checkDate, "EEEE, dd 'de' MMMM", { locale: es })
            });
            daysFound++;
        }
        checkDate = addDays(checkDate, 1);
    }

    session.data.availableDates = dates;

    let msg = '*Selecciona una fecha:*\n';
    dates.forEach((d, i) => msg += `${i + 1}. ${d.label} \n`);
    msg += `${dates.length + 1}. 📅 Elegir otra fecha\n`;
    msg += `0. 🔙 Volver al Menú Principal\n`;

    await whatsapp.sendText(from, msg);
    session.step = STEPS.SELECT_DATE;
}

// Proceed to Employee
async function processDateChoice(from, session, dateStr) {
    session.data.date = dateStr;
    await whatsapp.sendText(from, `📅 Fecha seleccionada: ${dateStr}. Buscando profesionales...`);

    try {
        const employees = await apiService.listarProfissionaisDisponiveis(dateStr);
        if (!employees || employees.length === 0) {
            await whatsapp.sendText(from, msgs.NO_PROFS_AVAIL);
            await whatsapp.sendText(from, msgs.WHAT_TO_DO);
            session.step = STEPS.RETRY_AGENDAMENTO;
            return;
        }

        session.data.availableEmployees = employees.map(emp => ({ id: emp.id, name: emp.name }));
        let msg = '*Elige un profesional:*\n';
        session.data.availableEmployees.forEach((emp, index) => msg += `${index + 1}. ${emp.name} \n`);
        msg += `0. 🔙 Volver para Fechas\n`;

        await whatsapp.sendText(from, msg);
        session.step = STEPS.SELECT_EMPLOYEE;
    } catch (error) {
        console.error('[FlowController] Erro ao buscar profissionais:', error.message);
        await whatsapp.sendText(from, msgs.API_ERROR);
        await sendWelcome(from, session);
    }
}

class FlowController {
    
    async handleMessage(message) {
        if (message.isGroupMsg || message.from === 'status@broadcast') return;

        let from = message.from;
        const bodyRaw = message.body;
        const body = normalizeText(bodyRaw);
        
        let session = await sessionService.getSession(from);

        try {
            switch (session.step) {
                case STEPS.START:
                    await sendWelcome(from, session);
                    break;

                case STEPS.MENU:
                    if (body === '1') {
                        await startScheduling(from, session);
                    } else if (body === '2') {
                        await this.handleListAppointments(from, session, message);
                    } else {
                        await whatsapp.sendText(from, msgs.INVALID_OPTION + msgs.MAIN_MENU_TEXT);
                    }
                    break;

                case STEPS.RETRY_AGENDAMENTO:
                    if (body === '1') {
                        await startScheduling(from, session);
                    } else if (body === '2') {
                        await sendWelcome(from, session);
                    } else {
                        await whatsapp.sendText(from, msgs.INVALID_NUM);
                    }
                    break;

                case STEPS.SELECT_DATE:
                    if (body === '0') {
                        await sendWelcome(from, session);
                        break;
                    }
                    const dateIndex = parseInt(body) - 1;
                    const dates = session.data.availableDates || [];
                    
                    if (body === String(dates.length + 1)) {
                        await whatsapp.sendText(from, msgs.SELECT_MANUAL_DATE);
                        session.step = STEPS.ASK_MANUAL_DATE;
                    } else if (!isNaN(dateIndex) && dateIndex >= 0 && dateIndex < dates.length) {
                        await processDateChoice(from, session, dates[dateIndex].date);
                    } else {
                        await whatsapp.sendText(from, msgs.INVALID_OPTION);
                    }
                    break;

                case STEPS.ASK_MANUAL_DATE:
                    await this.handleManualDate(from, bodyRaw, session);
                    break;

                case STEPS.SELECT_EMPLOYEE:
                    if (body === '0') {
                        await startScheduling(from, session);
                        break;
                    }
                    const empIndex = parseInt(body) - 1;
                    const emps = session.data.availableEmployees || [];

                    if (!isNaN(empIndex) && empIndex >= 0 && empIndex < emps.length) {
                        session.data.employee = emps[empIndex];
                        await whatsapp.sendText(from, `⏳ Buscando horarios para ${session.data.employee.name}...`);
                        
                        try {
                            const slots = await apiService.getAvailableSlots(session.data.date, session.data.employee.id);
                            if (slots.length === 0) {
                                await whatsapp.sendText(from, msgs.NO_SLOTS);
                                await whatsapp.sendText(from, msgs.RETRY_DOC);
                                session.step = STEPS.RETRY_AGENDAMENTO;
                                break;
                            }
                            session.data.availableSlots = slots;
                            let msg = `*Horarios disponibles:*\n`;
                            slots.forEach((slot, i) => msg += `${i + 1}. ${slot} \n`);
                            msg += `0. 🔙 Volver al Profesional\n`;
                            await whatsapp.sendText(from, msg);
                            session.step = STEPS.SELECT_TIME;
                        } catch (error) {
                            console.error('[FlowController] Erro ao buscar horários:', error.message);
                            await whatsapp.sendText(from, msgs.API_ERROR);
                            await sendWelcome(from, session);
                        }
                    } else {
                        await whatsapp.sendText(from, msgs.INVALID_OPTION);
                    }
                    break;

                case STEPS.SELECT_TIME:
                    if (body === '0') {
                        await processDateChoice(from, session, session.data.date);
                        break;
                    }
                    const timeIndex = parseInt(body) - 1;
                    const slots = session.data.availableSlots || [];
                    if (!isNaN(timeIndex) && timeIndex >= 0 && timeIndex < slots.length) {
                        session.data.time = slots[timeIndex];
                        await whatsapp.sendText(from, '*Por favor escribe tu nombre completo:*');
                        session.step = STEPS.ASK_CLIENT_NAME;
                    } else {
                        await whatsapp.sendText(from, msgs.INVALID_OPTION);
                    }
                    break;

                case STEPS.ASK_CLIENT_NAME:
                    if (bodyRaw.length < 3) {
                        await whatsapp.sendText(from, msgs.SHORT_NAME);
                    } else {
                        session.data.clientName = bodyRaw.trim();
                        const summary = `*¿Confirmas la cita/horario?*\nProfesional: ${session.data.employee.name}\n` +
                                        `Fecha: ${session.data.date}\nHora: ${session.data.time}\n` +
                                        `Nombre: ${session.data.clientName}\n\nResponde *Sí* para confirmar o *No* para cancelar.`;
                        await whatsapp.sendText(from, summary);
                        session.step = STEPS.CONFIRM_APPOINTMENT;
                    }
                    break;

                case STEPS.CONFIRM_APPOINTMENT:
                    if (['si', 's', 'sim', 'yes', 'confirmar'].includes(body)) {
                        await this.finalizeAppointment(from, session, message);
                    } else if (['no', 'nao', 'n', 'cancelar'].includes(body)) {
                        await whatsapp.sendText(from, msgs.CANCEL_SUCCESS);
                        await sendWelcome(from, session); 
                    } else {
                        await whatsapp.sendText(from, msgs.CONFIRM_INVALID);
                    }
                    break;

                case STEPS.MANAGE_APPOINTMENTS:
                    if (body === '0') {
                        await sendWelcome(from, session);
                        break;
                    }
                    const cancelIndex = parseInt(body) - 1;
                    const apps = session.data.myAppointments || [];
                    if (!isNaN(cancelIndex) && cancelIndex >= 0 && cancelIndex < apps.length) {
                        await whatsapp.sendText(from, '⏳ Cancelando cita/horario...');
                        const appToCancel = apps[cancelIndex];
                        const phone = getCleanPhone(message);
                        const success = await apiService.cancelarCita(phone, appToCancel.data, appToCancel.horario);
                        await whatsapp.sendText(from, success ? msgs.CANCEL_SUCCESS : msgs.CANCEL_ERROR);
                        await sendWelcome(from, session);
                    } else {
                        await whatsapp.sendText(from, msgs.INVALID_CANCEL_NUM);
                    }
                    break;

                case STEPS.POST_APPOINTMENT_ACTION:
                    if (body === '1') {
                        await this.handleListAppointments(from, session, message);
                    } else if (body === '2') {
                        await whatsapp.sendText(from, msgs.BYE);
                        await sessionService.resetSession(from);
                        return; // Exit early, no need to save locally changed session since it just got reset
                    } else {
                        await whatsapp.sendText(from, msgs.INVALID_NUM);
                    }
                    break;

                default:
                    await sendWelcome(from, session);
                    break;
            }

            // Always save session state after successful execution step
            await sessionService.saveSession(from, session);

        } catch (error) {
            console.error('[FlowController] Erro no fluxo:', error);
            await whatsapp.sendText(from, msgs.FATAL_ERROR);
            await sessionService.resetSession(from);
        }
    }

    async handleManualDate(from, input, session) {
        const formats = ['d/M/yyyy', 'd/M/yy', 'd-M-yyyy', 'd-M-yy', 'd.M.yyyy', 'd.M.yy'];
        let parsedDate = null;
        let pastCandidate = null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const fmt of formats) {
            const attempt = parse(input, fmt, new Date());
            if (isValid(attempt) && attempt.getFullYear() > 1900) {
                const attemptStart = new Date(attempt);
                attemptStart.setHours(0, 0, 0, 0);
                if (attemptStart >= today) {
                    parsedDate = attempt; break;
                } else {
                    if (!pastCandidate) pastCandidate = attempt;
                }
            }
        }

        if (!parsedDate && pastCandidate) parsedDate = pastCandidate;
        if (!parsedDate || !isValid(parsedDate)) {
            await whatsapp.sendText(from, msgs.INVALID_DATE_FMT);
            return; // stay in step
        }
        if (parsedDate.getDay() === 0) {
            await whatsapp.sendText(from, msgs.NO_SUNDAY);
            return;
        }
        if (parsedDate < today) {
            await whatsapp.sendText(from, msgs.NO_PAST_DATE);
            return;
        }

        await processDateChoice(from, session, format(parsedDate, 'dd/MM/yyyy'));
    }

    async finalizeAppointment(from, session, message) {
        if (session.data.isProcessing) return;
        session.data.isProcessing = true;
        await sessionService.saveSession(from, session); // lock immediately
        
        await whatsapp.sendText(from, '⏳ Confirmando agendamento...');
        const appointment = {
            Data: session.data.date, Horario: session.data.time,
            Cliente_Telefone: getCleanPhone(message), Cliente_Nome: session.data.clientName,
            Funcionario_Nome: session.data.employee.name, EmployeeId: session.data.employee.id
        };

        const result = await apiService.addAppointment(appointment);

        if (result.success) {
            await whatsapp.sendText(from, msgs.APP_CONFIRMED);
            await whatsapp.sendText(from, msgs.POST_APP_ACTIONS);
            session.step = STEPS.POST_APPOINTMENT_ACTION;
        } else {
            if (result.reason === 'taken') {
                await whatsapp.sendText(from, msgs.SLOT_TAKEN);
                await sendWelcome(from, session);
            } else {
                await whatsapp.sendText(from, msgs.SAVE_ERROR);
                await sendWelcome(from, session);
            }
        }
        session.data.isProcessing = false;
    }

    async handleListAppointments(from, session, message) {
        try {
            await whatsapp.sendText(from, "⏳ Buscando sus citas/horarios...");
            const phone = getCleanPhone(message);
            const apps = await apiService.listarMinhasCitas(phone);
            
            if (apps.length === 0) {
                await whatsapp.sendText(from, msgs.NO_FUTURE_APPS);
                await sendWelcome(from, session);
            } else {
                session.data.myAppointments = apps;
                let msg = '*Tus Citas/Horarios Futuras:*\n\n';
                apps.forEach((app, index) => {
                    // Formatar data yyyy-MM-dd para dd/MM/yyyy
                    let dataFormatada = app.data;
                    if (app.data && app.data.includes('-')) {
                        const [y, m, d] = app.data.split('-');
                        dataFormatada = `${d}/${m}/${y}`;
                    }
                    const cancelIcon = app.cancelable !== false ? '❌' : '🔒';
                    msg += `${index + 1}. ${cancelIcon} *${dataFormatada}* a las *${app.horario}*\n   Con: ${app.funcionario_nome} (${app.status}) \n\n`;
                });
                msg += '❌ Cancelar cita (envía el número)\n🔒 = No cancelable\n🔙 0 para volver';
                await whatsapp.sendText(from, msg);
                session.step = STEPS.MANAGE_APPOINTMENTS;
            }
        } catch (err) {
            console.error('[FlowController] Erro ao listar citas:', err.message);
            await whatsapp.sendText(from, msgs.API_ERROR);
            await sendWelcome(from, session);
        }
    }
}

module.exports = new FlowController();
