require('dotenv').config();

const BASE_URL = process.env.URUTAU_API_URL || "https://studioferreira.codeart.com.py/api/v1";
const API_KEY = process.env.URUTAU_API_KEY;

async function testDelete() {
    const headers = {
        "X-Tenant-Key": API_KEY,
        "X-Tenant-ID": "studioferreira",
        "X-Branch-ID": "1",
        "Content-Type": "application/json"
    };

    // 1. Buscar citas existentes nos próximos 7 dias
    console.log('=== BUSCANDO CITAS EXISTENTES ===\n');
    let citasPendentes = [];

    for (let i = 0; i < 7; i++) {
        const checkDate = new Date(Date.now() + i * 86400000).toISOString().split('T')[0];
        const res = await fetch(`${BASE_URL}/agenda/reporte-diario?fecha=${checkDate}&page_size=50`, { headers });
        if (res.ok) {
            const data = await res.json();
            const citas = data.data?.citas || [];
            for (const c of citas) {
                if (c.estado !== 'cancelada') {
                    citasPendentes.push({ ...c, fecha: checkDate });
                    console.log(`  📅 ${checkDate} | ID: ${c.cita_id} | Numero: ${c.numero_cita} | ${c.hora_inicio} | ${c.cliente?.nombres} ${c.cliente?.apellidos} | Estado: ${c.estado}`);
                }
            }
        }
    }

    if (citasPendentes.length === 0) {
        console.log('Nenhuma cita pendente encontrada.');
        process.exit(0);
    }

    // 2. Testar cancelamento com a ÚLTIMA cita (para não afetar as importantes)
    const cita = citasPendentes[citasPendentes.length - 1];
    console.log(`\n=== TESTANDO CANCELAMENTO DA CITA ID: ${cita.cita_id} ===\n`);

    const whatsappBase = BASE_URL.replace('/v1', '/whatsapp');

    // Teste 1: DELETE /api/whatsapp/agendamentos/{id}
    console.log(`1. DELETE ${whatsappBase}/agendamentos/${cita.cita_id}`);
    const r1 = await fetch(`${whatsappBase}/agendamentos/${cita.cita_id}`, { method: 'DELETE', headers });
    console.log(`   Status: ${r1.status}`);
    const t1 = await r1.text();
    if (t1) console.log(`   Resposta: ${t1.substring(0, 300)}`);

    // Teste 2: PATCH /api/v1/agenda/reserva/{id} com estado cancelada
    if (r1.status !== 200 && r1.status !== 204) {
        console.log(`\n2. PATCH ${BASE_URL}/agenda/reserva/${cita.cita_id}`);
        const r2 = await fetch(`${BASE_URL}/agenda/reserva/${cita.cita_id}`, {
            method: 'PATCH', headers, body: JSON.stringify({ estado: 'cancelada' })
        });
        console.log(`   Status: ${r2.status}`);
        const t2 = await r2.text();
        if (t2) console.log(`   Resposta: ${t2.substring(0, 300)}`);
    }

    // Teste 3: DELETE /api/v1/agenda/reserva/{id}
    if (r1.status !== 200 && r1.status !== 204) {
        console.log(`\n3. DELETE ${BASE_URL}/agenda/reserva/${cita.cita_id}`);
        const r3 = await fetch(`${BASE_URL}/agenda/reserva/${cita.cita_id}`, { method: 'DELETE', headers });
        console.log(`   Status: ${r3.status}`);
        const t3 = await r3.text();
        if (t3) console.log(`   Resposta: ${t3.substring(0, 300)}`);
    }

    // Teste 4: POST /api/v1/agenda/reserva/{id}/cancelar
    if (r1.status !== 200 && r1.status !== 204) {
        console.log(`\n4. POST ${BASE_URL}/agenda/reserva/${cita.cita_id}/cancelar`);
        const r4 = await fetch(`${BASE_URL}/agenda/reserva/${cita.cita_id}/cancelar`, { method: 'POST', headers });
        console.log(`   Status: ${r4.status}`);
        const t4 = await r4.text();
        if (t4) console.log(`   Resposta: ${t4.substring(0, 300)}`);
    }

    // Teste 5: PATCH /api/whatsapp/agendamentos/{id}
    if (r1.status !== 200 && r1.status !== 204) {
        console.log(`\n5. PATCH ${whatsappBase}/agendamentos/${cita.cita_id}`);
        const r5 = await fetch(`${whatsappBase}/agendamentos/${cita.cita_id}`, {
            method: 'PATCH', headers, body: JSON.stringify({ estado: 'cancelada' })
        });
        console.log(`   Status: ${r5.status}`);
        const t5 = await r5.text();
        if (t5) console.log(`   Resposta: ${t5.substring(0, 300)}`);
    }

    process.exit(0);
}

testDelete().catch(err => {
    console.error('ERRO:', err);
    process.exit(1);
});
