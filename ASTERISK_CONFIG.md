# Configuração do Asterisk para Sistema de IA de Ligações

## Status Atual
- Asterisk 18.10.0 instalado e parcialmente configurado
- Trunk SIP configurado para IP: 138.59.146.69
- Tech Prefix: 1290#

## Arquivos de Configuração

### 1. PJSIP Trunk (/etc/asterisk/pjsip.conf)
```ini
;=============================================================================
; CONFIGURAÇÃO DO TRUNK SIP (IP-BASED) - 138.59.146.69
;=============================================================================

; Transporte UDP
[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0

; Endpoint do trunk
[sip-trunk]
type=endpoint
context=from-trunk
disallow=all
allow=ulaw
allow=alaw
allow=gsm
aors=sip-trunk-aor
direct_media=no
from_user=asterisk

; Address of Record
[sip-trunk-aor]
type=aor
contact=sip:138.59.146.69:5060
qualify_frequency=60

; Identificação por IP (para chamadas recebidas)
[sip-trunk-identify]
type=identify
endpoint=sip-trunk
match=138.59.146.69
```

### 2. Dialplan (/etc/asterisk/extensions.conf)
```ini
;=============================================================================
; CONFIGURAÇÃO PARA CHAMADAS DE SAÍDA VIA TRUNK SIP
;=============================================================================

; Contexto para chamadas de saída
; O tech prefix 1290# será adicionado antes do número discado
[outbound-calls]
exten => _X.,1,NoOp(Chamada de saída para ${EXTEN})
    same => n,Set(CALLERID(num)=${CALLERID(num)})
    same => n,Dial(PJSIP/1290#${EXTEN}@sip-trunk,60)
    same => n,Hangup()

; Contexto para receber chamadas do trunk (se necessário)
[from-trunk]
exten => _X.,1,NoOp(Chamada recebida de ${CALLERID(num)})
    same => n,Answer()
    same => n,Playback(hello-world)
    same => n,Hangup()
```

## Como Fazer Chamadas de Saída

Para fazer uma chamada de saída através do trunk SIP, você precisa:

1. Criar um canal SIP local (telefone ou aplicação)
2. Configurar esse canal para usar o contexto `outbound-calls`
3. Ao discar qualquer número, o Asterisk automaticamente:
   - Adiciona o tech prefix `1290#` antes do número
   - Roteia a chamada através do trunk SIP para 138.59.146.69

### Exemplo de Uso via AMI (Asterisk Manager Interface):
```
Action: Originate
Channel: Local/5551234567@outbound-calls
Exten: 5551234567
Context: outbound-calls
Priority: 1
CallerID: "Sistema IA" <1000>
```

### Exemplo de Uso via CLI:
```bash
asterisk -rx "channel originate Local/5551234567@outbound-calls application Playback demo-congrats"
```

## Próximos Passos

1. **Verificar Status do Endpoint**:
   ```bash
   asterisk -rx "pjsip show endpoints"
   ```

2. **Testar Conectividade SIP**:
   ```bash
   asterisk -rx "pjsip qualify sip-trunk-aor"
   ```

3. **Ver Logs em Tempo Real**:
   ```bash
   asterisk -rvvv
   ```

4. **Integração com o Sistema de IA**:
   - O sistema de IA precisa se conectar ao Asterisk via:
     - **AMI (Asterisk Manager Interface)**: Para originar chamadas
     - **ARI (Asterisk REST Interface)**: Para controle avançado e manipulação de chamadas
     - **AGI (Asterisk Gateway Interface)**: Para processar áudio em tempo real

## Configurações Adicionais Necessárias

### Para ARI (necessário para integração com IA):
Editar `/etc/asterisk/ari.conf`:
```ini
[general]
enabled = yes

[seu_usuario]
type = user
password = sua_senha_segura
```

### Para AMI (para originar chamadas):
Editar `/etc/asterisk/manager.conf`:
```ini
[general]
enabled = yes
port = 5038
bindaddr = 0.0.0.0

[seu_usuario]
secret = sua_senha_segura
deny = 0.0.0.0/0.0.0.0
permit = 127.0.0.1/255.255.255.0
read = system,call,log,verbose,command,agent,user,config
write = system,call,log,verbose,command,agent,user,config,originate
```

## Troubleshooting

### Verificar se o Asterisk está rodando:
```bash
systemctl status asterisk
```

### Reiniciar Asterisk:
```bash
systemctl restart asterisk
```

### Ver logs de erros:
```bash
tail -f /var/log/asterisk/messages
```

### Testar configuração PJSIP:
```bash
asterisk -rx "pjsip show endpoints"
asterisk -rx "pjsip show aors"
```

## Notas Importantes

- O trunk está configurado sem autenticação (IP-based)
- O provedor SIP autentica baseado no IP de origem
- O codec configurado é ulaw, alaw e gsm
- O tech prefix `1290#` é adicionado automaticamente ao número discado
- Para integrar com STT (Eleven Labs) e TTS (Groq), você precisará usar ARI ou AGI
