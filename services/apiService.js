const { format, addDays, getDay, isSameDay, parse, isValid, startOfDay } = require('date-fns');
const { es } = require('date-fns/locale');

require('dotenv').config();

const BASE_URL = process.env.URUTAU_API_URL || "https://api.codeart.com.py/api/v1";
const API_KEY = process.env.URUTAU_API_KEY;
const DEFAULT_SERVICIO_ID = process.env.DEFAULT_SERVICIO_ID || 1; // 1 = Corte de Cabello

class ApiService {
    constructor() {
        this.tenantId = null;
        this.branchId = null;
        this.headers = {
            "X-Tenant-Key": API_KEY,
            "Content-Type": "application/json"
        };
    }

    async init() {
        if (!API_KEY) {
            console.error('[ApiService] ERRO: URUTAU_API_KEY não definida no arquivo .env');
            return;
        }
        try {
            console.log('[ApiService] Inicializando conexão com Urutau API...');
            const response = await fetch(`${BASE_URL}/info`, { headers: this.headers });
            const data = await response.json();

            if (data.success) {
                this.tenantId = data.data.tenant_id;
                const sucursales = data.data.sucursales;
                console.log(`[ApiService] Tenant ID conectado: ${this.tenantId}`);
                
                if (sucursales && sucursales.length > 0) {
                    // Try to use the principal first, or just the first one
                    const mainBranch = sucursales.find(s => s.is_principal) || sucursales[0];
                    this.branchId = mainBranch.id;
                    this.headers["X-Branch-ID"] = String(this.branchId);
                    console.log(`[ApiService] Branch ID configurado: ${this.branchId} (${mainBranch.nombre})`);
                } else {
                    console.warn(`[ApiService] AVISO: Nenhuma sucursal disponível para esta API Key.`);
                }
            } else {
                console.error('[ApiService] ERRO na inicialização:', data.error);
            }
        } catch (error) {
            console.error('[ApiService] Erro crítico de rede ao iniciar conexão com a API:', error);
        }
    }

    async listarProfissionaisDisponiveis(dateStr) {
        if (!this.branchId) return [];
        try {
            const response = await fetch(`${BASE_URL}/sucursales/${this.branchId}/empleados`, { headers: this.headers });
            const jsonData = await response.json();
            
            if (jsonData.success && jsonData.data && jsonData.data.empleados) {
                // Return mapping matching the bot's expectations { id, name }
                return jsonData.data.empleados.map(e => ({
                    id: e.id,
                    name: e.nombre_completo || `${e.nombres} ${e.apellidos}`
                }));
            }
            return [];
        } catch (error) {
            console.error('[ApiService] Erro ao buscar empregados:', error);
            return [];
        }
    }

    // Preparado para uso futuro: Buscar os serviços da empresa
    async listarServicios(empresaId = 1) {
        try {
            // A rota fornecida é em demo.codeart.com.py mas com a chave de tenant funciona no api.codeart também.
            const response = await fetch(`${BASE_URL}/servicios?empresa_id=${empresaId}`, { headers: this.headers });
            const jsonData = await response.json();
            
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
             console.error('[ApiService] Erro ao buscar servicos:', error);
             return [];
        }
    }

