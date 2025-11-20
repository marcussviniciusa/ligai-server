# ✅ Asterisk Configurado com Sucesso!

## Status Final

✅ **Asterisk 18.10.0** rodando perfeitamente
✅ **Trunk SIP PJSIP** configurado e operacional
✅ **Dialplan** carregado e funcional
✅ **pbx_config** carregando corretamente

## Configurações Finais Aplicadas

### 1. Trunk SIP (PJSIP)
**Endpoint**: `sip-trunk`
- IP: 138.59.146.69:5060
- Tech Prefix: 1290# (aplicado automaticamente no dialplan)
- Codecs: ulaw, alaw, gsm
- Autenticação: IP-based (sem senha)
- Status: Unavailable (normal antes da primeira chamada)

### 2. Dialplan

**Contexto de Saída** (`outbound-calls`):
```
_X. => 1. NoOp(Chamada de saída para ${EXTEN})
       2. Set(CALLERID(num)=${CALLERID(num)})
       3. Dial(PJSIP/1290#${EXTEN}@sip-trunk,60)
       4. Hangup()
```

**Contexto de Entrada** (`from-trunk`):
```
_X. => 1. NoOp(Chamada recebida de ${CALLERID(num)})
       2. Answer()
       3. Playback(hello-world)
       4. Hangup()
```

### 3. Correções Aplicadas

**Problema**: pbx_lua conflitava com pbx_config
**Solução**: Desabilitado pbx_lua em `/etc/asterisk/modules.conf`

**Problema**: Permissões incorretas
**Solução**: Todos os arquivos de configuração agora pertencem ao usuário `asterisk`

## Comandos de Verificação

### Verificar Endpoints
```bash
asterisk -rx "pjsip show endpoints"
```

### Verificar Dialplan
```bash
asterisk -rx "dialplan show outbound-calls"
asterisk -rx "dialplan show from-trunk"
```

### Verificar Módulos
```bash
asterisk -rx "module show like pbx"
asterisk -rx "module show like pjsip"
```

### Logs em Tempo Real
```bash
asterisk -rvvv
```

## Como Fazer uma Chamada de Teste

### Via Console Asterisk
```bash
asterisk -rx "channel originate Local/5511999999999@outbound-calls application Echo"
```

Isso irá:
1. Discar para 5511999999999
2. Adicionar o tech prefix 1290# automaticamente
3. Enviar a chamada através do trunk SIP para 138.59.146.69

### Via AMI (Asterisk Manager Interface)

Primeiro, habilite o AMI editando `/etc/asterisk/manager.conf`:

```ini
[general]
enabled = yes
port = 5038
bindaddr = 127.0.0.1

[ligai]
secret = SenhaSegura123
deny = 0.0.0.0/0.0.0.0
permit = 127.0.0.1/255.255.255.0
read = all
write = all
```

Reinicie o Asterisk:
```bash
asterisk -rx "manager reload"
```

Código Node.js exemplo:
```javascript
const ami = require('asterisk-manager')('5038', 'localhost', 'ligai', 'SenhaSegura123', true);

ami.action({
  'action': 'originate',
  'channel': 'Local/5511999999999@outbound-calls',
  'application': 'Echo'
}, function(err, res) {
  console.log(res);
});
```

## Integração com IA (OpenRouter + Groq + Eleven Labs)

### Arquitetura Recomendada

```
┌─────────────┐
│   Node.js   │ ← Seu aplicativo de IA
│     App     │
└──────┬──────┘
       │
       ├─────────────────────────────────┐
       │                                 │
       ▼                                 ▼
┌─────────────┐                  ┌──────────────┐
│  AMI/ARI    │                  │  WebRTC/WS   │
│  Interface  │                  │   (Futuro)   │
└──────┬──────┘                  └──────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│           Asterisk PBX                  │
│  ┌─────────────┐      ┌──────────────┐ │
│  │   Dialplan  │      │  PJSIP Trunk │ │
│  │outbound-calls│◄────►│  sip-trunk   │ │
│  └─────────────┘      └──────┬───────┘ │
└────────────────────────────────┼────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Provedor SIP         │
                    │  138.59.146.69        │
                    │  Tech Prefix: 1290#   │
                    └───────────────────────┘
```

### Fluxo de Chamada com IA

