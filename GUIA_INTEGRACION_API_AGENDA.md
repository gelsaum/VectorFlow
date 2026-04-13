# 📘 Guía de Integración - API de Agenda

## 📋 Tabla de Contenidos

1. [Introducción](#introducción)
2. [Configuración Inicial](#configuración-inicial)
3. [Autenticación](#autenticación)
4. [Endpoints Disponibles](#endpoints-disponibles)
5. [Ejemplos de Integración](#ejemplos-de-integración)
6. [Casos de Uso Comunes](#casos-de-uso-comunes)
7. [Manejo de Errores](#manejo-de-errores)
8. [Preguntas Frecuentes](#preguntas-frecuentes)

---

## 1. Introducción

Esta guía te ayudará a integrar tu sistema con la API de Agenda del ERP Urutau. La API permite:

- ✅ Consultar disponibilidad de profesionales
- ✅ Ver horarios disponibles para servicios
- ✅ Crear reservas (citas)
- ✅ Consultar reportes diarios de citas
- ✅ Cancelar agendamientos

### 1.1 URLs Base

```
Producción: https://api.codeart.com.py/api/v1
Desarrollo: https://dev-api.codeart.com.py/api/v1
```

### 1.2 Formato de Respuestas

Todas las respuestas exitosas siguen este formato:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2025-01-19T14:30:00Z",
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

Las respuestas de error:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Mensaje descriptivo",
    "details": "Información adicional (opcional)"
  }
}
```

---

## 2. Configuración Inicial

### 2.1 Obtener Credenciales

Necesitas obtener de tu contacto:

1. **API Key**: Token de autenticación (este es el único valor que necesitas inicialmente)

**Ejemplo de API Key:**
```
ak_live_tenant_abc123def456ghi789jkl012mno345pqr678
```

### 2.2 Obtener Tenant ID y Branch ID

Una vez que tengas tu API Key, puedes obtener el **Tenant ID** y las **Sucursales disponibles** usando el endpoint de información:

**Endpoint**: `GET /api/v1/info`

**Headers**:
```http
X-Tenant-Key: ak_live_tenant_abc123def456ghi789jkl012mno345pqr678
```

**Respuesta**:
```json
{
  "success": true,
  "data": {
    "tenant_id": "cliente_empresa_123",
    "tenant_name": "Cliente Empresa",
    "api_key_type": "tenant",
    "api_key_name": "API Key Tenant - Cliente Empresa",
    "sucursales": [
      {
        "id": 42,
        "nombre": "Sucursal Centro",
        "direccion": "Av. Principal 123",
        "telefono": "+595981123456",
        "is_principal": true,
        "empresa": {
          "id": 1,
          "nombre": "Empresa Principal",
          "ruc": "1234567-8"
        }
      }
    ],
    "total_sucursales": 1,
    "instrucciones": {
      "headers_requeridos": {
        "X-Tenant-Key": "Tu API Key (ya proporcionada en este request)",
        "X-Branch-ID": "ID de la sucursal (ver sucursales disponibles arriba)"
      },
      "nota": "IMPORTANTE: Para la API v1, solo necesitas X-Tenant-Key y X-Branch-ID. El tenant_id se obtiene automáticamente de la API Key."
    }
  }
}
```

De esta respuesta, obtendrás:
- **Tenant ID**: `data.tenant_id` (en este ejemplo: `"cliente_empresa_123"`)
- **Branch IDs disponibles**: `data.sucursales[].id` (en este ejemplo: `42`)

### 2.3 Headers Requeridos

Todas las peticiones deben incluir estos headers:

```http
X-Tenant-Key: ak_live_tenant_abc123def456ghi789jkl012mno345pqr678
X-Branch-ID: 42
Content-Type: application/json
```

**Nota**: 
- El header `X-Tenant-Key` es tu API Key (único valor que necesitas de tu contacto)
- El header `X-Branch-ID` es requerido para la mayoría de endpoints, excepto para listar sucursales
- El `Tenant ID` se obtiene automáticamente de la API Key, no necesitas enviarlo en los headers

---

## 3. Autenticación

### 3.1 Tipos de API Keys

Existen dos tipos de API Keys:

1. **Tenant Key**: Acceso a todas las sucursales del tenant
2. **Branch Key**: Acceso restringido a una sola sucursal

### 3.2 Validación de Autenticación

Si la autenticación falla, recibirás:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_API_KEY",
    "message": "API Key inválida o inactiva"
  }
}
```

**Código HTTP**: `401 Unauthorized`

---

## 4. Endpoints Disponibles

### 4.1 Endpoint de Información de API Key

#### 4.1.1 Obtener Información de API Key

Este endpoint te permite obtener toda la información necesaria para usar la API, incluyendo el Tenant ID y las sucursales disponibles.

**Endpoint**: `GET /api/v1/info`

**Headers**:
```http
X-Tenant-Key: ak_live_tenant_abc123...
```

**Respuesta Exitosa** (200):
```json
{
  "success": true,
  "data": {
    "tenant_id": "cliente_empresa_123",
    "tenant_name": "Cliente Empresa",
    "api_key_type": "tenant",
    "api_key_name": "API Key Tenant - Cliente Empresa",
    "sucursales": [
      {
        "id": 42,
        "nombre": "Sucursal Centro",
        "direccion": "Av. Principal 123",
        "telefono": "+595981123456",
        "is_principal": true,
        "empresa": {
          "id": 1,
          "nombre": "Empresa Principal",
          "ruc": "1234567-8"
        }
      },
      {
        "id": 43,
        "nombre": "Sucursal Norte",
        "direccion": "Av. Norte 456",
        "telefono": "+595981654321",
        "is_principal": false,
        "empresa": {
          "id": 1,
          "nombre": "Empresa Principal",
          "ruc": "1234567-8"
        }
      }
    ],
    "total_sucursales": 2,
    "instrucciones": {
      "headers_requeridos": {
        "X-Tenant-Key": "Tu API Key (ya proporcionada en este request)",
        "X-Branch-ID": "ID de la sucursal (ver sucursales disponibles arriba)"
      },
      "nota": "IMPORTANTE: Para la API v1, solo necesitas X-Tenant-Key y X-Branch-ID. El tenant_id se obtiene automáticamente de la API Key."
    }
  },
  "meta": {
    "timestamp": "2025-01-19T14:30:00Z",
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Tipos de API Key**:
- `tenant`: Acceso a todas las sucursales del tenant
- `empresa`: Acceso a todas las sucursales de una empresa específica
- `branch`: Acceso solo a una sucursal específica

**Nota**: Si tu API Key es de tipo `branch`, el campo `branch_id_default` estará presente en la respuesta, indicando el único Branch ID que puedes usar.

---

### 4.2 Endpoints Auxiliares (Información)

#### 4.2.1 Listar Empresas

Obtiene todas las empresas disponibles del tenant.

**Endpoint**: `GET /api/v1/empresas`

**Headers**:
```http
X-Tenant-ID: cliente_empresa_123
X-API-Key: ak_live_tenant_abc123...
```

**Respuesta Exitosa** (200):
```json
{
  "success": true,
  "data": {
    "empresas": [
      {
        "id": 1,
        "nombre": "Empresa Principal",
        "ruc": "1234567-8",
        "razon_social": "Empresa Principal S.A.",
        "sucursales_count": 3
      }
    ],
    "total": 1
  },
  "meta": {
    "timestamp": "2025-01-19T14:30:00Z",
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Nota**: Solo disponible para API Keys de tipo `tenant`.

---

#### 4.1.2 Listar Sucursales

Obtiene las sucursales disponibles según el tipo de API Key.

**Endpoint**: `GET /api/v1/sucursales?empresa_id=1`

**Query Parameters**:
- `empresa_id` (opcional): Filtrar por empresa específica

**Headers**:
```http
X-Tenant-ID: cliente_empresa_123
X-API-Key: ak_live_tenant_abc123...
```

**Respuesta Exitosa** (200):
```json
{
  "success": true,
  "data": {
    "sucursales": [
      {
        "id": 42,
        "nombre": "Sucursal Centro",
        "direccion": "Av. Principal 123",
        "telefono": "+595981123456",
        "is_principal": true,
        "empresa": {
          "id": 1,
          "nombre": "Empresa Principal",
          "ruc": "1234567-8"
        }
      }
    ],
    "total": 1
  },
  "meta": {
    "timestamp": "2025-01-19T14:30:00Z",
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

---

#### 4.2.3 Listar Empleados de una Sucursal

Obtiene los empleados (profesionales) activos de una sucursal.

**Endpoint**: `GET /api/v1/sucursales/{branch_id}/empleados`

**Headers**:
```http
X-Tenant-ID: cliente_empresa_123
X-API-Key: ak_live_tenant_abc123...
X-Branch-ID: 42
```

**Respuesta Exitosa** (200):
```json
{
  "success": true,
  "data": {
    "sucursal": {
      "id": 42,
      "nombre": "Sucursal Centro",
      "empresa": "Empresa Principal"
    },
    "empleados": [
      {
        "id": 5,
        "username": "jperez",
        "nombre_completo": "Pérez, Juan",
        "nombres": "Juan",
        "apellidos": "Pérez",
        "email": "juan.perez@empresa.com",
        "telefono": "+595981123456"
      }
    ],
    "total": 1
  },
  "meta": {
    "timestamp": "2025-01-19T14:30:00Z",
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

---

### 4.3 Endpoints de Agenda

#### 4.3.1 Obtener Configuración de Sucursal

Obtiene la configuración específica de la sucursal (horarios, intervalos, etc.).

**Endpoint**: `GET /api/v1/sucursal/configuracion`

**Headers**:
```http
X-Tenant-ID: cliente_empresa_123
X-API-Key: ak_live_tenant_abc123...
X-Branch-ID: 42
```

**Respuesta Exitosa** (200):
```json
{
  "success": true,
  "data": {
    "sucursal_id": 42,
    "nombre": "Sucursal Centro",
    "timezone": "America/Asuncion",
    "zona_horaria": "PYT",
    "dias_festivos": ["2025-01-01", "2025-02-03"],
    "intervalo_agenda_min": 15,
    "horario_apertura": "08:00:00",
    "horario_cierre": "18:00:00",
    "anticipacion_minima_horas": 2,
    "anticipacion_maxima_dias": 90,
    "duracion_defecto_minutos": 30
  },
  "meta": {
    "timestamp": "2025-01-19T14:30:00Z",
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

---

#### 4.3.2 Consultar Disponibilidad

Consulta los slots disponibles para un profesional, servicio y rango de fechas.

**Endpoint**: `GET /api/v1/agenda/disponibilidad`

**Query Parameters**:
- `profesional_id` (requerido): ID del empleado/profesional
- `servicio_id` (requerido): ID del servicio
- `fecha_desde` (requerido): Fecha inicio (formato: `YYYY-MM-DD`)
- `fecha_hasta` (requerido): Fecha fin (formato: `YYYY-MM-DD`)

**Headers**:
```http
X-Tenant-ID: cliente_empresa_123
X-API-Key: ak_live_tenant_abc123...
X-Branch-ID: 42
```

**Ejemplo de Request**:
```http
GET /api/v1/agenda/disponibilidad?profesional_id=5&servicio_id=10&fecha_desde=2025-01-20&fecha_hasta=2025-01-27
```

**Respuesta Exitosa** (200):
```json
{
  "success": true,
  "data": {
    "profesional_id": 5,
    "profesional_nombre": "Juan Pérez",
    "servicio_id": 10,
    "servicio_nombre": "Corte de Cabello",
    "fecha_desde": "2025-01-20",
    "fecha_hasta": "2025-01-27",
    "disponibilidad": [
      {
        "fecha": "2025-01-20",
        "slots": [
          {
            "hora_inicio": "09:00:00",
            "hora_fin": "09:30:00",
            "disponible": true,
            "motivo_no_disponible": null
          },
          {
            "hora_inicio": "09:30:00",
            "hora_fin": "10:00:00",
            "disponible": false,
            "motivo_no_disponible": "Ya existe una cita en este horario"
          },
          {
            "hora_inicio": "10:00:00",
            "hora_fin": "10:30:00",
            "disponible": true,
            "motivo_no_disponible": null
          }
        ]
      },
      {
        "fecha": "2025-01-21",
        "slots": []
      }
    ]
  },
  "meta": {
    "timestamp": "2025-01-19T14:30:00Z",
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Validaciones**:
- El rango de fechas no puede exceder 30 días
- El profesional y servicio deben existir y estar activos
- Las fechas deben estar en formato `YYYY-MM-DD`

---

#### 4.2.3 Crear Reserva

Crea una nueva cita (reserva) con validación de disponibilidad.

**Endpoint**: `POST /api/v1/agenda/reserva`

**Headers**:
```http
X-Tenant-ID: cliente_empresa_123
X-API-Key: ak_live_tenant_abc123...
X-Branch-ID: 42
Content-Type: application/json
```

**Body (JSON)**:
```json
{
  "cliente": {
    "nombres": "María",
    "apellidos": "González",
    "telefono": "+595981123456",
    "email": "maria.gonzalez@email.com",
    "tipo_documento": "CI",
    "numero_documento": "1234567"
  },
  "profesional_id": 5,
  "servicio_id": 10,
  "fecha": "2025-01-20",
  "hora_inicio": "10:00:00",
  "recurso_fisico_id": null,
  "observaciones": "Cliente solicita corte clásico"
}
```

**Campos Requeridos**:
- `cliente.nombres`: Nombre del cliente (requerido)
- `cliente.apellidos`: Apellidos del cliente (requerido)
- `profesional_id`: ID del empleado/profesional (requerido)
- `servicio_id`: ID del servicio (requerido)
- `fecha`: Fecha de la cita en formato `YYYY-MM-DD` (requerido)
- `hora_inicio`: Hora de inicio en formato `HH:MM:SS` (requerido)

**Campos Opcionales**:
- `cliente.telefono`: Teléfono del cliente
- `cliente.email`: Email del cliente
- `cliente.tipo_documento`: Tipo de documento (default: "CI")
- `cliente.numero_documento`: Número de documento
- `recurso_fisico_id`: ID de recurso físico (si aplica)
- `observaciones`: Observaciones adicionales

**Respuesta Exitosa** (201):
```json
{
  "success": true,
  "data": {
    "cita_id": 1234,
    "numero_cita": "CITA-2025-001234",
    "estado": "pendiente",
    "cliente": {
      "id": 5678,
      "nombres": "María",
      "apellidos": "González"
    },
    "profesional": {
      "id": 5,
      "nombre": "Juan Pérez"
    },
    "servicio": {
      "id": 10,
      "nombre": "Corte de Cabello",
      "duracion_minutos": 30
    },
    "fecha": "2025-01-20",
    "hora_inicio": "10:00:00",
    "hora_fin": "10:30:00",
    "fecha_creacion": "2025-01-19T14:35:00Z"
  },
  "meta": {
    "timestamp": "2025-01-19T14:35:00Z",
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Errores Comunes**:

1. **Slot ya reservado** (409 Conflict):
```json
{
  "error": "SLOT_ALREADY_BOOKED",
  "message": "El horario seleccionado ya está reservado",
  "conflicto": {
    "cita_id": 1233,
    "hora_inicio": "10:00:00",
    "hora_fin": "10:30:00"
  }
}
```

2. **Profesional no disponible** (409 Conflict):
```json
{
  "error": "PROFESIONAL_NOT_AVAILABLE",
  "message": "El empleado tiene un horario indisponible programado (09:00 - 10:00) - Reunión de equipo."
}
```

**Nota**: El sistema busca automáticamente si el cliente ya existe (por teléfono, email o documento). Si no existe, lo crea automáticamente.

---

#### 4.3.4 Reporte Diario

Obtiene el listado de citas del día para una sucursal.

**Endpoint**: `GET /api/v1/agenda/reporte-diario`

**Query Parameters**:
- `fecha` (opcional): Fecha del reporte (formato: `YYYY-MM-DD`). Default: hoy
- `estado` (opcional): Filtrar por estado (`pendiente`, `confirmada`, `realizada`, `cancelada`)
- `profesional_id` (opcional): Filtrar por profesional
- `page` (opcional): Número de página (default: 1)
- `page_size` (opcional): Tamaño de página (default: 20, máximo: 100)

**Headers**:
```http
X-Tenant-ID: cliente_empresa_123
X-API-Key: ak_live_tenant_abc123...
X-Branch-ID: 42
```

**Ejemplo de Request**:
```http
GET /api/v1/agenda/reporte-diario?fecha=2025-01-20&estado=confirmada&page=1&page_size=20
```

**Respuesta Exitosa** (200):
```json
{
  "success": true,
  "data": {
    "fecha": "2025-01-20",
    "sucursal_id": 42,
    "sucursal_nombre": "Sucursal Centro",
    "total_citas": 45,
    "citas": [
      {
        "cita_id": 1234,
        "numero_cita": "CITA-2025-001234",
        "estado": "confirmada",
        "cliente": {
          "id": 5678,
          "nombres": "María",
          "apellidos": "González",
          "telefono": "+595981123456",
          "email": "maria.gonzalez@email.com"
        },
        "profesional": {
          "id": 5,
          "nombre": "Juan Pérez"
        },
        "servicio": {
          "id": 10,
          "nombre": "Corte de Cabello",
          "duracion_minutos": 30
        },
        "hora_inicio": "10:00:00",
        "hora_fin": "10:30:00",
        "observaciones": "Cliente solicita corte clásico"
      }
    ]
  },
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total_pages": 3,
    "total_items": 45,
    "has_next": true,
    "has_previous": false
  },
  "meta": {
    "timestamp": "2025-01-19T14:40:00Z",
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

---

## 5. Ejemplos de Integración

### 5.1 Python (requests)

```python
import requests
from datetime import datetime, timedelta

# Configuración
BASE_URL = "https://api.codeart.com.py/api/v1"
API_KEY = "ak_live_tenant_abc123def456ghi789jkl012mno345pqr678"
BRANCH_ID = 42  # Obtener del endpoint /api/v1/info

# Headers comunes
headers = {
    "X-Tenant-Key": API_KEY,
    "X-Branch-ID": str(BRANCH_ID),
    "Content-Type": "application/json"
}

# 0. Obtener información de la API Key (Tenant ID y sucursales)
def obtener_info_api():
    """Obtiene el Tenant ID y las sucursales disponibles"""
    response = requests.get(
        f"{BASE_URL}/info",
        headers={"X-Tenant-Key": API_KEY}
    )
    return response.json()

# 1. Obtener configuración de sucursal
def obtener_configuracion():
    response = requests.get(
        f"{BASE_URL}/sucursal/configuracion",
        headers=headers
    )
    return response.json()

# 2. Listar empleados
def listar_empleados():
    response = requests.get(
        f"{BASE_URL}/sucursales/{BRANCH_ID}/empleados",
        headers=headers
    )
    return response.json()

# 3. Consultar disponibilidad
def consultar_disponibilidad(profesional_id, servicio_id, fecha_desde, fecha_hasta):
    params = {
        "profesional_id": profesional_id,
        "servicio_id": servicio_id,
        "fecha_desde": fecha_desde,
        "fecha_hasta": fecha_hasta
    }
    response = requests.get(
        f"{BASE_URL}/agenda/disponibilidad",
        headers=headers,
        params=params
    )
    return response.json()

# 4. Crear reserva
def crear_reserva(cliente_data, profesional_id, servicio_id, fecha, hora_inicio):
    data = {
        "cliente": cliente_data,
        "profesional_id": profesional_id,
        "servicio_id": servicio_id,
        "fecha": fecha,
        "hora_inicio": hora_inicio
    }
    response = requests.post(
        f"{BASE_URL}/agenda/reserva",
        headers=headers,
        json=data
    )
    return response.json()

# 5. Reporte diario
def reporte_diario(fecha=None, estado=None, page=1):
    params = {"page": page}
    if fecha:
        params["fecha"] = fecha
    if estado:
        params["estado"] = estado
    
    response = requests.get(
        f"{BASE_URL}/agenda/reporte-diario",
        headers=headers,
        params=params
    )
    return response.json()

# Ejemplo de uso
if __name__ == "__main__":
    # Primero, obtener información de la API Key
    info = obtener_info_api()
    if info.get("success"):
        tenant_id = info["data"]["tenant_id"]
        sucursales = info["data"]["sucursales"]
        print(f"Tenant ID: {tenant_id}")
        print(f"Sucursales disponibles: {[s['id'] for s in sucursales]}")
        
        # Usar la primera sucursal disponible
        if sucursales:
            BRANCH_ID = sucursales[0]["id"]
            headers["X-Branch-ID"] = str(BRANCH_ID)
    
    # Obtener empleados
    empleados = listar_empleados()
    print("Empleados:", empleados)
    
    # Consultar disponibilidad
    fecha_desde = datetime.now().strftime("%Y-%m-%d")
    fecha_hasta = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
    
    disponibilidad = consultar_disponibilidad(
        profesional_id=5,
        servicio_id=10,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta
    )
    print("Disponibilidad:", disponibilidad)
    
    # Crear reserva
    cliente = {
        "nombres": "María",
        "apellidos": "González",
        "telefono": "+595981123456",
        "email": "maria.gonzalez@email.com"
    }
    
    reserva = crear_reserva(
        cliente_data=cliente,
        profesional_id=5,
        servicio_id=10,
        fecha="2025-01-20",
        hora_inicio="10:00:00"
    )
    print("Reserva creada:", reserva)
```

---

### 5.2 JavaScript (fetch)

```javascript
// Configuración
const BASE_URL = "https://api.codeart.com.py/api/v1";
const TENANT_ID = "cliente_empresa_123";
const API_KEY = "ak_live_tenant_abc123def456ghi789jkl012mno345pqr678";
const BRANCH_ID = 42;

// Headers comunes
const headers = {
    "X-Tenant-Key": API_KEY,
    "X-Branch-ID": BRANCH_ID.toString(),
    "Content-Type": "application/json"
};

// 0. Obtener información de la API Key (Tenant ID y sucursales)
async function obtenerInfoApi() {
    const response = await fetch(`${BASE_URL}/info`, {
        method: "GET",
        headers: {"X-Tenant-Key": API_KEY}
    });
    return await response.json();
}

// 1. Obtener configuración
async function obtenerConfiguracion() {
    const response = await fetch(`${BASE_URL}/sucursal/configuracion`, {
        method: "GET",
        headers: headers
    });
    return await response.json();
}

// 2. Listar empleados
async function listarEmpleados() {
    const response = await fetch(`${BASE_URL}/sucursales/${BRANCH_ID}/empleados`, {
        method: "GET",
        headers: headers
    });
    return await response.json();
}

// 3. Consultar disponibilidad
async function consultarDisponibilidad(profesionalId, servicioId, fechaDesde, fechaHasta) {
    const params = new URLSearchParams({
        profesional_id: profesionalId,
        servicio_id: servicioId,
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta
    });
    
    const response = await fetch(`${BASE_URL}/agenda/disponibilidad?${params}`, {
        method: "GET",
        headers: headers
    });
    return await response.json();
}

// 4. Crear reserva
async function crearReserva(clienteData, profesionalId, servicioId, fecha, horaInicio) {
    const data = {
        cliente: clienteData,
        profesional_id: profesionalId,
        servicio_id: servicioId,
        fecha: fecha,
        hora_inicio: horaInicio
    };
    
    const response = await fetch(`${BASE_URL}/agenda/reserva`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(data)
    });
    return await response.json();
}

// 5. Reporte diario
async function reporteDiario(fecha = null, estado = null, page = 1) {
    const params = new URLSearchParams({ page: page.toString() });
    if (fecha) params.append("fecha", fecha);
    if (estado) params.append("estado", estado);
    
    const response = await fetch(`${BASE_URL}/agenda/reporte-diario?${params}`, {
        method: "GET",
        headers: headers
    });
    return await response.json();
}

// Ejemplo de uso
(async () => {
    try {
        // Primero, obtener información de la API Key
        const info = await obtenerInfoApi();
        if (info.success) {
            const tenantId = info.data.tenant_id;
            const sucursales = info.data.sucursales;
            console.log(`Tenant ID: ${tenantId}`);
            console.log(`Sucursales disponibles:`, sucursales.map(s => s.id));
            
            // Usar la primera sucursal disponible
            if (sucursales.length > 0) {
                BRANCH_ID = sucursales[0].id;
                headers["X-Branch-ID"] = BRANCH_ID.toString();
            }
        }
        
        // Obtener empleados
        const empleados = await listarEmpleados();
        console.log("Empleados:", empleados);
        
        // Consultar disponibilidad
        const fechaDesde = new Date().toISOString().split("T")[0];
        const fechaHasta = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        
        const disponibilidad = await consultarDisponibilidad(5, 10, fechaDesde, fechaHasta);
        console.log("Disponibilidad:", disponibilidad);
        
        // Crear reserva
        const cliente = {
            nombres: "María",
            apellidos: "González",
            telefono: "+595981123456",
            email: "maria.gonzalez@email.com"
        };
        
        const reserva = await crearReserva(cliente, 5, 10, "2025-01-20", "10:00:00");
        console.log("Reserva creada:", reserva);
    } catch (error) {
        console.error("Error:", error);
    }
})();
```

---

### 5.3 cURL

```bash
#!/bin/bash

# Configuración
BASE_URL="https://api.codeart.com.py/api/v1"
API_KEY="ak_live_tenant_abc123def456ghi789jkl012mno345pqr678"
BRANCH_ID=42  # Obtener del endpoint /api/v1/info

# Headers comunes
HEADERS=(
  -H "X-Tenant-Key: $API_KEY"
  -H "X-Branch-ID: $BRANCH_ID"
  -H "Content-Type: application/json"
)

# 0. Obtener información de la API Key (Tenant ID y sucursales)
curl -X GET "${BASE_URL}/info" -H "X-Tenant-Key: $API_KEY"

# 1. Obtener configuración
curl -X GET "${BASE_URL}/sucursal/configuracion" "${HEADERS[@]}"

# 2. Listar empleados
curl -X GET "${BASE_URL}/sucursales/${BRANCH_ID}/empleados" "${HEADERS[@]}"

# 3. Consultar disponibilidad
curl -X GET "${BASE_URL}/agenda/disponibilidad?profesional_id=5&servicio_id=10&fecha_desde=2025-01-20&fecha_hasta=2025-01-27" "${HEADERS[@]}"

# 4. Crear reserva
curl -X POST "${BASE_URL}/agenda/reserva" "${HEADERS[@]}" \
  -d '{
    "cliente": {
      "nombres": "María",
      "apellidos": "González",
      "telefono": "+595981123456",
      "email": "maria.gonzalez@email.com"
    },
    "profesional_id": 5,
    "servicio_id": 10,
    "fecha": "2025-01-20",
    "hora_inicio": "10:00:00"
  }'

# 5. Reporte diario
curl -X GET "${BASE_URL}/agenda/reporte-diario?fecha=2025-01-20&estado=confirmada" "${HEADERS[@]}"
```

---

## 6. Casos de Uso Comunes

### 6.1 Flujo Completo: Reservar una Cita

```python
def reservar_cita_completo(cliente_nombre, cliente_telefono, profesional_nombre, servicio_nombre, fecha, hora):
    """
    Flujo completo para reservar una cita:
    1. Obtener lista de empleados
    2. Buscar el profesional por nombre
    3. Obtener lista de servicios (necesitarías otro endpoint o tener el ID)
    4. Consultar disponibilidad
    5. Crear la reserva
    """
    
    # 1. Obtener empleados
    empleados_response = listar_empleados()
    if not empleados_response.get("success"):
        return {"error": "No se pudieron obtener los empleados"}
    
    # 2. Buscar profesional
    empleados = empleados_response["data"]["empleados"]
    profesional = None
    for emp in empleados:
        if profesional_nombre.lower() in emp["nombre_completo"].lower():
            profesional = emp
            break
    
    if not profesional:
        return {"error": f"Profesional '{profesional_nombre}' no encontrado"}
    
    # 3. Asumimos que ya tienes el servicio_id (en producción, necesitarías otro endpoint)
    servicio_id = 10  # Esto debería venir de tu sistema
    
    # 4. Consultar disponibilidad
    fecha_desde = fecha
    fecha_hasta = fecha
    disponibilidad_response = consultar_disponibilidad(
        profesional_id=profesional["id"],
        servicio_id=servicio_id,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta
    )
    
    if not disponibilidad_response.get("success"):
        return {"error": "No se pudo consultar la disponibilidad"}
    
    # 5. Verificar que el slot esté disponible
    disponibilidad = disponibilidad_response["data"]["disponibilidad"]
    if not disponibilidad:
        return {"error": "No hay disponibilidad para esta fecha"}
    
    slots = disponibilidad[0]["slots"]
    slot_disponible = None
    for slot in slots:
        if slot["hora_inicio"] == hora and slot["disponible"]:
            slot_disponible = slot
            break
    
    if not slot_disponible:
        return {"error": f"El horario {hora} no está disponible"}
    
    # 6. Crear reserva
    cliente_data = {
        "nombres": cliente_nombre.split()[0] if cliente_nombre.split() else cliente_nombre,
        "apellidos": " ".join(cliente_nombre.split()[1:]) if len(cliente_nombre.split()) > 1 else "",
        "telefono": cliente_telefono
    }
    
    reserva_response = crear_reserva(
        cliente_data=cliente_data,
        profesional_id=profesional["id"],
        servicio_id=servicio_id,
        fecha=fecha,
        hora_inicio=hora
    )
    
    return reserva_response
```

---

### 6.2 Consultar Disponibilidad de la Semana

```python
def disponibilidad_semana(profesional_id, servicio_id):
    """
    Obtiene la disponibilidad de toda la semana actual.
    """
    hoy = datetime.now()
    inicio_semana = hoy - timedelta(days=hoy.weekday())
    fin_semana = inicio_semana + timedelta(days=6)
    
    fecha_desde = inicio_semana.strftime("%Y-%m-%d")
    fecha_hasta = fin_semana.strftime("%Y-%m-%d")
    
    return consultar_disponibilidad(
        profesional_id=profesional_id,
        servicio_id=servicio_id,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta
    )
```

---

### 6.3 Sincronizar Citas del Día

```python
def sincronizar_citas_dia(fecha=None):
    """
    Obtiene todas las citas del día y las sincroniza con tu sistema.
    """
    if not fecha:
        fecha = datetime.now().strftime("%Y-%m-%d")
    
    page = 1
    todas_las_citas = []
    
    while True:
        response = reporte_diario(fecha=fecha, page=page)
        
        if not response.get("success"):
            break
        
        citas = response["data"]["citas"]
        todas_las_citas.extend(citas)
        
        pagination = response.get("pagination", {})
        if not pagination.get("has_next"):
            break
        
        page += 1
    
    return todas_las_citas
```

---

## 7. Manejo de Errores

### 7.1 Códigos HTTP

| Código | Significado | Acción Recomendada |
|--------|-------------|-------------------|
| `200` | OK | Procesar respuesta normalmente |
| `201` | Created | Recurso creado exitosamente |
| `400` | Bad Request | Revisar parámetros enviados |
| `401` | Unauthorized | Verificar API Key y Tenant ID |
| `403` | Forbidden | Verificar permisos de la API Key |
| `404` | Not Found | Recurso no existe |
| `409` | Conflict | Slot ya reservado o conflicto de datos |
| `429` | Too Many Requests | Reducir frecuencia de requests |
| `500` | Internal Server Error | Contactar soporte |

### 7.2 Códigos de Error Comunes

| Código | Descripción | Solución |
|--------|-------------|----------|
| `MISSING_TENANT_KEY` | Falta header X-Tenant-Key | Agregar header requerido |
| `INVALID_API_KEY` | API Key inválida | Verificar credenciales |
| `BRANCH_NOT_FOUND` | Sucursal no encontrada | Verificar Branch ID |
| `SLOT_ALREADY_BOOKED` | Horario ya reservado | Consultar disponibilidad antes de reservar |
| `PROFESIONAL_NOT_AVAILABLE` | Profesional no disponible | Elegir otro horario |
| `DATE_RANGE_TOO_LARGE` | Rango de fechas muy grande | Reducir a máximo 30 días |

### 7.3 Ejemplo de Manejo de Errores

```python
def manejar_respuesta(response):
    """
    Maneja la respuesta de la API y retorna datos o error.
    """
    if response.status_code == 200 or response.status_code == 201:
        data = response.json()
        if data.get("success"):
            return {"success": True, "data": data.get("data")}
        else:
            error = data.get("error", {})
            return {
                "success": False,
                "error_code": error.get("code"),
                "message": error.get("message"),
                "details": error.get("details")
            }
    elif response.status_code == 401:
        return {"success": False, "error": "Autenticación fallida. Verificar credenciales."}
    elif response.status_code == 409:
        error_data = response.json().get("error", {})
        return {
            "success": False,
            "error": "Conflicto",
            "message": error_data.get("message"),
            "conflicto": error_data.get("conflicto")
        }
    else:
        return {
            "success": False,
            "error": f"Error HTTP {response.status_code}",
            "message": response.text
        }

# Uso
response = requests.post(f"{BASE_URL}/agenda/reserva", headers=headers, json=data)
resultado = manejar_respuesta(response)

if not resultado["success"]:
    print(f"Error: {resultado.get('message')}")
    if resultado.get("error_code") == "SLOT_ALREADY_BOOKED":
        print("El horario ya está reservado. Consultar disponibilidad nuevamente.")
else:
    print(f"Reserva creada: {resultado['data']['numero_cita']}")
```

---

## 8. Preguntas Frecuentes

### 8.1 ¿Cómo obtengo el Tenant ID y Branch ID?

**Respuesta**: 
Usa el endpoint `/api/v1/info` con tu API Key para obtener:
- **Tenant ID**: Está en `data.tenant_id` (aunque no lo necesitas en los headers, se obtiene automáticamente)
- **Branch IDs disponibles**: Están en `data.sucursales[].id`

**Ejemplo**:
```python
# Obtener información de la API Key
response = requests.get(
    f"{BASE_URL}/info",
    headers={"X-Tenant-Key": API_KEY}
)
info = response.json()
tenant_id = info["data"]["tenant_id"]  # Solo para referencia
branch_ids = [s["id"] for s in info["data"]["sucursales"]]
```

### 8.2 ¿Cómo obtengo los IDs de profesionales y servicios?

**Respuesta**: 
- **Profesionales**: Usa el endpoint `/api/v1/sucursales/{branch_id}/empleados` para obtener la lista de empleados con sus IDs.
- **Servicios**: Actualmente no hay un endpoint público para listar servicios. Debes obtener estos IDs directamente de tu contacto o del panel administrativo.

### 8.3 ¿Qué pasa si intento reservar un horario que ya está ocupado?

**Respuesta**: Recibirás un error `409 Conflict` con el código `SLOT_ALREADY_BOOKED`. El sistema usa bloqueo transaccional para evitar dobles reservas, así que es seguro intentar reservar múltiples veces: solo una reserva se creará exitosamente.

### 8.3 ¿Puedo cancelar una reserva?

**Respuesta**: Actualmente el endpoint de cancelación está disponible en la API de WhatsApp (`/api/whatsapp/agendamentos/{id}`). Si necesitas cancelar desde tu integración, contacta a soporte para habilitar el endpoint en la API v1.

### 8.5 ¿Cómo manejo las zonas horarias?

**Respuesta**: Todas las fechas y horas se manejan en la zona horaria de la sucursal (configurada en el endpoint de configuración). No necesitas hacer conversiones: envía y recibe fechas/horas en el formato indicado (`YYYY-MM-DD` y `HH:MM:SS`).

### 8.6 ¿Qué formato de teléfono debo usar?

**Respuesta**: Se recomienda usar el formato internacional con código de país (ej: `+595981123456`), pero el sistema acepta cualquier formato. El sistema buscará clientes existentes por teléfono, así que usa un formato consistente.

### 8.7 ¿Hay límite de requests por minuto?

**Respuesta**: Sí, cada API Key tiene un límite configurado (por defecto 1000 requests por hora). Si excedes el límite, recibirás un error `429 Too Many Requests`. Contacta a soporte si necesitas aumentar el límite.

### 8.7 ¿Puedo crear múltiples reservas en paralelo?

**Respuesta**: Sí, pero ten en cuenta que el sistema valida disponibilidad con bloqueo transaccional. Si dos requests intentan reservar el mismo slot simultáneamente, solo una tendrá éxito y la otra recibirá un error `409 Conflict`.

### 8.9 ¿Cómo sé si un cliente ya existe?

**Respuesta**: El sistema busca automáticamente clientes existentes por:
1. Número de documento (si proporcionas `tipo_documento` y `numero_documento`)
2. Email (si proporcionas `email`)
3. Teléfono (si proporcionas `telefono`)

Si encuentra un cliente existente, lo usa. Si no, crea uno nuevo. No necesitas verificar esto manualmente.

---

## 9. Soporte y Contacto

Para soporte técnico o consultas sobre la integración:

- **Email**: api@codeart.com.py
- **Documentación técnica**: Ver `ESPECIFICACION_API_AGENDA.md` para detalles técnicos avanzados

---

## 10. Changelog

### Versión 1.0 (2025-01-19)
- ✅ Endpoints de información (empresas, sucursales, empleados)
- ✅ Consulta de disponibilidad
- ✅ Creación de reservas
- ✅ Reporte diario de citas
- ✅ Configuración de sucursal

---

**Última actualización**: 2025-01-19
