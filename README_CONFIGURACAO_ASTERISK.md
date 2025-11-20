# Configuração do Asterisk - Sistema de IA de Ligações

## Status Atual

✅ Asterisk 18.10.0 instalado e rodando
✅ Configurações PJSIP criadas para o trunk SIP
⚠️ Dialplan configurado mas módulo pbx_config com problemas de carregamento
⚠️ Endpoint PJSIP não está sendo reconhecido (necessita investigação adicional)

## Informações do Trunk SIP

- **IP de destino**: 138.59.146.69
- **Porta**: 5060 (padrão SIP)
- **Tech Prefix**: 1290#
- **Tipo de autenticação**: IP-based (sem usuário/senha)
- **Codecs**: ulaw, alaw, gsm

## Arquivos de Configuração

### 1. Trunk PJSIP
**Arquivo**: `/etc/asterisk/pjsip.conf` (final do arquivo)

```ini
[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0

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

[sip-trunk-aor]
type=aor
contact=sip:138.59.146.69:5060
qualify_frequency=60

[sip-trunk-identify]
type=identify
endpoint=sip-trunk
match=138.59.146.69
```

### 2. Dialplan
**Arquivo**: `/etc/asterisk/extensions.conf` (final do arquivo)

```ini
[outbound-calls]
exten => _X.,1,NoOp(Chamada de saída para ${EXTEN})
    same => n,Set(CALLERID(num)=${CALLERID(num)})
    same => n,Dial(PJSIP/1290#${EXTEN}@sip-trunk,60)
    same => n,Hangup()

[from-trunk]
exten => _X.,1,NoOp(Chamada recebida de ${CALLERID(num)})
    same => n,Answer()
    same => n,Playback(hello-world)
    same => n,Hangup()
```

## Problemas Identificados

### 1. Módulo pbx_config não carrega
O módulo responsável por ler o `extensions.conf` não está carregando corretamente.

**Solução alternativa**: Usar pbx_lua ou pbx_ael, ou configurar via Realtime Database.

### 2. Endpoint PJSIP não está sendo reconhecido
Apesar da configuração estar correta, o endpoint não aparece ao executar `pjsip show endpoints`.

**Possíveis causas**:
- Conflito com configuração wizard em `/etc/asterisk/pjsip_wizard.conf`
- Erro de sintaxe não detectado
- Módulo PJSIP precisa ser recarregado completamente

## Comandos Úteis

### Verificar Status do Asterisk
```bash
systemctl status asterisk
```

### Conectar ao Console do Asterisk
```bash
asterisk -rvvv
```

### Recarregar Configurações PJSIP
```bash
asterisk -rx "pjsip reload"
```

### Ver Endpoints PJSIP
```bash
asterisk -rx "pjsip show endpoints"
asterisk -rx "pjsip show aors"
asterisk -rx "pjsip show contacts"
```

### Verificar Logs
```bash
tail -f /var/log/asterisk/messages
```

### Reiniciar Asterisk
```bash
systemctl restart asterisk
```

## Próximos Passos para Resolver os Problemas

### 1. Desabilitar wizard e usar apenas pjsip.conf

Editar `/etc/asterisk/modules.conf` e adicionar:
```ini
noload => res_pjsip_config_wizard.so
```

### 2. Usar pbx_ael ao invés de pbx_config

Converter o dialplan para AEL format em `/etc/asterisk/extensions.ael`:

```ael
context outbound-calls {
    _X. => {
        NoOp(Chamada de saída para ${EXTEN});
        Set(CALLERID(num)=${CALLERID(num)});
        Dial(PJSIP/1290#${EXTEN}@sip-trunk,60);
        Hangup();
    };
};

context from-trunk {
    _X. => {
        NoOp(Chamada recebida de ${CALLERID(num)});
        Answer();
        Playback(hello-world);
        Hangup();
    };
};
```

### 3. Verificar permissões dos arquivos
```bash
chown -R asterisk:asterisk /etc/asterisk/
chmod 640 /etc/asterisk/*.conf
```

### 4. Testar conectividade com o trunk
```bash
asterisk -rx "pjsip qualify sip-trunk-aor"
```

## Integração com o Sistema de IA

Para integrar com OpenRouter, Groq (TTS) e Eleven Labs (STT), você precisará:

### 1. Habilitar ARI (Asterisk REST Interface)

Editar `/etc/asterisk/ari.conf`:
```ini
[general]
enabled = yes
pretty = yes

[ligai]
type = user
read_only = no
password = senha_segura_aqui
```

### 2. Habilitar AMI (Asterisk Manager Interface)

Editar `/etc/asterisk/manager.conf`:
```ini
[general]
enabled = yes
port = 5038
bindaddr = 0.0.0.0

[ligai]
secret = senha_segura_aqui
deny = 0.0.0.0/0.0.0.0
permit = 127.0.0.1/255.255.255.0
read = all
write = all
```

### 3. Bibliotecas Node.js Recomendadas

```bash
npm install asterisk-manager  # Para AMI
npm install ari-client         # Para ARI
npm install @openrouter/ai     # Para OpenRouter
npm install groq-sdk           # Para Groq TTS
npm install elevenlabs-node    # Para Eleven Labs STT
```

### 4. Fluxo de Chamada Sugerido

1. **Originar Chamada** (via AMI):
   ```javascript
   manager.action({
     action: 'Originate',
     channel: 'Local/' + numero + '@outbound-calls',
     application: 'Stasis',
     appArgs: 'ligai-app'
   });
   ```

2. **Processar Áudio** (via ARI):
   - Capturar áudio da chamada
   - Enviar para Eleven Labs (STT)
   - Processar resposta com OpenRouter
   - Gerar áudio com Groq (TTS)
   - Reproduzir na chamada

## Arquivos de Referência

- `/etc/asterisk/pjsip.conf` - Configuração do trunk SIP
- `/etc/asterisk/extensions.conf` - Dialplan
- `/etc/asterisk/ari.conf` - Interface REST
- `/etc/asterisk/manager.conf` - Interface AMI
- `/var/log/asterisk/messages` - Logs principais

## Suporte e Documentação

- Wiki Oficial Asterisk: https://wiki.asterisk.org
- PJSIP Configuration: https://wiki.asterisk.org/wiki/x/EwFB
- ARI Documentation: https://wiki.asterisk.org/wiki/x/ewFRAQ
- AMI Events: https://wiki.asterisk.org/wiki/x/LgFRAQ
