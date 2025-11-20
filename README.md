# 🤖 LigAI - Sistema de IA de Ligações em Tempo Real

Sistema completo de IA para ligações telefônicas usando Asterisk + AudioSocket + IA em tempo real.

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Cliente ◄──► Asterisk ◄──► AudioSocket ◄──► Node.js      │
│                                 (TCP)           Server      │
│                                                   │         │
│                                                   ├──► Groq (STT/Whisper)
│                                                   ├──► OpenRouter (IA)
│                                                   └──► ElevenLabs (TTS)
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## ✅ Status do Projeto

### Componentes Implementados

✅ **Asterisk 18.10.0** - Instalado e configurado
✅ **AudioSocket** - Módulo instalado e funcionando
✅ **Trunk SIP** - Configurado (IP: 138.59.146.69, Tech Prefix: 1290#)
✅ **Servidor AudioSocket Node.js** - Implementado
✅ **Integração Groq** - STT com Whisper (Speech-to-Text)
✅ **Integração OpenRouter** - IA/LLM para processar conversas
✅ **Integração Eleven Labs** - TTS (Text-to-Speech)
✅ **CallManager** - Gerenciador de fluxo de chamadas com IA
✅ **ffmpeg** - Instalado para conversão de áudio

## 📁 Estrutura do Projeto

```
/root/ligai/
├── index.js                    # Arquivo principal
├── package.json                # Dependências Node.js
├── .env                        # Variáveis de ambiente (CONFIGURE AQUI!)
├── .env.example                # Exemplo de configuração
├── src/
│   ├── audiosocket-server.js   # Servidor TCP AudioSocket
│   ├── call-manager.js         # Gerenciador de chamadas com IA
│   └── services/
│       ├── groq-service.js     # Integração Groq (STT)
│       ├── elevenlabs-service.js # Integração Eleven Labs (TTS)
│       └── openrouter-service.js # Integração OpenRouter (IA)
└── README.md                   # Este arquivo
```

## 🚀 Configuração

### 1. Configure as API Keys

Edite o arquivo `.env`:

```bash
nano /root/ligai/.env
```

Adicione suas chaves de API:

```env
# OpenRouter API Key
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxx

# Groq API Key (para STT)
GROQ_API_KEY=gsk_xxxxxxxxxxxx

# Eleven Labs API Key (para TTS)
ELEVENLABS_API_KEY=xxxxxxxxxxxx

# AudioSocket Configuration
AUDIOSOCKET_HOST=0.0.0.0
AUDIOSOCKET_PORT=9092

# AI Configuration
AI_MODEL=anthropic/claude-3.5-sonnet
AI_TEMPERATURE=0.7
AI_MAX_TOKENS=150
```

### 2. Inicie o Servidor

```bash
cd /root/ligai
npm start
```

Você deve ver:

```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║              🤖  LigAI - Sistema de IA                    ║
║           Sistema de Ligações com IA em Tempo Real       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

🚀 ============ LigAI Iniciando ============
📡 AudioSocket: 0.0.0.0:9092
🤖 IA Model: anthropic/claude-3.5-sonnet
==========================================

🎧 AudioSocket Server rodando em 0.0.0.0:9092
```

### 3. Faça uma Chamada de Teste

#### Opção A: Via Console Asterisk (Teste Simples - SEM IA)

```bash
asterisk -rx "channel originate Local/5584991516506@outbound-calls application Echo"
```

#### Opção B: Via Console Asterisk (COM IA)

Primeiro, certifique-se de que o servidor LigAI está rodando (`npm start`), depois:

```bash
# Use AMI para originar chamada com IA
asterisk -rx "originate Local/558499151650@outbound-calls-ai extension wait@default"
```

**Nota**: O contexto `outbound-calls-ai` usa AudioSocket e conecta com a IA!

## 🎯 Como Funciona

### Fluxo de Uma Chamada com IA

1. **Asterisk origina chamada** para o número do cliente
2. **Quando atende**, conecta ao AudioSocket (Node.js)
3. **AudioSocket recebe** frames de áudio PCM (20ms cada)
4. **Acumula ~3 segundos** de áudio
5. **Groq Whisper** converte áudio → texto (STT)
6. **OpenRouter** processa texto com IA → gera resposta
7. **Eleven Labs** converte resposta → áudio (TTS)
8. **AudioSocket envia** áudio de volta para o Asterisk
9. **Cliente ouve** a resposta da IA
10. **Repete** o ciclo até fim da chamada

### Especificações Técnicas

- **Áudio**: PCM 8kHz 16-bit mono
- **Frame Size**: 320 bytes (20ms)
- **Protocolo**: TCP (AudioSocket)
- **Latência**: ~300-700ms por ciclo completo
- **Codecs**: ulaw, alaw, gsm

## 📝 Dialplan do Asterisk

### Contextos Configurados

**1. `outbound-calls-ai`** - Chamadas com IA
```
[outbound-calls-ai]
exten => _X.,1,NoOp(===== Chamada IA para ${EXTEN} =====)
    same => n,Dial(PJSIP/1290#${EXTEN}@sip-trunk,60,g)
    same => n,GotoIf($["${DIALSTATUS}" = "ANSWER"]?answered:hangup)
    same => n(answered),AudioSocket(127.0.0.1:9092,${UNIQUEID})
    same => n(hangup),Hangup()
```

**2. `outbound-calls`** - Chamadas simples (sem IA)
```
[outbound-calls]
exten => _X.,1,Dial(PJSIP/1290#${EXTEN}@sip-trunk,60)
    same => n,Hangup()
```

## 🛠️ Troubleshooting

### Servidor Node.js não inicia

**Erro**: "Missing API keys"

**Solução**: Configure as chaves de API no arquivo `.env`

```bash
cp .env.example .env
nano .env
# Adicione suas chaves de API
```

---

**Erro**: "ffmpeg not found"

**Solução**: ffmpeg já está instalado, mas se der erro:
```bash
sudo apt-get install -y ffmpeg
```

### AudioSocket não conecta

**Verificar se servidor está rodando**:
```bash
netstat -an | grep 9092
```

Deve mostrar: `0.0.0.0:9092  LISTEN`

**Verificar módulo AudioSocket no Asterisk**:
```bash
asterisk -rx "module show like audiosocket"
```

Deve mostrar: `res_audiosocket.so  Running`

### Chamada não ativa IA

**Verificar logs do Node.js**:
```bash
# Rode o servidor e veja os logs
npm start
```

**Verificar se AudioSocket foi chamado**:
```bash
asterisk -rx "core show channels"
```

## 🔧 Comandos Úteis

### Asterisk

```bash
# Ver chamadas ativas
asterisk -rx "core show channels"

# Ver endpoints SIP
asterisk -rx "pjsip show endpoints"

# Ver dialplan
asterisk -rx "dialplan show outbound-calls-ai"

# Console interativo
asterisk -rvvv
```

### Node.js

```bash
# Iniciar servidor
npm start

# Modo desenvolvimento (auto-reload)
npm run dev

# Ver logs
tail -f /var/log/asterisk/messages
```

## 📊 Monitoramento

### Logs do Asterisk
```bash
tail -f /var/log/asterisk/messages
```

### Logs do Node.js
O servidor imprime logs em tempo real:
- 📞 Nova conexão
- 🎤 Transcrevendo áudio
- 👤 Usuário disse
- 🤖 Resposta da IA
- 🗣️ Gerando TTS
- 📡 Enviando áudio

## 🎨 Personalizando a IA

Edite o prompt do sistema em `src/call-manager.js`:

```javascript
this.openRouterService.setSystemPrompt(sessionId, `
Você é um vendedor expert em produtos X.
Seu objetivo é:
- Qualificar o lead
- Agendar uma demonstração
- Ser persuasivo mas não agressivo
...
`);
```

## ⚙️ Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `AUDIOSOCKET_HOST` | Host do AudioSocket | `0.0.0.0` |
| `AUDIOSOCKET_PORT` | Porta do AudioSocket | `9092` |
| `GROQ_API_KEY` | API Key do Groq | - |
| `ELEVENLABS_API_KEY` | API Key do Eleven Labs | - |
| `OPENROUTER_API_KEY` | API Key do OpenRouter | - |
| `AI_MODEL` | Modelo de IA | `anthropic/claude-3.5-sonnet` |
| `AI_TEMPERATURE` | Criatividade da IA | `0.7` |
| `AI_MAX_TOKENS` | Tamanho máximo da resposta | `150` |

## 🔐 Segurança

- ✅ AudioSocket só aceita conexões locais (127.0.0.1)
- ✅ API Keys em arquivo .env (não versionado)
- ⚠️ Para produção, use firewall e SSL/TLS

## 📚 Documentação Adicional

- [Asterisk AudioSocket](https://docs.asterisk.org/Configuration/Channel-Drivers/AudioSocket/)
- [Groq API](https://console.groq.com/docs)
- [Eleven Labs API](https://elevenlabs.io/docs)
- [OpenRouter API](https://openrouter.ai/docs)

## 🐛 Problemas Conhecidos

1. **pbx_config não carrega** - Contexto `outbound-calls-ai` pode não aparecer
   - Solução: Use AMI para originar chamadas ou configure via AEL

2. **Latência alta** - Primeira resposta pode demorar
   - Normal: Primeira chamada carrega modelos
   - Chamadas subsequentes são mais rápidas

## 📞 Próximos Passos

1. **Sistema de Lista de Clientes** - Gerenciar números para ligar
2. **Dashboard Web** - Interface para monitorar chamadas
3. **Relatórios** - Análise de conversas e métricas
4. **Escalabilidade** - Múltiplas chamadas simultâneas

---

**Desenvolvido com ❤️ usando Asterisk + Node.js + IA**
