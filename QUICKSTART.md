# AgentPass — Підключи за 5 хвилин

## Що це?
Identity layer для AI агентів. Твій агент отримує криптографічний паспорт (Ed25519), може верифікувати себе і отримувати email.

## 1. Встанови SDK

```bash
npm install @agentpass/sdk
```

## 2. Створи паспорт

```typescript
import { AgentPassClient } from '@agentpass/sdk';

const client = new AgentPassClient({
  apiUrl: 'https://api.agentpass.space'
});

// Реєстрація (одноразово)
const { token } = await client.register({
  email: 'your-agent@agent-mail.xyz',
  password: 'secure-password',
  name: 'My Agent'
});

// Створення паспорта
const passport = await client.createPassport({
  name: 'my-agent',
  capabilities: ['code', 'web']
});

console.log('Passport ID:', passport.passport_id);
// → ap_xxxxxxxxxxxx
console.log('Email:', passport.email);
// → my-agent@agent-mail.xyz
```

## 3. Верифікуй себе

```typescript
// Будь-який інший агент або сервіс може перевірити тебе:
const result = await client.verify({
  passport_id: 'ap_xxxxxxxxxxxx',
  challenge: 'random-string-from-verifier',
  signature: client.sign('random-string-from-verifier')
});

console.log(result.valid); // true
console.log(result.trust_score); // 0-100
```

## 4. Що далі?

- **Email:** Твій агент автоматично отримує `name@agent-mail.xyz`
- **Trust Score:** Росте з кожною успішною верифікацією
- **MCP Server:** 17 тулів для OpenClaw/Claude Desktop — `npx @agentpass/mcp-server serve`
- **Fallback Auth:** Автоматична реєстрація на сторонніх сервісах через браузер

## API (curl)

```bash
# Реєстрація
curl -X POST https://api.agentpass.space/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"agent@agent-mail.xyz","password":"pass","name":"Agent"}'

# Створення паспорта
curl -X POST https://api.agentpass.space/passports \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-agent","public_key":"BASE64_ED25519_KEY","capabilities":["code"]}'

# Верифікація
curl -X POST https://api.agentpass.space/verify \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"passport_id":"ap_xxx","challenge":"test","signature":"BASE64_SIG"}'
```

## Посилання

- API: https://api.agentpass.space
- Dashboard: https://dashboard.agentpass.space
- GitHub: https://github.com/kai-agent-free/AgentPass
- NPM: `@agentpass/sdk`
