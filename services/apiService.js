const { format, addDays, getDay, isSameDay, parse, isValid, startOfDay } = require('date-fns');
const { es } = require('date-fns/locale');
require('dotenv').config();

const BASE_URL = process.env.URUTAU_API_URL || "https://studioferreira.codeart.com.py/api/v1";
const API_KEY = process.env.URUTAU_API_KEY;
const DEFAULT_SERVICIO_ID = process.env.DEFAULT_SERVICIO_ID || 1;

class ApiService {
    constructor() {
        this.tenantId = null;
        this.branchId = null;
        this.headers = {
            "X-Tenant-Key": API_KEY,
            "Content-Type": "application/json"
        };
        this.TIMEOUT_MS = 10000; // 10 segundos timeout
    }

    async _fetchWithTimeout(url, options = {}) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(id);
            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Erro HTTP ${response.status}: ${text}`);
            }
            return await response.json();
        } catch (error) {
            clearTimeout(id);
            if (error.name === 'AbortError') throw new Error(`Timeout da API após ${this.TIMEOUT_MS}ms`);
            throw error; // Repassa erro 500, etc.
        }
    }

    async init() {
        if (!API_KEY) {
            console.error('[ApiService] ERRO: URUTAU_API_KEY não definida no arquivo .env');
            return;
        }
        try {
            console.log('[ApiService] Inicializando conexão com Urutau API...');
            const data = await this._fetchWithTimeout(`${BASE_URL}/info`, { headers: this.headers });

            if (data.success) {
                this.tenantId = data.data.tenant_id;
                this.headers["X-Tenant-ID"] = this.tenantId;
                const sucursales = data.data.sucursales;
                console.log(`[ApiService] Tenant ID conectado: ${this.tenantId}`);

                if (sucursales && sucursales.length > 0) {
                    const mainBranch = sucursales.find(s => s.is_principal) || sucursales[0];
                    this.branchId = mainBranch.id;
                    this.headers["X-Branch-ID"] = String(this.branchId);
                    console.log(`[ApiService] Branch ID configurado: ${this.branchId} (${mainBranch.nombre})`);
                } else {
                    console.warn(`[ApiService] AVISO: Nenhuma sucursal disponível para esta API Key.`);
                }
            } else {
                console.error('[ApiService] ERRO na inicialização:', data.error);
                throw new Error("Init API Error: " + data.error);
            }
        } catch (error) {
            console.error('[ApiService] Erro crítico de rede ao iniciar conexão com a API:', error.message);
            // Non-fatal, let the bot try again later
        }
    }

    async listarProfissionaisDisponiveis(dateStr) {
        if (!this.branchId) await this.init();
        if (!this.branchId) return [];
        try {
            const jsonData = await this._fetchWithTimeout(`${BASE_URL}/sucursales/${this.branchId}/empleados`, { headers: this.headers });
            if (jsonData.success && jsonData.data && jsonData.data.empleados) {
                return jsonData.data.empleados.map(e => ({
                    id: e.id,
                    name: e.nombre_completo || `${e.nombres} ${e.apellidos}`
                }));
            }
            return [];
        } catch (error) {
            console.error('[ApiService] Erro ao buscar profissionais:', error.message);
            throw new Error("API_ERROR");
        }
    }

    async listarServicios(empresaId = 1) {
        try {
            const jsonData = await this._fetchWithTimeout(`${BASE_URL}/servicios?empresa_id=${empresaId}`, { headers: this.headers });
            if (jsonData.success && jsonData.data && jsonData.data.servicios) {
                return jsonData.data.servicios.map(s => ({
                    id: s.id,
                    nombre: s.nombre,
                    duracion: s.duracion_minutos,
                    precio: s.precio
                }));
            }
            return [];
        } catch (error) {
            console.error('[ApiService] Erro ao buscar serviços:', error.message);
            return [];
        }
    }

    async getAvailableSlots(dateStr, employeeId) {
        if (!this.branchId) await this.init();
        if (!this.branchId) return [];
        try {
            const parsedDate = parse(dateStr.trim(), 'dd/MM/yyyy', new Date());
            if (!isValid(parsedDate)) return [];

            const apiDate = format(parsedDate, 'yyyy-MM-dd');
            const params = new URLSearchParams({
                profesional_id: employeeId,
                servicio_id: DEFAULT_SERVICIO_ID,
                fecha_desde: apiDate,
                fecha_hasta: apiDate
            });

            const jsonData = await this._fetchWithTimeout(`${BASE_URL}/agenda/disponibilidad?${params}`, { headers: this.headers });

            if (jsonData.success && jsonData.data && jsonData.data.disponibilidad && jsonData.data.disponibilidad.length > 0) {
                const daySlots = jsonData.data.disponibilidad[0].slots;
                const isToday = isSameDay(parsedDate, new Date());

                let availableTimes = [];
                let lastAddedMinutes = -100; // Inicializa com valor baixo para permitir o primeiro horário

                for (const slot of daySlots) {
                    if (slot.disponible) {
                        const timeStr = slot.hora_inicio.substring(0, 5);
                        const [h, m] = timeStr.split(':').map(Number);
                        const currentSlotMinutes = (h * 60) + m;

                        if (isToday) {
                            const now = new Date();
                            const currentHourFloat = now.getHours() + (now.getMinutes() / 60);
                            const slotHourFloat = h + (m / 60);

                            if (slotHourFloat <= currentHourFloat) continue;
                        }

                        // Filtro de Horário de Almoço: Bloquear entre 11:31 e 13:14
                        // 11:30 = 690 min | 13:15 = 795 min
                        if (currentSlotMinutes > 690 && currentSlotMinutes < 795) continue;

                        // Filtro de 40 minutos
                        if (currentSlotMinutes >= lastAddedMinutes + 40) {
                            availableTimes.push(timeStr);
                            lastAddedMinutes = currentSlotMinutes;
                        }
                    }
                }
                console.log(`[ApiService] Slots originais: ${daySlots.length} | Após filtro de 40min: ${availableTimes.length}`);
                return availableTimes;
            }
            return [];
        } catch (error) {
            console.error('[ApiService] Erro ao buscar slots:', error.message);
            throw new Error("API_ERROR"); // Explícitamente subindo o erro
        }
    }

    async addAppointment(appointmentData) {
        if (!this.branchId) await this.init();
        if (!this.branchId) return { success: false, reason: 'unconfigured' };

        try {
            const parsedDate = parse(appointmentData.Data.trim(), 'dd/MM/yyyy', new Date());
            const apiDate = format(parsedDate, 'yyyy-MM-dd');

            let phone = appointmentData.Cliente_Telefone;
            if (!phone.startsWith('+')) phone = '+' + phone;

            const nameParts = appointmentData.Cliente_Nome.split(' ');
            const nombres = nameParts[0] || 'Cliente';
            const apellidos = nameParts.slice(1).join(' ') || 'Cliente';

            const nowStr = format(new Date(), 'dd/MM/yyyy HH:mm');

            // Enviar APENAS campos obrigatórios + telefono (para buscar cliente existente)
            // Campos opcionais com valor null causam erro 500 no Django do Urutau
            const payloadData = {
                cliente: {
                    nombres: nombres,
                    apellidos: apellidos,
                    telefono: phone
                },
                profesional_id: parseInt(appointmentData.EmployeeId),
                servicio_id: parseInt(process.env.DEFAULT_SERVICIO_ID || 1),
                fecha: apiDate,
                hora_inicio: appointmentData.Horario + ":00",
                observaciones: `Agendado via Bot de WhatsApp | Tel: ${phone} | Realizado em: ${nowStr}`
            };

            console.log('\n--- TENTANDO SALVAR AGENDAMENTO ---');
            console.log('Payload:', JSON.stringify(payloadData, null, 2));

            // Fazer request sem usar _fetchWithTimeout para poder ler o body mesmo com erro
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
            const response = await fetch(`${BASE_URL}/agenda/reserva`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(payloadData),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const responseText = await response.text();
            console.log(`--- RESPOSTA DA API (HTTP ${response.status}) ---`);
            console.log(responseText);
            console.log('-------------------------\n');

            if (!response.ok) {
                console.error(`❌ ERRO HTTP ${response.status} ao salvar agendamento`);
                return { success: false, reason: 'error', message: `Erro HTTP ${response.status}` };
            }

            const jsonData = JSON.parse(responseText);

            if (jsonData.success) {
                return { success: true, id_agendamento: jsonData.data.cita_id || jsonData.data.numero_cita };
            } else if (jsonData.error && jsonData.error.code === 'SLOT_ALREADY_BOOKED') {
                return { success: false, reason: 'taken' };
            } else {
                console.error('❌ ERRO NO URUTAU:', jsonData.error?.message || 'Erro desconhecido');
                return { success: false, reason: 'error', message: jsonData.error?.message };
            }
        } catch (error) {
            clearTimeout(timeoutId);
            console.error('[ApiService] Erro em addAppointment:', error.message);
            // Catch 409 responses which _fetchWithTimeout parses as Error because !res.ok
            if (error.message.includes('Erro HTTP 409')) {
                return { success: false, reason: 'taken' };
            }
            return { success: false, reason: 'error' };
        }
    }

    async listarMinhasCitas(phone) {
        if (!this.branchId) await this.init();
        if (!this.branchId) return [];
        try {
            let normPhone = phone.startsWith('+') ? phone : '+' + phone;

            const params = new URLSearchParams({
                telefono: normPhone,
                estado: 'activas'
            });

            console.log(`[ApiService] Buscando citas para telefone: ${normPhone}`);

            const jsonData = await this._fetchWithTimeout(
                `${BASE_URL}/agenda/reservas?${params}`,
                { headers: this.headers }
            );

            if (jsonData.success && jsonData.data && jsonData.data.citas) {
                const allAppointments = [];
                for (const cita of jsonData.data.citas) {
                    if (cita.estado === 'cancelada') continue;
                    allAppointments.push({
                        data: cita.fecha,
                        horario: cita.hora_inicio.substring(0, 5),
                        cliente_nome: `${jsonData.data.cliente?.nombres || ''} ${jsonData.data.cliente?.apellidos || ''}`.trim(),
                        funcionario_nome: cita.profesional?.nombre || 'N/A',
                        status: cita.estado,
                        id_agendamento: cita.cita_id,
                        cancelable: cita.cancelable
                    });
                }
                console.log(`[ApiService] Encontradas ${allAppointments.length} cita(s) ativa(s).`);
                return allAppointments;
            }
            return [];
        } catch (error) {
            console.error('[ApiService] Erro ao listar citas:', error.message);
            throw new Error("API_ERROR");
        }
    }

    async getReporteDiario(fecha) {
        if (!this.branchId) await this.init();
        if (!this.branchId) return [];
        try {
            const params = new URLSearchParams({
                fecha: fecha // YYYY-MM-DD
            });
            const jsonData = await this._fetchWithTimeout(`${BASE_URL}/agenda/reporte-diario?${params}`, { headers: this.headers });

            if (jsonData.success && jsonData.data && jsonData.data.citas) {
                return jsonData.data.citas;
            }
            return [];
        } catch (error) {
            console.error('[ApiService] Erro ao buscar reporte diario:', error.message);
            return [];
        }
    }

    async cancelarCita(phone, dateStr, timeStr) {
        try {
            const minhasCitas = await this.listarMinhasCitas(phone);
            const citaParaCancelar = minhasCitas.find(c => c.data === dateStr && c.horario === timeStr);

            if (!citaParaCancelar || !citaParaCancelar.id_agendamento) {
                console.error('[ApiService] Cita não encontrada para cancelar:', dateStr, timeStr);
                return false;
            }

            if (citaParaCancelar.cancelable === false) {
                console.warn('[ApiService] Cita não é cancelável:', citaParaCancelar.id_agendamento);
                return false;
            }

            console.log(`[ApiService] Cancelando cita ID: ${citaParaCancelar.id_agendamento}...`);

            const response = await this._fetchWithTimeout(`${BASE_URL}/agenda/reserva/${citaParaCancelar.id_agendamento}`, {
                method: 'DELETE',
                headers: this.headers,
                body: JSON.stringify({ motivo: "Cancelado pelo cliente via WhatsApp Bot" })
            });

            if (response.success) {
                console.log(`[ApiService] ✅ Cita ${citaParaCancelar.id_agendamento} cancelada com sucesso.`);
                return true;
            }
            console.error('[ApiService] Resposta inesperada ao cancelar:', response);
            return false;
        } catch (error) {
            console.error('[ApiService] Erro ao cancelar cita:', error.message);
            return false;
        }
    }
}

module.exports = new ApiService();
