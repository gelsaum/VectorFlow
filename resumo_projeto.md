# 📖 Resumo Técnico: VectorFlow Bot

Este documento serve como um guia rápido para entender e modificar o projeto *VectorFlow Bot* (Studio Ferreira) sem precisar ler o código-fonte inteiro.

---

## 1. 🎯 Visão Geral do Sistema
O bot é um sistema automatizado para **Agendamento de Serviços via WhatsApp**. Ele foi construído com uma infraestrutura leve, rápida e desacoplada, utilizando Node.js. 

**Stack Tecnológica:**
* **Express.js:** Para recepcionar os Webhooks (mensagens recebidas).
* **SQLite:** Banco de dados ultrarrápido para controle das sessões (garantir que o bot lembre a conversa).
* **Evolution API:** Interface não-oficial / gateway para tráfego das mensagens de WhatsApp.
* **Urutau API:** O sistema de back-office/CRM onde os dados reais de agendamentos e horários ficam salvos.

---

## 2. 📂 Estrutura de Arquivos (Onde cada coisa mora)

Se você precisar alterar o projeto no futuro, vá direto para o arquivo correspondente:

### ⚙️ \`index.js\` (O Motor Central)
Inicia todas as conexões ao mesmo tempo (Banco de Dados, Servidor Express e as APIs) e põe o bot pra rodar.

### 🧠 \`controllers/flowController.js\` (O Cérebro da Conversa)
**É aqui que toda a mágica da conversa acontece.** Ele tem a árvore de decisões (\`STEPS\`) e avalia o que o cliente digitou.
* Se quiser adicionar uma nova opção no menu ou mudar a sequência das perguntas (ex: pedir o CPF antes do Nome), é neste arquivo que você fará a alteração.

### 🔌 \`services/apiService.js\` (A Ponte com o Sistema)
Arquivo que se conecta ao "Urutau CRM". Ele tem os métodos como buscar funcionários, ver os horários ocupados de hoje e salvar o agendamento final no banco oficial.

### 💬 \`services/whatsappService.js\` (Comunicação do WhatsApp)
Este serviço formata e dispara as mensagens lá pra Evolution API (e finalmente chegam no celular do cliente).

### 🌐 \`services/webService.js\` (O Ouvinte)
Levanta um servidor local (Porta 3000) e fica de "olhos e ouvidos" abertos na URL \`/webhook\`. Quando um cliente manda "Oi" no WhatsApp da barbearia, a Evolution API bate nesta porta avisando que há uma mensagem nova.

### 🗄️ \`services/sessionService.js\` (Gerente de Memória - SQLite)
Responsável por salvar ou atualizar o "Passo" (Step) do cliente no banco local \`sessions.sqlite\`. Ele impede problemas de concorrência usando o "WAL Mode" (alta disponibilidade).

---

## 3. 📝 Como Modificar Textos e Mensagens Mapeadas

Todas as frases, saudações, alertas de erros e botões do nosso bot estão separados para facilitar a edição.

👉 Para mudar qualquer texto do bot, **NÃO edite o \`flowController.js\`**, vá no arquivo:
**\`constants/messages.js\`**

Lá haverá variáveis diretas, exemplo:
\`\`\`javascript
WELCOME: '¡Hola! Bienvenido a *Studio Ferreira* ¿en qué podemos ayudarte?.\n',
\`\`\`
*(Basta trocar o texto entre aspas simples para atualizar a resposta na hora).*

---

## 4. 🗃️ Estrutura do Banco SQLite Local

O projeto não requer configuração complexa de banco (como MySQL ou Postgres). Ele usará o SQLite auto-gerado através de um arquivo chamado \`sessions.sqlite\`.

**Tabela: \`UserSessions\`**
* \`phone\` (string): O telefone do cliente (chave primária).
* \`step\` (string): ONDE ele está na conversa (ex: \`START\`, \`SELECT_TIME\`).
* \`data\` (JSON): Os dados escolhidos até então (ex: o Barbeiro, a Data, o Horário).
* \`lastActivity\` (number): Timestamp para calcular a inatividade e expirar sessões muito antigas (5 minutos).

---

## 5. 🔑 Variáveis de Ambiente (\`.env\`)

O arquivo secreto que guarda todas as chaves do castelo. Sem ele bem configurado, as comunicações despencam:
* **\`URUTAU_API_KEY\` e \`URL\`**: Permissão para gravar no sistema da loja.
* **\`EVOLUTION_API_KEY\` e \`URL\`**: Acesso ao chip do seu WhatsApp pela cloud de terceiros.
* **\`PORT\`**: A porta que o webhook será servido localmente.

---

> **Dica Final:** Se um dia o bot "paralisar" para os clientes, a causa #1 é sessão travada ou concorrência. Nesses raros casos, você pode excluir o arquivo \`sessions.sqlite\` com o bot desligado, e ligar novamente. Ele começará do zero e de forma limpa.
