const whatsapp = require('./services/whatsappService');
const sheetService = require('./services/sheetService');
const { format, addDays, parse, isValid } = require('date-fns');
const { es } = require('date-fns/locale');

// In-memory state storage
const userSessions = {};

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

const MAIN_MENU_TEXT = `
*Menú Principal*
1. Agendar Cita
2. Ver Mis Citas
`;

// --- Utils ---
function normalizeText(text) {
    if (!text) return '';
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function getSession(from) {
    if (!userSessions[from]) userSessions[from] = { step: STEPS.START, data: {} };
    return userSessions[from];
}

function resetSession(from) {
    userSessions[from] = { step: STEPS.START, data: {} };
}

// --- Main Handler ---
async function handleMessage(message) {
    if (message.isGroupMsg || message.from === 'status@broadcast') return;

    const from = message.from;
    const bodyRaw = message.body;
    const body = normalizeText(bodyRaw);
    const session = getSession(from);

    try {
        switch (session.step) {
            case STEPS.START:
                await sendWelcome(from);
                session.step = STEPS.MENU;
                break;

            case STEPS.MENU:
                if (body === '1') {
                    await startScheduling(from, session);
                } else if (body === '2') {
                    await handleListAppointments(from, session);
                } else if (body === '2') {
                    await handleListAppointments(from, session);
                } else {
                    await whatsapp.sendText(from, 'Opción inválida.\n' + MAIN_MENU_TEXT);
                }
                break;

            case STEPS.SELECT_EMPLOYEE:
                await handleEmployeeSelection(from, body, session);
                break;

            case STEPS.RETRY_AGENDAMENTO:
                if (body === '1') {
                    await startScheduling(from, session);
                } else if (body === '2') {
                    await sendWelcome(from);
                    session.step = STEPS.MENU;
                } else if (body === '2') {
                    await sendWelcome(from);
                    session.step = STEPS.MENU;
                } else {
                    await whatsapp.sendText(from, 'Opción inválida. Digite 1 o 2.');
                }
                break;

            case STEPS.SELECT_DATE:
                await handleDateSelection(from, body, session);
                break;

            case STEPS.SELECT_TIME:
                await handleTimeSelection(from, body, session);
                break;

            case STEPS.ASK_CLIENT_NAME:
                await handleClientName(from, bodyRaw, session);
                break;

            case STEPS.CONFIRM_APPOINTMENT:
                if (['si', 's', 'sim', 'yes', 'confirmar'].includes(body)) {
                    await finalizeAppointment(from, session);
                } else if (['no', 'nao', 'n', 'cancelar'].includes(body)) {
                    await whatsapp.sendText(from, 'Cita cancelada.');
                    resetSession(from);
                    await sendWelcome(from); // Optional: show menu again
                    session.step = STEPS.MENU;
                } else {
                    await whatsapp.sendText(from, '⚠️ Opción inválida. Por favor responde *Sí* para confirmar o *No* para cancelar.');
                    // Do not reset session, stay in this step
                }
                break;

            case STEPS.MANAGE_APPOINTMENTS:
                await handleCancellationSelection(from, body, session);
                break;

            case STEPS.POST_APPOINTMENT_ACTION:
                if (body === '1') {
                    // Ver cita (Go to list)
                    await handleListAppointments(from, session);
                } else if (body === '2') {
                    // Finalizar
                    await whatsapp.sendText(from, '¡Gracias por usar nuestro sistema! 👋');
                    resetSession(from);
                } else {
                    await whatsapp.sendText(from, 'Opción inválida. Digite 1 o 2.');
                }
                break;

            case STEPS.ASK_MANUAL_DATE:
                await handleManualDate(from, bodyRaw, session);
                break;

            default:
                await sendWelcome(from);
                session.step = STEPS.MENU;
                break;
        }
    } catch (error) {
        console.error('Error en el flujo:', error);
        await whatsapp.sendText(from, 'Ocurrió un error temporal. Inténtalo de nuevo más tarde.');
        resetSession(from);
    }
}

// --- Action Functions ---

async function sendWelcome(from) {
    let message = '¡Hola! Bienvenido a *Studio Ferreira* en que podemos ayudarte?.\n';
    message += MAIN_MENU_TEXT;
    await whatsapp.sendText(from, message);
}

// --- REFACTORED FLOW: DATE -> EMPLOYEE -> TIME ---

async function startScheduling(from, session) {
    // 1. Mostrar Datas Disponíveis (Hoje, Amanhã, Depois)
    // Usamos lógica similar ao getNextAvailableDays mas sem checar employee ainda.
    // Vamos gerar próximos 3 dias válidos (exclui Domingo).

    const dates = [];
    let checkDate = new Date(); // Start Today
    let daysFound = 0;

    // Simple Loop to find next 3 valid days
    while (daysFound < 3) {
        if (checkDate.getDay() !== 0) { // Not Sunday
            dates.push({
                date: format(checkDate, 'dd/MM/yyyy'),
                label: format(checkDate, "EEEE, dd 'de' MMMM", { locale: es })
            });
            daysFound++;
        }
        checkDate = addDays(checkDate, 1);
    }

    session.availableDates = dates;

    let msg = '*Selecciona una fecha para tu cita:*\n';
    dates.forEach((d, i) => {
        msg += `${i + 1}. ${d.label} \n`;
    });
    msg += `${dates.length + 1}. 📅 Elegir otra fecha\n`;

    await whatsapp.sendText(from, msg);
    session.step = STEPS.SELECT_DATE;
}

// 2. Handle Date -> Show Employees
async function handleDateSelection(from, input, session) {
    const index = parseInt(input) - 1;
    const dates = session.availableDates || [];

    if (isNaN(index) || index < 0 || index > dates.length) {
        await whatsapp.sendText(from, 'Opción inválida. Selecciona un número de la lista.');
        return;
    }

    // Manual Option
    if (index === dates.length) {
        await whatsapp.sendText(from, '✍️ Por favor, escribe la fecha en formato *día/mes/año* (ej: 25/12/2025):');
        session.step = STEPS.ASK_MANUAL_DATE;
        return;
    }

    // Selected Pre-defined Date
    const selectedDate = dates[index].date;
    await processDateChoice(from, session, selectedDate);
}

// Manual Date Handler re-routed
async function handleManualDate(from, dateInput, session) {
    // Normalize logic
    const parsedDate = parse(dateInput, 'd/M/yyyy', new Date());
    if (!isValid(parsedDate)) {
        await whatsapp.sendText(from, 'Foramto inválido. Use dia/mes/ano (ex: 01/02/2025).');
        return;
    }

    // Check Sunday
    if (parsedDate.getDay() === 0) {
        await whatsapp.sendText(from, '⚠️ Lo siento, no trabajamos los domingos. Por favor elige otra fecha.');
        return;
    }

    // Check Past Date
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today to start of day
    const checkDate = new Date(parsedDate);
    checkDate.setHours(0, 0, 0, 0);

    if (checkDate < today) {
        await whatsapp.sendText(from, '⚠️ No puedes seleccionar una fecha pasada. Por favor elige una fecha futura.');
        return;
    }

    const normalizedDateStr = format(parsedDate, 'dd/MM/yyyy');
    await processDateChoice(from, session, normalizedDateStr);
}

// Helper to transition from Date -> Employee List
async function processDateChoice(from, session, dateStr) {
    session.data.date = dateStr;
    await whatsapp.sendText(from, `📅 Fecha seleccionada: ${dateStr}. Buscando profesionales disponibles...`);

    // Fetch Employees available on this date
    const employeeNames = await sheetService.listarProfissionaisDisponiveis(dateStr);

    if (!employeeNames || employeeNames.length === 0) {
        await whatsapp.sendText(from, '⚠️ Lo siento, no hay profesionales disponibles para esta fecha (Quizás es feriado o están todos ocupados).');
        const errorMsg = '*¿Qué deseas hacer?*\n' +
            '1. Elegir otra fecha\n' +
            '2. Volver al Menú Principal';
        await whatsapp.sendText(from, errorMsg);
        session.step = STEPS.RETRY_AGENDAMENTO;
        return;
    }

    // Store objects for consistency
    session.availableEmployees = employeeNames.map(name => ({ name }));

    let msg = '*Elige un profesional:*\n';
    session.availableEmployees.forEach((emp, index) => {
        msg += `${index + 1}. ${emp.name} \n`;
    });

    await whatsapp.sendText(from, msg);
    session.step = STEPS.SELECT_EMPLOYEE;
}

// 3. Handle Employee -> Show Times
async function handleEmployeeSelection(from, input, session) {
    const index = parseInt(input) - 1;
    const employees = session.availableEmployees || [];

    if (isNaN(index) || index < 0 || index >= employees.length) {
        await whatsapp.sendText(from, 'Opción inválida. Inténtalo de nuevo.');
        return;
    }

    const selectedEmp = employees[index];
    session.data.employee = selectedEmp; // Object { name }

    await whatsapp.sendText(from, `⏳ Buscando horarios para ${selectedEmp.name} el ${session.data.date}...`);

    // Fetch Slots
    const availableSlots = await sheetService.getAvailableSlots(
        session.data.date,
        selectedEmp.name
    );

    if (availableSlots.length === 0) {
        await whatsapp.sendText(from, `⚠️ Lo siento, no hay horarios libres para ${selectedEmp.name} en esta fecha.`);
        // Option to pick another doc?
        const errorMsg = '*¿Qué deseas hacer?*\n' +
            '1. Elegir otro profesional\n' +
            '2. Volver al Menú Principal';
        await whatsapp.sendText(from, errorMsg);

        // Trick: Set step to RETRY but handle logic to go back to employee list?
        // Actually simplest is just retry agendamento options
        session.step = STEPS.RETRY_AGENDAMENTO;
        return;
    }

    session.data.availableSlots = availableSlots;
    let msg = `* Horarios disponibles:*\n`;
    availableSlots.forEach((slot, i) => msg += `${i + 1}. ${slot} \n`);

    await whatsapp.sendText(from, msg);
    session.step = STEPS.SELECT_TIME;
}

async function handleTimeSelection(from, input, session) {
    const index = parseInt(input) - 1;
    const slots = session.data.availableSlots || [];

    if (isNaN(index) || index < 0 || index >= slots.length) {
        await whatsapp.sendText(from, 'Opción de horario inválida.');
        return;
    }

    session.data.time = slots[index];

    await whatsapp.sendText(from, '*Por favor escribe tu nombre completo:*');
    session.step = STEPS.ASK_CLIENT_NAME;
}

async function handleClientName(from, nameInput, session) {
    if (nameInput.length < 3) {
        await whatsapp.sendText(from, 'Nombre muy corto. Por favor, escribe tu nombre completo.');
        return;
    }

    session.data.clientName = nameInput.trim();

    const summary = `*¿Confirmas la cita ?*\n` +
        `Profesional: ${session.data.employee.name} \n` +
        `Fecha: ${session.data.date} \n` +
        `Hora: ${session.data.time} \n` +
        `Nombre: ${session.data.clientName} \n\n` +
        `Responde * Sí * para confirmar o * No * para cancelar.`;

    await whatsapp.sendText(from, summary);
    session.step = STEPS.CONFIRM_APPOINTMENT;
}



async function finalizeAppointment(from, session) {
    if (session.isProcessing) return; // Prevent double submission
    session.isProcessing = true;

    await whatsapp.sendText(from, '⏳ Confirmando agendamento...');

    const appointment = {
        Data: session.data.date,
        Horario: session.data.time,
        Cliente_Telefone: from.replace('@c.us', ''),
        Cliente_Nome: session.data.clientName,
        Funcionario_Nome: session.data.employee.name
    };

    const result = await sheetService.addAppointment(appointment);

    if (result.success) {
        await whatsapp.sendText(from, '✅ ¡Cita confirmada con éxito!');

        await whatsapp.sendText(from, '*¿Qué deseas hacer ahora?*\n' +
            '1. Ver detalles de mi cita\n' +
            '2. Finalizar conversación');

        session.step = STEPS.POST_APPOINTMENT_ACTION;
    } else {
        if (result.reason === 'taken') {
            await whatsapp.sendText(from, '⚠️ ¡Vaya! Alguien acaba de reservar este horario exacto hace un momento. 😓\n\nPor favor, selecciona otro horario.');
            // Send back to time selection or date selection?
            // Let's send back to retry/menu for simplicity or restart scheduling
            session.step = STEPS.MENU;
            await startScheduling(from, session); // Restart flow easier
        } else {
            await whatsapp.sendText(from, '❌ Error al guardar la cita. Inténtalo de nuevo.');
            resetSession(from);
        }
    }
    // No need to reset .isProcessing because we resetSession() or move step
}

async function handleListAppointments(from, session) {
    const phone = from.replace('@c.us', '');
    const apps = await sheetService.listarMinhasCitas(phone); // Using new strict function

    if (apps.length === 0) {
        await whatsapp.sendText(from, '📅 No tienes citas futuras agendadas.');
        resetSession(from);
    } else {
        session.myAppointments = apps; // Store for selection
        let msg = '*Tus Citas Futuras:*\n\n';
        apps.forEach((app, index) => {
            msg += `${index + 1}. * ${app.data}* a las * ${app.horario}*\n   Con: ${app.funcionario_nome} (${app.status}) \n\n`;
        });
        msg += '❌ Para cancelar una cita, envía el *número de la opción* que aparece en la lista de arriba.\n' +
            '🔙 Envía *0* para volver al menú principal.';

        await whatsapp.sendText(from, msg);
        session.step = STEPS.MANAGE_APPOINTMENTS;
    }
}

async function handleCancellationSelection(from, input, session) {
    if (input === '0') {
        await sendWelcome(from);
        session.step = STEPS.MENU;
        return;
    }

    const index = parseInt(input) - 1;
    const apps = session.myAppointments || [];

    if (isNaN(index) || index < 0 || index >= apps.length) {
        await whatsapp.sendText(from, '⚠️ Opción inválida. Envía el número de la cita a cancelar o 0 para volver.');
        return;
    }

    const appToCancel = apps[index];
    const phone = from.replace('@c.us', '');

    await whatsapp.sendText(from, '⏳ Cancelando cita...');

    const success = await sheetService.cancelarCita(phone, appToCancel.data, appToCancel.horario);

    if (success) {
        await whatsapp.sendText(from, '✅ Cita cancelada con éxito.');
    } else {
        await whatsapp.sendText(from, '❌ Hubo un error al cancelar. Inténtalo de nuevo.');
    }

    // Return to main menu or show list again? Let's go to main menu to not loop indefinitely if they want to exit
    resetSession(from);
    // Optional: could re-list if they have multiple, but simplicity is better.
    await sendWelcome(from);
    // Need to set step for new session
    let newSession = getSession(from);
    newSession.step = STEPS.MENU;
}

const licenseService = require('./services/licenseService');
const webService = require('./services/webService');

// MAIN INIT
(async () => {
    console.log('Iniciando sistema...');

    // 1. License Check
    console.log('Verificando licença...');
    const isLicensed = await licenseService.verifyLicense();
    if (!isLicensed) {
        console.error('⛔ LICENÇA INVÁLIDA OU INATIVA. O BOT SERÁ DESLIGADO.');
        process.exit(1);
    }
    console.log('✅ Licença Válida. Iniciando serviços...');

    // Periodic License Check (every 6 hours)
    setInterval(async () => {
        console.log('🔄 Re-verificando licença...');
        const valid = await licenseService.verifyLicense();
        if (!valid) {
            console.error('⛔ LICENÇA EXPIRADA OU CANCELADA. ENCERRANDO SISTEMA.');
            process.exit(1);
        }
    }, 6 * 60 * 60 * 1000);

    try {
        webService.init(); // Start Web Server
        await sheetService.init();
        console.log('Google Sheets conectado.');
    } catch (e) {
        console.error('Fallo crítico al conectar Sheets:', e);
    }
    whatsapp.start(handleMessage);
})();
