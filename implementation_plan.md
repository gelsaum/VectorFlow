# Refatoração Enterprise do Chatbot VectorFlow

Este plano de implementação visa organizar, modularizar e proteger o código base atual do chatbot de agendamentos no WhatsApp contra falhas e quebras (Erro 500, perdas de conexão e sessões abandonadas).

## User Review Required

> [!IMPORTANT]
> A refatoração envolverá mover código do arquivo `index.js` (atualmente com ~600 linhas) para novas pastas de controle de forma que fique fácil editar os textos e dar manutenção depois. 
> Por favor, leia atentamente a divisão dos módulos propostos abaixo, e avise se você quer que eu instale um banco de dados real (como **SQLite**) para salvar as sessões ativas do cliente ou se prefere manter o andamento na memória RAM porém de forma mais segura (**MemCache isolado**). Recomendo a versão em SQLite caso queira reiniciar o servidor frequentemente sem prejudicar clientes usando o bot no exato momento.

## Proposed Changes

### Core API (`VectorFlow/services/`)

#### [MODIFY] `apiService.js`
- **Não silenciar erros:** Modificar os blocos `try/catch` para que, se a *Urutau API* retornar Erros 500 (como vimos mais cedo) ou 401, a função informe explicitamente esse erro em vez de retornar apenas `[]` (matando a inteligência comercial do bot).
- **Timeouts:** Adicionar um `AbortController` para cancelar a requisição em 10 segundos caso a API esteja fora do ar, evitando "Memory Leaks" no seu código principal e permitindo que o bot avise o cliente da instabilidade técnica da barbaria.

### Gerenciamento de Estado e Visão (`VectorFlow/`)

#### [NEW] `services/sessionService.js`
- Extrair o objeto global de `userSessions = {}` do `index.js` e proteger tudo num `SessionService`. 
- Caso aprovado, implementaremos aqui o serviço de SQLite/Local JSON Database ou `Map` com "Garbage Collector" que descarta quem iniciar uma conversa mas não agendar nada após 2 horas.

#### [NEW] `constants/messages.js`
- Concentrar todos os textos fixos `MAIN_MENU_TEXT`, "¡Hola! Bienvenido a *Studio Ferreira*", etc, num único arquivo isolado, tornando-o o "Dicionário" do bot. Assim o desenvolvedor pode só alterar frases sem o risco de quebrar o roteamento.

#### [NEW] `controllers/agendamentoController.js`
- Transportar todos os fluxos `startScheduling`, `handleDateSelection`, `handleTimeSelection`.

### O Arquivo Principal

#### [MODIFY] `index.js`
- Limpado drasticamente. Só terá a inicialização do Servidor, conexão com o Evolution API (`whatsapp.start(...)`) e fará um `switch-case` com redirecionamento de estado limpo do menu. Ele fará o uso direto do novo `sessionService` e dos Controladores.

## Open Questions

> [!WARNING]
> Selecione o método de como a *Sessão da Conversa* será persistida no servidor durante um agendamento:
> 1. **(Mais Rápido e Limpo):** Continuar mantendo na RAM, porém com o `sessionService.js` bem construído, usando coleções com limpo de cache programada.
> 2. **(Mais Seguro - Nível Produção):** Instalar biblioteca `sqlite3` e persistir a sessão de compra num banquinho leve direto na VM. Se o seu servidor reiniciar no meio de um agendamento, o cliente continua de onde parou.
> 
> *Ps: Eu voto pela **Opção 1**, mas organizando perfeitamente. Como a interação em barbarias dura menos de 2 minutos, o ganho de complexidade com SQLite talvez não seja prioridade logo agora neste projeto.*

## Verification Plan

### Manual Verification
- O usuário deverá rodar `npm start` se houver aprovação.
- Enviar uma mensagem para o Bot recém-reiniciado de fora simulando erro 500.
- Avaliar os Logs limpos no terminal e verificar a redução de tamanho do `index.js`.
