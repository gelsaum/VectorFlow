require('dotenv').config();
const whatsapp = require('./services/whatsappService');
const apiService = require('./services/apiService');
const licenseService = require('./services/licenseService');
const webService = require('./services/webService');
const sessionService = require('./services/sessionService');
const flowController = require('./controllers/flowController');

// MAIN INIT
(async () => {
    console.log('Iniciando sistema VectorFlow (Enterprise Architecture)...');

    console.log('Verificando licença...');
    const isLicensed = await licenseService.verifyLicense();
    if (!isLicensed) {
        console.error('⛔ LICENÇA INVÁLIDA OU INATIVA. O BOT SERÁ DESLIGADO.');
        process.exit(1);
    }
    console.log('✅ Licença Válida.');

    setInterval(async () => {
        const valid = await licenseService.verifyLicense();
        if (!valid) {
            console.error('⛔ LICENÇA EXPIRADA OU CANCELADA. ENCERRANDO SISTEMA.');
            process.exit(1);
        }
    }, 6 * 60 * 60 * 1000);

    try {
        await sessionService.init(); // Inicia o SQLite
        webService.init(); // Inicia Express (Webhook API)
        await apiService.init(); // Conecta Urutau Base HTTP Client
        
        console.log('✅ Webhook WebService + Urutau API + SQLite Conectados.');
        
        // Pass the controller's isolated handleMessage bound to context
        whatsapp.start(flowController.handleMessage.bind(flowController));
    } catch (e) {
        console.error('Fallo crítico al inicializar módulos:', e);
        process.exit(1);
    }
})();
