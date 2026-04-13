const api = require('./services/apiService');
require('dotenv').config();

(async () => {
    console.log('--- Buscando IDs dos Serviços no Urutau ---');
    await api.init();
    const servicos = await api.listarServicios();
    console.log(JSON.stringify(servicos, null, 2));
    process.exit(0);
})();
