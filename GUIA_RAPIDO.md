# 🚀 Guia Rápido - LigAI

## Passo 1: Configure as API Keys

```bash
cd /root/ligai
nano .env
```

Adicione suas chaves:
```
OPENROUTER_API_KEY=sk-or-v1-sua-chave-aqui
GROQ_API_KEY=gsk-sua-chave-aqui
ELEVENLABS_API_KEY=sua-chave-aqui
```

## Passo 2: Inicie o Servidor

```bash
npm start
```

## Passo 3: Faça uma Chamada de Teste

### Teste SEM IA (só para verificar trunk):
```bash
asterisk -rx "channel originate Local/5584991516506@outbound-calls application Echo"
```

### Teste COM IA:
```bash
# 1. Certifique-se que o servidor Node.js está rodando (npm start)
# 2. Faça a chamada
asterisk -rx "channel originate Local/5584991516506@outbound-calls-ai application Echo"
```

## 📱 O que vai acontecer:

1. Asterisk liga para o número
2. Quando atender, conecta com AudioSocket
3. IA fala: "Olá! Tudo bem? Sou a assistente virtual..."
4. Pessoa responde
5. IA processa e responde
6. Continua conversando

## 🎯 Onde obter as API Keys:

- **OpenRouter**: https://openrouter.ai/keys
- **Groq**: https://console.groq.com/keys
- **Eleven Labs**: https://elevenlabs.io/app/settings/api-keys

## ⚙️ Modelos Recomendados:

- **OpenRouter**: `anthropic/claude-3.5-sonnet` ou `meta-llama/llama-3.1-70b-instruct`
- **Groq STT**: `whisper-large-v3` (já configurado)
- **Eleven Labs Voice**: Adam (português) - já configurado

## 📞 Números de Teste:

- Substitua `5584991516506` pelo número real
- Formato: DDI + DDD + Número (sem espaços ou hífen)
- Exemplo BR: `5511999999999`

## 🐛 Se der erro:

```bash
# Ver logs do Asterisk
tail -f /var/log/asterisk/messages

# Ver logs do Node.js
# (já aparece no terminal onde rodou npm start)

# Verificar se AudioSocket está escutando
netstat -an | grep 9092
```

## ✅ Sistema Funcionando:

Você vai ver nos logs:
```
📞 Nova conexão AudioSocket
👋 Enviando saudação inicial
🎤 Transcrevendo áudio
👤 Usuário disse: olá
🤖 Resposta da IA: Olá! Como posso ajudar?
🗣️  Gerando TTS
📡 Enviando áudio para Asterisk
```

Pronto! 🎉
