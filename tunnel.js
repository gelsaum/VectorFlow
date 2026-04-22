const { spawn } = require('child_process');

console.log('Iniciando túnel ngrok na porta 3007...');

const ngrok = spawn('ngrok', ['http', '3007'], {
    shell: true,
    stdio: 'inherit'
});

ngrok.on('close', (code) => {
    console.log(`Ngrok fechou com código ${code}`);
    process.exit(code);
});
