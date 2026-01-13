const wppconnect = require('@wppconnect-team/wppconnect');
const os = require('os');
const path = require('path');
const webService = require('./webService'); // Import WebService

class WhatsappService {
    constructor() {
        this.client = null;
    }

    async start(messageHandler) {
        wppconnect
            .create({
                session: 'booking-bot',
                headless: true, // VPS requirement
                useChrome: false, // We provide explicit path
                executablePath: path.join(os.homedir(), '.cache', 'puppeteer', 'chrome', 'win64-143.0.7499.169', 'chrome-win64', 'chrome.exe'),
                browserArgs: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ],
                catchQR: (base64Qr, asciiQR) => {
                    console.log(asciiQR); // Log in terminal
                    // Update Web Interface
                    webService.updateQR(base64Qr);
                },
                logQR: true,
                // Stability settings
                deviceName: 'BookingBot',
                device: 'Chrome', // Explicit device type
                waitForLogin: true,
                autoClose: 0, // Disable auto close on idle
                puppeteerOptions: {
                    args: ['--no-sandbox'] // Double check specific puppeteer args passed here too
                }
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

    async getContact(id) {
        if (!this.client) return null;
        try {
            return await this.client.getContact(id);
        } catch (error) {
            console.error('Error getting contact:', error);
            return null;
        }
    }
}

module.exports = new WhatsappService();
