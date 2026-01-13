const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

class WebService {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server);
        this.port = process.env.PORT || 3000;
        this.lastQR = null;

        this.setupRoutes();
        this.setupSocket();
    }

    setupRoutes() {
        this.app.get('/scan', (req, res) => {
            res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>WhatsApp QR Scan</title>
                    <style>
                        body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #f0f2f5; margin: 0; }
                        .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; }
                        h1 { color: #333; margin-bottom: 1rem; }
                        #qr-image { width: 300px; height: 300px; background: #eee; margin: 1rem auto; display: flex; align-items: center; justify-content: center; }
                        img { width: 100%; height: auto; }
                        .status { margin-top: 1rem; color: #666; font-size: 0.9rem; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>Escanea el Código QR</h1>
                        <div id="qr-image">
                            <p>Esperando QR...</p>
                        </div>
                        <p class="status">Usando Socket.io para actualizaciones en tiempo real.</p>
                    </div>

                    <script src="/socket.io/socket.io.js"></script>
                    <script>
                        const socket = io();
                        const qrContainer = document.getElementById('qr-image');

                        socket.on('connect', () => {
                            console.log('Conectado al servidor');
                        });

                        socket.on('qr_code', (dataUrl) => {
                            console.log('QR Recibido');
                            qrContainer.innerHTML = '<img src="' + dataUrl + '" alt="QR Code" />';
                        });
                    </script>
                </body>
                </html>
            `);
        });
    }

    setupSocket() {
        this.io.on('connection', (socket) => {
            console.log('Cliente Web conectado');
            // Send last QR if available immediately on connection
            if (this.lastQR) {
                socket.emit('qr_code', this.lastQR);
            }
        });
    }

    init() {
        this.server.listen(this.port, () => {
            console.log('🚀 Servidor Web iniciado en http://localhost:' + this.port + '/scan');
            console.log('👉 Para acceso remoto, use ngrok: "ngrok http ' + this.port + '"');
        });
    }

    async updateQR(qrData) {
        // qrData can be the raw string or base64. 
        // If it's the raw string (doesn't start with data:), convert it.
        // If it comes from WPPConnect 'base64Qr', it is already a Data URL.

        let dataUrl = qrData;

        if (!qrData.startsWith('data:')) {
            try {
                dataUrl = await QRCode.toDataURL(qrData);
            } catch (err) {
                console.error('Error generando QR image:', err);
                return;
            }
        }

        this.lastQR = dataUrl;
        this.io.emit('qr_code', dataUrl);
    }
}

module.exports = new WebService();
