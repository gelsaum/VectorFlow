const express = require('express');
const http = require('http');

class WebService {
    constructor() {
        this.app = express();
        
        // Middleware para parsear el JSON del webhook
        this.app.use(express.json());

        this.server = http.createServer(this.app);
        this.port = process.env.PORT || 3000;

        this.setupRoutes();
    }

    setupRoutes() {
        this.app.get('/', (req, res) => {
            res.send('Bot Activo y escuchando webhooks para Evolution API.');
        });

        // Este es el endpoint que deberás configurar en Evolution API
        this.app.post('/webhook', (req, res) => {
            // Respondemos rápido para evitar timeouts en Evolution API
            res.status(200).send('OK');

            console.log('\n==================================');
            console.log('📥 WEBHOOK RECIBIDO DE EVOLUTION');
            console.log(JSON.stringify(req.body, null, 2));
            console.log('==================================\n');

            try {
                // Se requiere aquí para evitar dependencias circulares,
                // ya que whatsappService también requiere webService.
                const whatsapp = require('./whatsappService');
                
                // Procesar el payload
                whatsapp.handleEvolutionWebhook(req.body);
            } catch (error) {
                console.error('Error procesando webhook:', error);
            }
        });
    }

    init() {
        this.server.on('error', (e) => {
            if (e.code === 'EADDRINUSE') {
                console.log(`Porta ${this.port} em uso, tentando proxima...`);
                this.port++;
                this.server.listen(this.port);
            } else {
                console.error('Erro no servidor web:', e);
            }
        });

        this.server.listen(this.port, async () => {
            console.log('🚀 Servidor Web iniciado en puerto ' + this.port);

            const ngrokUrl = await this.getNgrokUrl();
            if (ngrokUrl) {
                console.log('===================================================');
                console.log('🌍 🎉 PUBLIC WEBHOOK URL (Configura esto en Evolution):');
                console.log(`    ${ngrokUrl}/webhook`);
                console.log('===================================================');
            } else {
                console.log('===================================================');
                console.log('👉 No se detectó ngrok.');
                console.log('Si configuras en un VPS, usa la IP pública de tu servidor:');
                console.log(`    http://TU_IP_AQUI:${this.port}/webhook`);
                console.log('===================================================');
            }
        });
    }

    getNgrokUrl() {
        return new Promise((resolve) => {
            const req = http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        const tunnel = json.tunnels.find(t => t.proto === 'https');
                        if (tunnel) {
                            resolve(tunnel.public_url);
                        } else {
                            resolve(null);
                        }
                    } catch (e) {
                        resolve(null);
                    }
                });
            });
            req.on('error', () => {
                resolve(null);
            });
            req.setTimeout(2000, () => {
                req.destroy();
                resolve(null);
            });
        });
    }
}

module.exports = new WebService();