1. **Originar Chamada** (via AMI)
2. **Capturar Áudio** (via ARI ou AGI)
3. **STT**: Eleven Labs converte fala → texto
4. **IA**: OpenRouter processa o texto
5. **TTS**: Groq converte resposta → áudio
6. **Reproduzir**: Asterisk toca o áudio na chamada

### Habilitar ARI

Edite `/etc/asterisk/ari.conf`:
```ini
[general]
enabled = yes
pretty = yes

[ligai]
type = user
read_only = no
password = SenhaSegura123
```

Edite `/etc/asterisk/http.conf`:
```ini
[general]
enabled = yes
bindaddr = 127.0.0.1
bindport = 8088
```

Reinicie:
```bash
asterisk -rx "module reload res_http.so"
asterisk -rx "ari reload"
```

Teste ARI:
```bash
curl -u ligai:SenhaSegura123 http://127.0.0.1:8088/ari/endpoints
```

## Próximos Passos

### 1. Implementar Sistema de IA
- [ ] Configurar OpenRouter para processamento de linguagem
- [ ] Integrar Groq para TTS
- [ ] Integrar Eleven Labs para STT
- [ ] Criar aplicação Node.js que conecta tudo

### 2. Configurações Adicionais

#### Gravar Chamadas
Adicione ao dialplan:
```ini
exten => _X.,1,NoOp(Chamada de saída para ${EXTEN})
    same => n,Set(CALLERID(num)=${CALLERID(num)})
    same => n,MixMonitor(/var/spool/asterisk/monitor/${UNIQUEID}.wav)
    same => n,Dial(PJSIP/1290#${EXTEN}@sip-trunk,60)
    same => n,Hangup()
```

#### Adicionar Fila de Chamadas
```ini
; Crie uma lista de números para ligar
[outbound-campaign]
exten => start,1,NoOp(Iniciando campanha)
    same => n,Originate(Local/5511999999999@outbound-calls,app,MusicOnHold)
    same => n,Wait(5)
    same => n,Originate(Local/5511888888888@outbound-calls,app,MusicOnHold)
    same => n,Hangup()
```

#### Monitoramento
```bash
# Ver chamadas ativas
asterisk -rx "core show channels"

# Ver status do trunk
asterisk -rx "pjsip show endpoint sip-trunk"

# Logs
tail -f /var/log/asterisk/messages
```

## Troubleshooting

### Chamada Não Sai
```bash
# Verificar trunk
asterisk -rx "pjsip show endpoint sip-trunk"

# Habilitar debug
asterisk -rx "pjsip set logger on"

# Ver logs
tail -f /var/log/asterisk/messages
```

### Dialplan Não Carrega
```bash
# Verificar pbx_config
asterisk -rx "module show like pbx_config"

# Recarregar dialplan
asterisk -rx "dialplan reload"

# Ver dialplan
asterisk -rx "dialplan show"
```

### Asterisk Não Inicia
```bash
# Verificar logs
tail -f /var/log/asterisk/messages

# Verificar permissões
ls -la /etc/asterisk/*.conf

# Corrigir permissões
chown -R asterisk:asterisk /etc/asterisk/
chmod 640 /etc/asterisk/*.conf
```

## Arquivos Importantes

- `/etc/asterisk/pjsip.conf` - Configuração do trunk SIP
- `/etc/asterisk/extensions.conf` - Dialplan (rotas de chamadas)
- `/etc/asterisk/modules.conf` - Módulos carregados
- `/etc/asterisk/ari.conf` - Interface REST (para IA)
- `/etc/asterisk/manager.conf` - Interface AMI (para originar chamadas)
- `/var/log/asterisk/messages` - Logs principais
- `/var/spool/asterisk/monitor/` - Gravações de chamadas

## Referências

- [Asterisk Wiki](https://wiki.asterisk.org)
- [PJSIP Configuration](https://wiki.asterisk.org/wiki/x/EwFB)
- [ARI Documentation](https://wiki.asterisk.org/wiki/x/ewFRAQ)
- [AMI Events](https://wiki.asterisk.org/wiki/x/LgFRAQ)

---

**Configuração concluída em**: 19/11/2025
**Versão do Asterisk**: 18.10.0
**Sistema Operacional**: Ubuntu 22.04 LTS
