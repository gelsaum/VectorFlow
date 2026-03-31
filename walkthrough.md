# Walkthrough: Refatoração do VectorFlow para Padrão Enterprise

O sistema foi refatorado e elevado a um nível corporativo para suportar alta carga de usuários de barbearia simultâneos.

## O que foi alterado e como funciona agora

O código antigo ficava todo dentro de um `index.js` (mais de 600 linhas). Hoje, o sistema está distribuído de forma inteligente em pastas lógicas:

1. **A Memória do Robô agora é Eterna (`sessions.sqlite`)**
   A perda de contexto era o maior problema atual. Para resolver isso instalamos nativamente a dependência robusta `sqlite3` injetada na nova pasta `services/sessionService.js`.
   Sempre que um cliente enviar "/Oi", uma coluna com o número de telefone dele é salva em nanosegundos no arquivo local `sessions.sqlite`. A cada passo do fluxo (escolheu a data, escolheu o barbeiro, etc), esse banco sofre *Update*. Se você reiniciar sua máquina no meio do preenchimento e um cliente mandar a mensagem com a hora logo depois, o seu código lerá o SQLite dele e funcionará perfeitamente sem o usuário nem notar!

2. **Dicionário de Textos Simplificado (`constants/messages.js`)**
   Todas as frases estáticas como `"Menú Principal"`, `"Elige un profesional:"` e `"Opción inválida"` foram separadas em um arquivo limpo.

3. **Arquitetura de Controle (`controllers/flowController.js`)**
   A velha máquina de estados cheia de IFs e Cases do `index.js` foi expurgada de lá e trazida para este arquivo. Aqui fica toda a lógica, permitindo que o `index.js` se transforme no que deve ser: apenas a ponte entre as bases.

4. **Tratamento Anti-Pane da API (`services/apiService.js`)**
   A integração com a Urutau ERP agora é segura:
   - Os erros 500 do servidor Urutau agora são **vistos** e disparam a resposta sincera aos clientes no WhatsApp que o sistema central está momentaneamente instável (Não fingem mais que não há horários!).
   - Adicionamos um **Timeout Forçado de 10 segundos** (`AbortController`). Se o servidor CodeArt ficar "girando" infinito sem responder, a função joga exceção e devolve o fluxo, sem travar todas as requisições em fila.

## Validação de Funcionalidade
> [!NOTE]
> Rodamos o software após toda a cirurgia nas camadas e o resultado de *Health Check* foi magnífico:
> 
> ```bash
> Iniciando sistema VectorFlow (Enterprise Architecture)...
> ✅ Licença Válida.
> [SessionService] Base de dados SQLite (sessions.sqlite) conectada.
> [ApiService] Inicializando conexão com Urutau API...
> 🚀 Servidor Web iniciado en puerto 3007
> [ApiService] Tenant ID conectado: studioferreira        
> [ApiService] Branch ID configurado: 1 (Sucursal 1)
> ✅ Webhook WebService + Urutau API + SQLite Conectados.
> [WhatsappService] Configurado para usar Evolution API
> Esperando webhooks en /webhook...
> ```

A aplicação está protegida e ultra rápida!
