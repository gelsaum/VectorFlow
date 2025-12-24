const whatsapp = require('./services/whatsappService');
const sheetService = require('./services/sheetService');
const { format, addDays, parse, isValid } = require('date-fns');

// In-memory state storage (Use Redis or DB for production)
const userSessions = {};

const STEPS = {
    START: 'START',
    MENU: 'MENU',
    SELECT_EMPLOYEE: 'SELECT_EMPLOYEE',
    SELECT_DATE: 'SELECT_DATE', // Simplified for this demo
    SELECT_TIME: 'SELECT_TIME',
    CONFIRM_APPOINTMENT: 'CONFIRM_APPOINTMENT'
};

const MAIN_MENU_TEXT = `
*Menu Principal*
1. Agendar Horário
2. Ver Meus Agendamentos
3. Falar com Atendente Humano
`;

// Helper to get or create session
function getSession(from) {
    if (!userSessions[from]) {
        userSessions[from] = { step: STEPS.START, data: {} };
    }
    return userSessions[from];
}

function resetSession(from) {
    userSessions[from] = { step: STEPS.START, data: {} };
}

async function handleMessage(message) {
    // Ignore groups/broadcasts for now
    if (message.isGroupMsg || message.from === 'status@broadcast') return;

    const from = message.from;
    const body = message.body.trim();
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
                    await checkAppointments(from);
                    resetSession(from); // Go back to start or keep in menu? Usually reset or show menu again.
                    // For flow continuity, let's show menu again or just end.
                    // Let's reset to allow 'Oi' to trigger start again.
                } else if (body === '3') {
                    await whatsapp.sendText(from, 'Um atendente chamará em breve.');
                    resetSession(from);
                } else {
                    await whatsapp.sendText(from, 'Opção inválida.\n' + MAIN_MENU_TEXT);
                }
                break;

            case STEPS.SELECT_EMPLOYEE:
                await handleEmployeeSelection(from, body, session);
                break;

            case STEPS.SELECT_DATE:
                await handleDateSelection(from, body, session);
                break;

            case STEPS.SELECT_TIME:
                await handleTimeSelection(from, body, session);
                break;

            case STEPS.CONFIRM_APPOINTMENT:
                if (body.toLowerCase() === 'sim' || body.toLowerCase() === 's') {
                    await finalizeAppointment(from, session, message.sender.pushname || 'Cliente');
                } else {
                    await whatsapp.sendText(from, 'Agendamento cancelado.');
                    resetSession(from);
                }
                break;

            default:
                await sendWelcome(from);
                session.step = STEPS.MENU;
                break;
        }
    } catch (error) {
        console.error('Erro no fluxo:', error);
        await whatsapp.sendText(from, 'Ocorreu um erro temporário. Tente novamente mais tarde.');
        resetSession(from);
    }
}

async function sendWelcome(from) {
    let message = 'Olá! Bem-vindo ao nosso sistema de agendamentos.\n';

    // Check promotions
    const promos = await sheetService.getPromotions();
    if (promos.length > 0) {
        message += `\n*Promoção do dia:* ${promos.join('\n')}\n`;
    }

    message += MAIN_MENU_TEXT;
    await whatsapp.sendText(from, message);
}

async function startScheduling(from, session) {
    const employees = await sheetService.getEmployees();
    if (employees.length === 0) {
        await whatsapp.sendText(from, 'Desculpe, não há funcionários disponíveis no momento.');
        resetSession(from);
        return;
    }

    session.availableEmployees = employees; // Cache for selection
    let msg = '*Escolha um profissional:*\n';
    employees.forEach((emp, index) => {
        msg += `${index + 1}. ${emp.name} (${emp.specialty})\n`;
    });

    await whatsapp.sendText(from, msg);
    session.step = STEPS.SELECT_EMPLOYEE;
}

async function handleEmployeeSelection(from, input, session) {
    const index = parseInt(input) - 1;
    const employees = session.availableEmployees || [];

    if (isNaN(index) || index < 0 || index >= employees.length) {
        await whatsapp.sendText(from, 'Opção inválida. Tente novamente.');
        return;
    }

    session.data.employee = employees[index];
    session.step = STEPS.SELECT_DATE;
    await whatsapp.sendText(from, 'Digite a data desejada (Formato DD/MM/AAAA) ou "Hoje"/"Amanhã":');
}

