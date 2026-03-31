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
                const currentHour = new Date().getHours() + (new Date().getMinutes() / 60);

                let availableTimes = [];
                for (const slot of daySlots) {
                    if (slot.disponible) {
                        const timeStr = slot.hora_inicio.substring(0, 5);
                        if (isToday) {
                            const [h, m] = timeStr.split(':').map(Number);
                            const slotHourFloat = h + (m / 60);
                            
                            if (slotHourFloat > currentHour) {
                                availableTimes.push(timeStr);
                            }
                        } else {
                            availableTimes.push(timeStr);
                        }
                    }
                }
                return availableTimes;
            }
            return [];
        } catch (error) {
            console.error('[ApiService] Erro ao buscar slots:', error.message);
            throw new Error("API_ERROR"); // Explícitamente subindo o erro
        }
    }

    async addAppointment(appointmentData) {
        if (!this.branchId) return { success: false, reason: 'unconfigured' };

        try {
            const parsedDate = parse(appointmentData.Data.trim(), 'dd/MM/yyyy', new Date());
            const apiDate = format(parsedDate, 'yyyy-MM-dd');
            
            let phone = appointmentData.Cliente_Telefone;
            if (!phone.startsWith('+')) phone = '+' + phone;

            const nameParts = appointmentData.Cliente_Nome.split(' ');
            const nombres = nameParts[0] || 'Cliente';
            const apellidos = nameParts.slice(1).join(' ') || '';

            const payloadData = {
                cliente: { nomes: nombres, apellidos: apellidos, telefono: phone },
                profesional_id: appointmentData.EmployeeId,
                servicio_id: parseInt(DEFAULT_SERVICIO_ID),
                fecha: apiDate,
                hora_inicio: appointmentData.Horario + ":00",
                observaciones: "Agendado via Bot de WhatsApp (VectorFlow)"
            };

            const jsonData = await this._fetchWithTimeout(`${BASE_URL}/agenda/reserva`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(payloadData)
            });

            if (jsonData.success) {
               return { success: true, id_agendamento: jsonData.data.cita_id || jsonData.data.numero_cita };
            } else if (jsonData.error && jsonData.error.code === 'SLOT_ALREADY_BOOKED') {
                return { success: false, reason: 'taken' };
            } else {
                 return { success: false, reason: 'error', message: jsonData.error?.message };
            }
        } catch (error) {
            console.error('[ApiService] Erro em addAppointment:', error.message);
            // Catch 409 responses which _fetchWithTimeout parses as Error because !res.ok
            if (error.message.includes('Erro HTTP 409')) {
                return { success: false, reason: 'taken' };
            }
            return { success: false, reason: 'error' };
        }
    }

    async listarMinhasCitas(phone) {
        if (!this.branchId) return [];
        try {
            let allAppointments = [];
            let normPhone = phone.startsWith('+') ? phone.substring(1) : phone;

            for(let i = 0; i < 14; i++) {
                const checkDate = addDays(new Date(), i);
                const apiDate = format(checkDate, 'yyyy-MM-dd');
                
                const params = new URLSearchParams({ fecha: apiDate, page_size: '50' });
                // Note: might be slow sequentially, but safe
                const jsonData = await this._fetchWithTimeout(`${BASE_URL}/agenda/reporte-diario?${params}`, { headers: this.headers });
                
                if (jsonData.success && jsonData.data && jsonData.data.citas) {
                     for (const cita of jsonData.data.citas) {
                         if (cita.estado === 'cancelada') continue;
                         let cPhone = cita.cliente.telefono || "";
                         if (cPhone.includes(normPhone) || normPhone.includes(cPhone.replace('+',''))) {
                             const parsedDate = parse(jsonData.data.fecha, 'yyyy-MM-dd', new Date());
                             allAppointments.push({
                                 data: format(parsedDate, 'dd/MM/yyyy'),
                                 horario: cita.hora_inicio.substring(0, 5),
                                 cliente_nome: `${cita.cliente.nombres} ${cita.cliente.apellidos}`.trim(),
                                 funcionario_nome: cita.profesional.nombre,
                                 status: cita.estado,
                                 id_agendamento: cita.cita_id || cita.numero_cita
                             });
                         }
                     }
                }
            }
            return allAppointments;
        } catch(error) {
             console.error('[ApiService] Erro em listarMinhasCitas:', error.message);
             throw new Error("API_ERROR");
        }
    }

    async cancelarCita(phone, dateStr, timeStr) {
        try {
            const minhasCitas = await this.listarMinhasCitas(phone);
            const citaParaCancelar = minhasCitas.find(c => c.data === dateStr && c.horario === timeStr);

            if (!citaParaCancelar || !citaParaCancelar.id_agendamento) {
                return false;
            }

            // Using DELETE on the whatsapp specific endpoint
            await this._fetchWithTimeout(`${BASE_URL.replace('/v1', '/whatsapp')}/agendamentos/${citaParaCancelar.id_agendamento}`, {
                method: 'DELETE',
                headers: this.headers
            });
            return true;
        } catch (error) {
             console.error('[ApiService] Erro crítico ao cancelar cita:', error.message);
             return false;
        }
    }
}

module.exports = new ApiService();
