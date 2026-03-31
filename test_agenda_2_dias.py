import requests
from datetime import datetime, timedelta

# Configuração da API (Hardcodeada para teste independente)
BASE_URL = "https://studioferreira.codeart.com.py/api/v1"
API_KEY = "ak_live_tenant_LFFF2hhbs08q46Ox3vgtjNCLoNSVu2zw"
SERVICIO_ID = 1  # ID de serviço ajustável (1 é o padrão)

def testar_disponibilidade():
    print("--- Iniciando Teste de Disponibilidade da API (2 Dias) ---")

    headers = {
        "X-Tenant-Key": API_KEY,
        "Content-Type": "application/json"
    }

    # 1. Obter informações de Tenant e Sucursal
    print("\n1. Conectando com a API e obtendo Sucursal...")
    try:
        response_info = requests.get(f"{BASE_URL}/info", headers=headers)
        response_info.raise_for_status()
        data_info = response_info.json()
    except Exception as e:
        print(f"Erro ao conectar com {BASE_URL}/info: {e}")
        return

    if not data_info.get("success"):
        print("Falha na resposta da API info:", data_info.get("error"))
        return

    sucursais = data_info.get("data", {}).get("sucursales", [])
    if not sucursais:
        print("Nenhuma sucursal encontrada para esta API Key.")
        return

    # Pega a sucursal principal ou a primeira da lista
    sucursal = next((s for s in sucursais if s.get("is_principal")), sucursais[0])
    branch_id = sucursal["id"]
    print(f"✅ Conectado ao Tenant '{data_info['data']['tenant_id']}'. Usando Sucursal ID: {branch_id} ({sucursal['nombre']})")

    headers["X-Branch-ID"] = str(branch_id)

    # 2. Obter Empregados
    print("\n2. Buscando profissionais na sucursal...")
    try:
        response_emp = requests.get(f"{BASE_URL}/sucursales/{branch_id}/empleados", headers=headers)
        response_emp.raise_for_status()
        data_emp = response_emp.json()
    except Exception as e:
        print(f"Erro ao buscar empregados: {e}")
        return

    empleados = data_emp.get("data", {}).get("empleados", [])
    if not empleados:
        print("Nenhum profissional encontrado na sucursal.")
        return

    profissional = None
    for e in empleados:
        nome_completo = e.get("nombre_completo", f"{e.get('nombres')} {e.get('apellidos')}")
        if "vitor" in nome_completo.lower():
            profissional = e
            break

    if not profissional:
        print("⚠️ Profissional 'Vitor' NÃO ENCONTRADO na sucursal. Usando o primeiro da lista como fallback.")
        profissional = empleados[0]

    prof_id = profissional["id"]
    prof_nome = profissional.get("nombre_completo", f"{profissional.get('nombres')} {profissional.get('apellidos')}")
    print(f"✅ Profissional selecionado: {prof_nome} (ID: {prof_id})")

    # 3. Preparando datas (Hoje e Amanhã)
    hoje = datetime.now()
    amanha = hoje + timedelta(days=1)
    
    datas_para_testar = [
        ("Hoje", hoje),
        ("Amanhã", amanha)
    ]

    # 4. Consultar disponibilidade
    print(f"\n3. Consultando horários para o Serviço ID: {SERVICIO_ID} nos próximos 2 dias...")
    for label, data_obj in datas_para_testar:
        data_str_api = data_obj.strftime("%Y-%m-%d")
        data_str_display = data_obj.strftime("%d/%m/%Y")
        
        print(f"\n--- {label} ({data_str_display}) ---")
        
        params = {
            "profesional_id": prof_id,
            "servicio_id": SERVICIO_ID,
            "fecha_desde": data_str_api,
            "fecha_hasta": data_str_api
        }
        
        try:
            response_disp = requests.get(f"{BASE_URL}/agenda/disponibilidad", headers=headers, params=params)
            response_disp.raise_for_status()
            data_disp = response_disp.json()
            
            # Printa a URL exata chamada para facilitar debug do desenvolvedor
            print(f"URL Chamada: {response_disp.url}")
            
            if not data_disp.get("success"):
                print("Erro na API:", data_disp)
                continue
                
            disponibilidades = data_disp.get("data", {}).get("disponibilidad", [])
            
            if not disponibilidades:
                print("-> Resposta vazia (`disponibilidad` []). A API não retornou slots para esta data.")
                continue
                
            slots = disponibilidades[0].get("slots", [])
            horarios_disponiveis = [s["hora_inicio"][:5] for s in slots if s.get("disponible")]
            
            if horarios_disponiveis:
                print(f"-> {len(horarios_disponiveis)} Horários disponíveis: {', '.join(horarios_disponiveis)}")
            else:
                print("-> Resposta recebida OK, porém NÃO HÁ horários disponíveis (`disponible: true`) nesta data.")
                print(f"-> Total de slots retornados na data (indisponíveis): {len(slots)}")
                if len(slots) > 0:
                    print(f"   (Exemplo do motivo de indisponibilidade no 1o slot: '{slots[0].get('motivo_no_disponible')}')")
                
        except Exception as e:
            print(f"Erro ao consultar disponibilidade para {data_str_api}: {e}")

    print("\n--- Fim do Teste ---")

if __name__ == "__main__":
    testar_disponibilidade()