async function handleDateSelection(from, input, session) {
    let dateStr = input.toLowerCase();
    let targetDate = new Date();

    // Simple parser
    if (dateStr.includes('hoje')) {
        // defaults to today
    } else if (dateStr.includes('amanhã') || dateStr.includes('amanha')) {
        targetDate = addDays(targetDate, 1);
    } else {
        // Try strict parse
        const parsed = parse(input, 'dd/MM/yyyy', new Date());
        if (isValid(parsed)) {
            targetDate = parsed;
        } else {
            await whatsapp.sendText(from, 'Data inválida. Use DD/MM/AAAA, "Hoje" ou "Amanhã".');
            return;
        }
    }

    session.data.date = format(targetDate, 'dd/MM/yyyy'); // visual/storage format

    // Generate slots (Mock logic - in real app, might depend on config)
    // 09:00 to 18:00
    const possibleSlots = [
        '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00'
    ];

    // Filter available slots
    const availableSlots = [];
    for (const slot of possibleSlots) {
        const isFree = await sheetService.checkAvailability(
            session.data.date,
            slot,
            session.data.employee.name
        );
        if (isFree) {
            availableSlots.push(slot);
        }
    }

    if (availableSlots.length === 0) {
        await whatsapp.sendText(from, `Não há horários livres para ${session.data.employee.name} em ${session.data.date}. Tente outra data.`);
        // Keep in allow date selection
        return;
    }

    session.data.availableSlots = availableSlots; // cache for validation
    let msg = `*Horários disponíveis para ${session.data.date}:*\n`;
    availableSlots.forEach((slot, i) => msg += `${i + 1}. ${slot}\n`);

    await whatsapp.sendText(from, msg);
    session.step = STEPS.SELECT_TIME;
}

async function handleTimeSelection(from, input, session) {
    const index = parseInt(input) - 1;
    const slots = session.data.availableSlots || [];

    if (isNaN(index) || index < 0 || index >= slots.length) {
        await whatsapp.sendText(from, 'Horário inválido.');
        return;
    }

    session.data.time = slots[index];

    const summary = `*Confirma o agendamento?*\n` +
        `Profissional: ${session.data.employee.name}\n` +
        `Data: ${session.data.date}\n` +
        `Horário: ${session.data.time}\n\n` +
        `Responda *Sim* para confirmar.`;

    await whatsapp.sendText(from, summary);
    session.step = STEPS.CONFIRM_APPOINTMENT;
}

async function finalizeAppointment(from, session, clientName) {
    const appointment = {
        Data: session.data.date,
        Horario: session.data.time,
        Cliente_Telefone: from.replace('@c.us', ''),
        Cliente_Nome: clientName,
        Funcionario_Nome: session.data.employee.name
    };

    const success = await sheetService.addAppointment(appointment);

    if (success) {
        await whatsapp.sendText(from, '✅ Agendamento realizado com sucesso!');
    } else {
        await whatsapp.sendText(from, '❌ Erro ao salvar agendamento. Tente novamente.');
    }
    resetSession(from);
}

async function checkAppointments(from) {
    const phone = from.replace('@c.us', '');
    const apps = await sheetService.getAppointmentsByPhone(phone);

    if (apps.length === 0) {
        await whatsapp.sendText(from, 'Você não possui agendamentos futuros.');
    } else {
        let msg = '*Seus Agendamentos:*\n';
        apps.forEach(app => {
            msg += `- ${app.date} às ${app.time} com ${app.employee}\n`;
        });
        await whatsapp.sendText(from, msg);
    }
}

// MAIN INIT
(async () => {
    console.log('Iniciando sistema...');

    // 1. Connect to Sheets
    try {
        await sheetService.init();
        console.log('Google Sheets conectado.');
    } catch (e) {
        console.error('Falha crítica ao conectar Sheets. Verifique credenciais.', e);
        // We might want to exit or retry, but let's let wpp start just to show error msg to user if needed
    }

    // 2. Start WhatsApp
    whatsapp.start(handleMessage);
})();
