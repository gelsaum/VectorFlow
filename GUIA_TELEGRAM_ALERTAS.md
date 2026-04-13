# 🔔 Guia: Notificações de Erro via Telegram

## Resumo
Este guia explica como configurar o bot VectorFlow para enviar alertas automáticos via Telegram quando ocorrer algum problema no serviço. Assim você fica sabendo em tempo real quando algo der errado, mesmo não estando no computador.

---

## 1. Como Funciona

```
Bot VectorFlow → Detecta erro → Envia mensagem via Telegram Bot API → Você recebe no celular
```

A API do Telegram é **gratuita**, não precisa de servidor extra, e funciona com uma simples requisição HTTP POST. Basta criar um "Bot" no Telegram e obter um token.

---

## 2. Passo a Passo para Configurar

### 2.1 Criar o Bot no Telegram
1. Abra o Telegram e procure por **@BotFather**
2. Envie o comando `/newbot`
3. Escolha um nome (ex: `Studio Ferreira Alertas`)
4. Escolha um username (ex: `studio_ferreira_alertas_bot`)
5. O BotFather vai te dar um **Token** como:
   ```
   7123456789:AAF1234567890abcdefghijklmnopqrstuvwx
   ```
6. **Guarde esse token!**

### 2.2 Descobrir seu Chat ID
1. Envie qualquer mensagem para o bot que você acabou de criar
2. Acesse no navegador:
   ```
   https://api.telegram.org/bot<SEU_TOKEN>/getUpdates
   ```
3. Na resposta JSON, procure por `"chat":{"id": 123456789}`
4. **Guarde esse número!** (é o seu Chat ID)

### 2.3 Configurar no `.env`
Adicione estas duas linhas ao seu arquivo `.env`:
```env
# Telegram Alertas
TELEGRAM_BOT_TOKEN=7123456789:AAF1234567890abcdefghijklmnop
TELEGRAM_CHAT_ID=123456789
```

### 2.4 Criar o Serviço de Notificação
Crie o arquivo `services/telegramAlert.js` com o código abaixo:

```javascript
class TelegramAlert {
    constructor() {
        this.token = process.env.TELEGRAM_BOT_TOKEN;
        this.chatId = process.env.TELEGRAM_CHAT_ID;
        this.enabled = !!(this.token && this.chatId);
        this.lastAlert = {}; // Anti-spam: evita enviar o mesmo erro repetidamente
        this.COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos entre alertas iguais
    }

    async send(tipo, mensagem) {
        if (!this.enabled) return;

        // Anti-spam: verificar se já enviou esse tipo de alerta recentemente
        const now = Date.now();
        if (this.lastAlert[tipo] && (now - this.lastAlert[tipo]) < this.COOLDOWN_MS) {
            return; // Ignorar alerta duplicado dentro do cooldown
        }
        this.lastAlert[tipo] = now;

        const texto = `🚨 *ALERTA — Studio Ferreira Bot*\n\n` +
                      `*Tipo:* ${tipo}\n` +
                      `*Hora:* ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Asuncion' })}\n\n` +
                      `${mensagem}`;

        try {
            await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.chatId,
                    text: texto,
                    parse_mode: 'Markdown'
                })
            });
        } catch (err) {
            // Falha silenciosa — não queremos que um erro no Telegram derrube o bot
            console.error('[TelegramAlert] Falha ao enviar alerta:', err.message);
        }
    }
}

module.exports = new TelegramAlert();
```

### 2.5 Integrar nos Arquivos Existentes

#### Em `index.js` (erros fatais):
```javascript
const telegram = require('./services/telegramAlert');

process.on('unhandledRejection', (reason) => {
    console.error('🚫 Promessa não tratada:', reason);
    telegram.send('ERRO FATAL', `Promessa não tratada: ${reason}`);
});
process.on('uncaughtException', (err) => {
    console.error('🚫 Erro fatal:', err);
    telegram.send('ERRO FATAL', `Exceção não capturada: ${err.message}`);
});
```

#### Em `apiService.js` (erros de API):
```javascript
const telegram = require('./telegramAlert');

// No catch de addAppointment:
telegram.send('ERRO AGENDAMENTO', `Falha ao salvar: ${error.message}`);

// No catch de getAvailableSlots:
telegram.send('ERRO API URUTAU', `Falha ao buscar horários: ${error.message}`);
```

#### Em `flowController.js` (erros do fluxo):
```javascript
const telegram = require('../services/telegramAlert');

// No catch principal do handleMessage:
telegram.send('ERRO NO FLUXO', `Erro no fluxo do usuário: ${error.message}`);
```

---

## 3. Tipos de Erro que Podem Ser Monitorados

### 🔴 Erros Críticos (Prioridade Alta)
| Erro | O que significa | Quando acontece |
|---|---|---|
| `uncaughtException` | O bot crashou | Bug no código não tratado |
| `unhandledRejection` | Promessa falhou sem catch | Falha assíncrona não capturada |
| `EADDRINUSE` | Porta 3007 ocupada | Outro processo usando a mesma porta |
| `SQLite BUSY` | Banco de dados travado | Muitas escritas simultâneas |

### 🟡 Erros de Integração (Prioridade Média)
| Erro | O que significa | Quando acontece |
|---|---|---|
| `HTTP 500 da API Urutau` | Servidor do Urutau com problema | Bug ou manutenção no Urutau |
| `HTTP 401/403 da API` | API Key inválida ou expirada | Mudança de credenciais |
| `Timeout da API` | Urutau demorou demais (>10s) | Servidor lento ou fora do ar |
| `SLOT_ALREADY_BOOKED` | Horário já reservado | Dois clientes tentaram ao mesmo tempo |
| `Erro ao enviar mensagem` | Evolution API falhou | Instância desconectada no WhatsApp |

### 🟢 Erros Operacionais (Prioridade Baixa)
| Erro | O que significa | Quando acontece |
|---|---|---|
| `Sessão expirada` | Usuário ficou inativo >5min | Normal, não é problema |
| `Opção inválida` | Usuário digitou texto errado | Normal, o bot já trata |
| `Nome muito curto` | Usuário digitou menos de 3 letras | Normal, o bot já trata |

---

## 4. Mecânica Anti-Spam

O sistema inclui um **cooldown de 5 minutos** por tipo de erro. Isso significa que se o mesmo erro acontecer 100 vezes em 1 minuto, você só recebe **1 notificação**. Isso evita:
- Flood no seu Telegram
- Consumo excessivo de banda
- Bloqueio pela API do Telegram (limite de 30 msgs/segundo)

---

## 5. Exemplo de Notificação Recebida

```
🚨 ALERTA — Studio Ferreira Bot

Tipo: ERRO API URUTAU
Hora: 12/04/2026, 17:15:00

Falha ao buscar horários: Erro HTTP 500: column
producto.registro_sanitario does not exist
```

---

## 6. Custo

| Item | Custo |
|---|---|
| API do Telegram | ✅ Gratuito |
| Criar o bot | ✅ Gratuito |
| Enviar mensagens | ✅ Gratuito |
| Limite | 30 mensagens/segundo (mais que suficiente) |

---

## 7. Alternativas

| Solução | Custo | Complexidade |
|---|---|---|
| **Telegram** (recomendado) | Gratuito | Fácil |
| Email (SMTP) | Gratuito | Médio |
| Discord Webhook | Gratuito | Fácil |
| Slack Webhook | Gratuito até 10k msgs/mês | Médio |
| SMS (Twilio) | Pago (~$0.01/msg) | Médio |
