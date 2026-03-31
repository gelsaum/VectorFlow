const { format, addDays } = require('date-fns');

// Configuração da API (Hardcodeada para teste independente)
const BASE_URL = "https://studioferreira.codeart.com.py/api/v1";
const API_KEY = "ak_live_tenant_LFFF2hhbs08q46Ox3vgtjNCLoNSVu2zw";
const SERVICIO_ID = 1; // 1 = Corte de Cabello

async function testarDisponibilidadeIndependent() {
    console.log("--- Iniciando Teste de Disponibilidade da API em JS (2 Dias) ---");

    const headers = {
        "X-Tenant-Key": API_KEY,
        "Content-Type": "application/json"
    };

    // 1. Obter informações de Tenant e Sucursal
    console.log("\n1. Conectando com a API e obtendo Sucursal...");
    let dataInfo;
    try {
        const resInfo = await fetch(`${BASE_URL}/info`, { headers });
        if (!resInfo.ok) throw new Error(`Status HTTP ${resInfo.status}`);
        dataInfo = await resInfo.json();
    } catch (e) {
        console.error("Erro ao conectar com /info:", e.message);
        return;
    }

    if (!dataInfo.success) {
        console.error("Falha na resposta da API info:", dataInfo.error);
        return;
    }

    const tenantId = dataInfo.data.tenant_id;
    const sucursais = dataInfo.data.sucursales || [];
    if (sucursais.length === 0) {
        console.log("Nenhuma sucursal encontrada.");
        return;
    }

    const sucursal = sucursais.find(s => s.is_principal) || sucursais[0];
    const branchId = sucursal.id;
    console.log(`✅ Conectado ao Tenant '${tenantId}'. Usando Sucursal ID: ${branchId} (${sucursal.nombre})`);

    // Adiciona o Branch ID nos headers
    headers["X-Branch-ID"] = String(branchId);

    // 2. Obter Empregados
    console.log("\n2. Buscando profissionais na sucursal...");
    let dataEmp;
    try {
        const resEmp = await fetch(`${BASE_URL}/sucursales/${branchId}/empleados`, { headers });
        if (!resEmp.ok) throw new Error(`Status HTTP ${resEmp.status}`);
        dataEmp = await resEmp.json();
    } catch (e) {
        console.error("Erro ao buscar empregados:", e.message);
        return;
    }

    const empregados = dataEmp.data?.empleados || [];
    if (empregados.length === 0) {
        console.log("Nenhum profissional encontrado na sucursal.");
        return;
    }

    let profissional = empregados.find(e => {
        const nomeCompleto = e.nombre_completo || `${e.nombres} ${e.apellidos}`;
        return nomeCompleto.toLowerCase().includes("vitor");
    });

    if (!profissional) {
        console.log("⚠️ Profissional 'Vitor' NÃO ENCONTRADO na sucursal. Usando o primeiro da lista como fallback.");
        profissional = empregados[0];
    }

    const profId = profissional.id;
    const profNome = profissional.nombre_completo || `${profissional.nombres} ${profissional.apellidos}`;
    console.log(`✅ Profissional selecionado: ${profNome} (ID: ${profId})`);

    // 3. Preparando datas (Hoje e Amanhã)
    const hoje = new Date();
    const amanha = addDays(hoje, 1);

    const datasParaTestar = [
        { label: "Hoje", obj: hoje },
        { label: "Amanhã", obj: amanha }
    ];

    // 4. Consultar disponibilidade
    console.log(`\n3. Consultando horários para o Serviço ID: ${SERVICIO_ID} nos próximos 2 dias...`);
    
    for (const dt of datasParaTestar) {
        const dataStrApi = format(dt.obj, 'yyyy-MM-dd');
        const dataStrDisplay = format(dt.obj, 'dd/MM/yyyy');

        console.log(`\n--- ${dt.label} (${dataStrDisplay}) ---`);

        // Cria a Query String idêntica a do bot
        const params = new URLSearchParams({
            profesional_id: profId,
            servicio_id: SERVICIO_ID,
            fecha_desde: dataStrApi,
            fecha_hasta: dataStrApi
        });

        const url = `${BASE_URL}/agenda/disponibilidad?${params.toString()}`;

        try {
            const resDisp = await fetch(url, { headers });
            
            console.log(`URL Chamada: ${url}`);
            
            if (!resDisp.ok) {
                // Pega a exata mensagem de erro HTTP retornada pelo servidor (Ex: Erro 500)
                const errorText = await resDisp.text();
                throw new Error(`\nErro ${resDisp.status} ${resDisp.statusText}\nResposta do Servidor Urutau: ${errorText}`);
            }

            const dataDisp = await resDisp.json();

            if (!dataDisp.success) {
                console.log("Erro na API ao consultar disponibilidade:", dataDisp.error || dataDisp);
                continue;
            }

            const disponibilidades = dataDisp.data?.disponibilidad || [];
            if (disponibilidades.length === 0) {
                console.log("-> Resposta vazia (`disponibilidad` []). A API não retornou slots para esta data.");
                continue;
            }

            const slots = disponibilidades[0].slots || [];
            const horariosDisponiveis = slots
                .filter(s => s.disponible)
                .map(s => s.hora_inicio.substring(0, 5));

            if (horariosDisponiveis.length > 0) {
                console.log(`-> ${horariosDisponiveis.length} Horários disponíveis: ${horariosDisponiveis.join(', ')}`);
            } else {
                console.log("-> Resposta recebida OK, porém NÃO HÁ horários disponíveis (`disponible: true`) nesta data.");
                console.log(`-> Total de slots retornados na data (indisponíveis): ${slots.length}`);
                if (slots.length > 0) {
                    console.log(`   (Exemplo do motivo de indisponibilidade: '${slots[0].motivo_no_disponible}')`);
                }
            }

        } catch (e) {
            console.error(`Erro crítico ao consultar disponibilidade para ${dataStrApi}:\n`, e.message);
        }
    }

    console.log("\n--- Fim do Teste ---");
}

testarDisponibilidadeIndependent().catch(e => {
    console.error("Erro geral no teste:", e);
});
