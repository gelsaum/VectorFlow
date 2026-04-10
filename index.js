process.on('unhandledRejection', (reason, promise) => {
    console.error('🚫 Alerta: Promessa não tratada caindo na aplicação:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('🚫 Erro fatal evitado no sistema central:', err);
});

require('dotenv').config();
const whatsapp = require('./services/whatsappService');
const apiService = require('./services/apiService');
const webService = require('./services/webService');
const sessionService = require('./services/sessionService');
const flowController = require('./controllers/flowController');

// MAIN INIT
(async () => {
    console.log('Iniciando sistema VectorFlow (Enterprise Architecture)...');

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