    async getAvailableSlots(dateStr, employeeId) {
        if (!this.branchId) return [];
        try {
            // API expects YYYY-MM-DD
            const parsedDate = parse(dateStr.trim(), 'dd/MM/yyyy', new Date());
            if (!isValid(parsedDate)) return [];
            
            const apiDate = format(parsedDate, 'yyyy-MM-dd');
            
            const params = new URLSearchParams({
                profesional_id: employeeId,
                servicio_id: DEFAULT_SERVICIO_ID,
                fecha_desde: apiDate,
                fecha_hasta: apiDate
            });

            const response = await fetch(`${BASE_URL}/agenda/disponibilidad?${params}`, { headers: this.headers });
            const jsonData = await response.json();

            if (jsonData.success && jsonData.data && jsonData.data.disponibilidad && jsonData.data.disponibilidad.length > 0) {
                const daySlots = jsonData.data.disponibilidad[0].slots;
                
                // Need to filter out times that already passed if it's today
                const isToday = isSameDay(parsedDate, new Date());
                const currentHour = new Date().getHours() + (new Date().getMinutes() / 60);

                let availableTimes = [];
                for (const slot of daySlots) {
                    if (slot.disponible) {
                        const timeStr = slot.hora_inicio.substring(0, 5); // "10:00:00" -> "10:00"
                        if (isToday) {
                            const [h, m] = timeStr.split(':').map(Number);
                            const slotHourFloat = h + (m / 60);
                            
                            // Only add if at least in the future
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
            console.error('[ApiService] Erro ao buscar slots:', error);
            return [];
        }
    }

    async addAppointment(appointmentData) {
        if (!this.branchId) return { success: false, reason: 'unconfigured' };

        try {
            const parsedDate = parse(appointmentData.Data.trim(), 'dd/MM/yyyy', new Date());
            const apiDate = format(parsedDate, 'yyyy-MM-dd');
            
            // Format phone to proper international if possible
            let phone = appointmentData.Cliente_Telefone;
            if (!phone.startsWith('+')) {
                phone = '+' + phone;
            }

            // Split name into first and last
            const nameParts = appointmentData.Cliente_Nome.split(' ');
            const nombres = nameParts[0] || 'Cliente';
            const apellidos = nameParts.slice(1).join(' ') || '';

            const payloadData = {
                cliente: {
                    nombres: nombres,
                    apellidos: apellidos,
                    telefono: phone
                },
                profesional_id: appointmentData.EmployeeId,
                servicio_id: parseInt(DEFAULT_SERVICIO_ID),
                fecha: apiDate,
                hora_inicio: appointmentData.Horario + ":00", // "10:00:00"
                observaciones: "Agendado via Bot de WhatsApp"
            };

            const response = await fetch(`${BASE_URL}/agenda/reserva`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(payloadData)
            });

            const jsonData = await response.json();

            if (response.status === 201 || jsonData.success) {
               return { success: true, id_agendamento: jsonData.data.cita_id || jsonData.data.numero_cita };
            } else if (response.status === 409 || (jsonData.error && jsonData.error.code === 'SLOT_ALREADY_BOOKED')) {
                return { success: false, reason: 'taken' };
            } else {
                 console.error('[ApiService] Erro da API ao adicionar agendamento:', jsonData);
                 return { success: false, reason: 'error', message: jsonData.error?.message || 'Erro desconhecido' };
            }

        } catch (error) {
            console.error('[ApiService] Erro crítico em addAppointment:', error);
            return { success: false, reason: 'error' };
        }
    }

    async listarMinhasCitas(phone) {
        if (!this.branchId) return [];
        try {
            let allAppointments = [];
            let normPhone = phone;
            if (normPhone.startsWith('+')) {
                normPhone = normPhone.substring(1);
            }

            // Buscar os proximos 14 dias
            for(let i = 0; i < 14; i++) {
                const checkDate = addDays(new Date(), i);
                const apiDate = format(checkDate, 'yyyy-MM-dd');
                
                const params = new URLSearchParams({ 
                    fecha: apiDate,
                    page_size: '50'
                });

                const response = await fetch(`${BASE_URL}/agenda/reporte-diario?${params}`, { headers: this.headers });
                const jsonData = await response.json();
                
                if (jsonData.success && jsonData.data && jsonData.data.citas) {
                     for (const cita of jsonData.data.citas) {
                         // Ignorar canceladas
                         if (cita.estado === 'cancelada') continue;

                         // Match phone
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
             console.error('[ApiService] Erro em listarMinhasCitas:', error);
             return [];
        }
    }

    async cancelarCita(phone, dateStr, timeStr) {
        // Obter as citas para achar o ID
        const minhasCitas = await this.listarMinhasCitas(phone);
        const citaParaCancelar = minhasCitas.find(c => c.data === dateStr && c.horario === timeStr);

        if (!citaParaCancelar || !citaParaCancelar.id_agendamento) {
            console.error('[ApiService] Cita não encontrada para cancelamento ou sem ID.', { dateStr, timeStr, phone });
            return false;
        }

        try {
            // Tentando cancelar pelo endpoint de WhatsApp conforme a guia (FAQ 8.3)
            // POST ou DELETE dependendo da API. A guia diz: /api/whatsapp/agendamentos/{id} (Geralmente é DELETE)
            const response = await fetch(`${BASE_URL.replace('/v1', '/whatsapp')}/agendamentos/${citaParaCancelar.id_agendamento}`, {
                method: 'DELETE',
                headers: this.headers
            });

            if (response.ok) {
                console.log(`[ApiService] Cita ${citaParaCancelar.id_agendamento} cancelada com sucesso.`);
                return true;
            } else {
                const data = await response.json();
                console.error('[ApiService] Erro ao tentar cancelar cita na API:', data);
                return false;
            }
        } catch (error) {
             console.error('[ApiService] Erro crítico ao cancelar cita:', error);
             return false;
        }
    }
}

module.exports = new ApiService();
