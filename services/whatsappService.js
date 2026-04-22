const axios = require('axios');
const webService = require('./webService'); // Note: keep require but webService will now act mainly as Express server

class WhatsappService {
    constructor() {
        this.client = true; // Compatibility flag
        this.handler = null;
        this.apiUrl = process.env.EVOLUTION_API_URL ? process.env.EVOLUTION_API_URL.replace(/\/$/, '') : '';
        this.apiKey = process.env.EVOLUTION_API_KEY;
        this.instanceName = process.env.EVOLUTION_INSTANCE_NAME;
    }

    async start(messageHandler) {
        this.handler = messageHandler;
        console.log(`[WhatsappService] Configurado para usar Evolution API en instancia: ${this.instanceName}`);
        console.log('Esperando webhooks en /webhook...');
    }

    async sendText(to, content) {
        if (!this.apiUrl || !this.instanceName) {
            console.error('Evolution API configs missing in .env');
            return;
        }
        try {
            // Asegurarse de que el número incluye el sufijo correcto para enviar en Evolution API
            let number = to;
            if (!number.includes('@s.whatsapp.net') && !number.includes('@g.us')) {
                number = `${number}@s.whatsapp.net`;
            }

            await axios.post(
                `${this.apiUrl}/message/sendText/${this.instanceName}`,
                {
                    number: number,
                    text: content
                },
                {
                    headers: {
                        'apikey': this.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );
        } catch (error) {
            console.error('Error sending message via Evolution API:', error.response ? error.response.data : error.message);
        }
    }

    async getContact(id) {
        // Fake contact to maintain compatibility, or we could fetch it via Evolution API if really needed
        return { pushname: 'Cliente' };
    }

    handleEvolutionWebhook(payload) {
        if (!this.handler) return;
        
        // Atender solo eventos de mensajes entrantes de Evolution API
        if (payload.event === 'messages.upsert' && payload.data) {
            const data = payload.data;
            if (!data.key || data.key.fromMe) return; // Ignorar nuestros propios mensajes o si no hay key
            
            // Extraer el texto del mensaje
            let body = '';
            if (data.message?.conversation) {
                body = data.message.conversation;
            } else if (data.message?.extendedTextMessage?.text) {
                body = data.message.extendedTextMessage.text;
            } else if (data.messageType === 'conversation' || data.messageType === 'extendedTextMessage') {
                body = data.message?.text || '';
            }

            if (!body) {
                const from = data.key.remoteJid;
                const isGroupMsg = from.includes('@g.us');
                if (!isGroupMsg && data.message) {
                    const hasMedia = data.message.audioMessage || data.message.imageMessage || data.message.videoMessage || data.message.documentMessage || data.message.stickerMessage || data.message.locationMessage || data.message.contactMessage;
                    if (hasMedia) {
                        this.sendText(from, require('../constants/messages').ONLY_TEXT);
                    }
                }
                return; // Si no es un mensaje de texto, ignorarlo
            }
            
            const from = data.key.remoteJid;
            const isGroupMsg = from.includes('@g.us');
            
            const normalizedMessage = {
                from: from,
                body: body,
                isGroupMsg: isGroupMsg,
                sender: { id: from },
                raw: data
            };

            this.handler(normalizedMessage);
        }
    }
}

module.exports = new WhatsappService();
