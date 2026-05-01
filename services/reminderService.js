const apiService = require('./apiService');
const sessionService = require('./sessionService');
const whatsappService = require('./whatsappService');
const msgs = require('../constants/messages');
const { format, parse, differenceInMilliseconds, isBefore, isAfter } = require('date-fns');

class ReminderService {
    constructor() {
        this.activeTimers = new Map();
        this.REMINDER_MINUTES = 20; // 20 minutos antes
        this.SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutos
    }

    async init() {
        console.log('[ReminderService] Inicializando...');
        
        // Carrega alarmes do SQLite
        const reminders = await sessionService.getReminders();
        const now = Date.now();
        
        for (const r of reminders) {
            if (r.target_time > now) {
                this.setTimer(r.id_agendamento, r.phone, r.target_time, r.hora_inicio, r.profesional_nombre);
            } else {
                // Se já passou, limpa do banco
                await sessionService.deleteReminder(r.id_agendamento);
            }
        }
        
        console.log(`[ReminderService] Restabelecidos ${this.activeTimers.size} alarmes salvos.`);

        // Inicia Sincronização Periódica
        setInterval(() => this.syncAppointments(), this.SYNC_INTERVAL_MS);
        // Roda uma vez no boot também
        setTimeout(() => this.syncAppointments(), 5000);
    }

    async scheduleReminder(cita_id, phone, fechaStr, horaInicioStr, profesional_nombre) {
        // Parse fechaStr "yyyy-MM-dd" e horaInicioStr "HH:mm:ss"
        try {
            const appointmentDateStr = `${fechaStr} ${horaInicioStr}`;
            const appointmentTime = parse(appointmentDateStr, 'yyyy-MM-dd HH:mm:ss', new Date());
            
            // Subtrai 20 minutos
            const targetTime = appointmentTime.getTime() - (this.REMINDER_MINUTES * 60 * 1000);
            
            if (targetTime > Date.now()) {
                await sessionService.addReminder(cita_id, phone, targetTime, horaInicioStr.substring(0, 5), profesional_nombre, '{}');
                this.setTimer(cita_id, phone, targetTime, horaInicioStr.substring(0, 5), profesional_nombre);
                console.log(`[ReminderService] Lembrete agendado para cita ${cita_id} às ${format(new Date(targetTime), 'HH:mm:ss')}`);
            }
        } catch (error) {
            console.error('[ReminderService] Erro ao agendar lembrete:', error);
        }
    }

    setTimer(cita_id, phone, targetTime, hora_inicio, profesional_nombre) {
        if (this.activeTimers.has(cita_id)) {
            clearTimeout(this.activeTimers.get(cita_id));
        }

        const delay = targetTime - Date.now();
        const timer = setTimeout(() => {
            this.triggerReminder(cita_id, phone, hora_inicio, profesional_nombre);
        }, delay);

        this.activeTimers.set(cita_id, timer);
    }

    async triggerReminder(cita_id, phone, hora_inicio, profesional_nombre) {
        console.log(`[ReminderService] Disparando lembrete para cita ${cita_id}...`);
        this.activeTimers.delete(cita_id);
        
        try {
            // Verificar na API se a cita ainda está confirmada/pendente
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const citasHoje = await apiService.getReporteDiario(todayStr);
            
            const citaAtiva = citasHoje.find(c => String(c.cita_id) === String(cita_id) && c.estado !== 'cancelada');
            
            if (citaAtiva) {
                // Atualizar estado da sessão para aguardar resposta
                let session = await sessionService.getSession(phone);
                
                // Se a sessão estava vazia ou START, preenche dados mínimos
                session.step = 'AWAITING_REMINDER_REPLY';
                session.data = { ...session.data, cancelCitaId: cita_id };
                
                await sessionService.saveSession(phone, session);
                
                // Enviar mensagem proativa
                const msg = `⏰ *Lembrete de Agendamento*\n\n¡Hola! Recuerda que tienes una cita en aproximadamente ${this.REMINDER_MINUTES} minutos (a las *${hora_inicio}*) con *${profesional_nombre}*.\n\n¿Confirmas tu asistencia?\n1. Sí, confirmo\n2. No, cancelar cita`;
                await whatsappService.sendText(phone, msg);
            } else {
                console.log(`[ReminderService] Cita ${cita_id} não encontrada ou cancelada. Abortando lembrete.`);
            }
        } catch (error) {
            console.error('[ReminderService] Erro ao disparar lembrete:', error);
        } finally {
            await sessionService.deleteReminder(cita_id);
        }
    }

    async syncAppointments() {
        const now = new Date();
        const currentHour = now.getHours();
        
        // Restrição de horário comercial (06:00 as 20:00)
        if (currentHour < 6 || currentHour >= 20) {
            console.log('[ReminderService] Fora do horário comercial. Sincronização pulada.');
            return;
        }

        console.log('[ReminderService] Iniciando sincronização de agendamentos do dia...');
        try {
            const todayStr = format(now, 'yyyy-MM-dd');
            const citasHoje = await apiService.getReporteDiario(todayStr);
            
            let addedCount = 0;
            for (const cita of citasHoje) {
                if (cita.estado === 'cancelada') continue;
                
                const citaIdStr = String(cita.cita_id);
                
                // Se não estivermos rastreando essa cita e for no futuro, agendamos
                if (!this.activeTimers.has(citaIdStr)) {
                    const appointmentDateStr = `${cita.fecha} ${cita.hora_inicio}`;
                    const appointmentTime = parse(appointmentDateStr, 'yyyy-MM-dd HH:mm:ss', new Date());
                    
                    if (appointmentTime.getTime() > now.getTime()) {
                        let phone = cita.cliente?.telefono;
                        if (!phone) continue;
                        
                        await this.scheduleReminder(cita.cita_id, phone, cita.fecha, cita.hora_inicio, cita.profesional?.nombre || 'Profissional');
                        addedCount++;
                    }
                }
            }
            if (addedCount > 0) {
                console.log(`[ReminderService] Sincronização concluída: ${addedCount} novos lembretes agendados.`);
            }
        } catch (error) {
            console.error('[ReminderService] Erro na sincronização:', error.message);
        }
    }
}

module.exports = new ReminderService();
