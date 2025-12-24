const wppconnect = require('@wppconnect-team/wppconnect');

class WhatsappService {
    constructor() {
        this.client = null;
    }

    async start(messageHandler) {
        wppconnect
            .create({
                session: 'booking-bot',
                catchQR: (base64Qr, asciiQR) => {
                    console.log(asciiQR); // Optional to log QR in terminal
                },
                logQR: true,
            })
            .then((client) => {
                this.client = client;
                this.startListening(messageHandler);
            })
            .catch((error) => console.log(error));
    }

    startListening(handler) {
        this.client.onMessage((message) => {
            if (handler) {
                handler(message);
            }
        });
    }

    async sendText(to, content) {
        if (!this.client) {
            console.error('Client not initialized');
            return;
        }
        try {
            await this.client.sendText(to, content);
        } catch (error) {
            console.error('Error sending message:', error);
        }
    }
}

module.exports = new WhatsappService();
