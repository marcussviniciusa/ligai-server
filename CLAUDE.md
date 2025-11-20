# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LigAI is a real-time AI calling system that integrates Asterisk PBX with AI services to create intelligent phone conversations. The system uses AudioSocket protocol to stream bidirectional audio between Asterisk and a Node.js server, which orchestrates speech recognition (STT), AI conversation processing, and text-to-speech (TTS).

## Development Commands

### Starting the System

```bash
# Start the AudioSocket server (required for AI calls)
npm start

# Development mode with auto-reload
npm run dev
```

### Testing Calls

```bash
# Test call WITHOUT AI (verifies trunk connectivity)
asterisk -rx "channel originate Local/5584991516506@outbound-calls application Echo"

# Test call WITH AI (requires npm start running)
asterisk -rx "channel originate Local/5584991516506@outbound-calls-ai application Wait 30"

# Check active channels
asterisk -rx "core show channels"

# View dialplan configuration
asterisk -rx "dialplan show outbound-calls-ai"

# Check SIP trunk status
asterisk -rx "pjsip show endpoints"
```

### Monitoring and Debugging

```bash
# Monitor Asterisk logs in real-time
tail -f /var/log/asterisk/messages

# Check if AudioSocket server is listening
netstat -an | grep 9092

# Verify AudioSocket modules are loaded
asterisk -rx "module show like audiosocket"

# Reload Asterisk dialplan after changes
chown asterisk:asterisk /etc/asterisk/extensions.conf
asterisk -rx "module reload pbx_config.so"
```

## Architecture

### Complete System Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Asterisk PBX (Dialplan)                                         │
│    - Dial(PJSIP/1290#NUMBER@sip-trunk)  → Places outbound call     │
│    - U(audio-socket-handler)             → Executes after answer   │
│    - AudioSocket(UUID, 127.0.0.1:9092)   → Connects to Node.js     │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 2. AudioSocket Protocol (TCP on port 9092)                         │
│    - Asterisk sends UUID (0x01)          → Handshake               │
│    - Bidirectional audio frames (0x10)   → 320 bytes/20ms          │
│    - Format: [kind, size_hi, size_lo, payload]                     │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 3. Node.js AudioSocket Server (audiosocket-server.js)              │
│    - Receives UUID → emits 'handshakeComplete'                     │
│    - Receives audio frames → emits 'audioFrame'                    │
│    - Sends audio frames → writes to TCP socket                     │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 4. Call Manager (call-manager.js)                                  │
│    - On handshakeComplete: Sends pre-recorded greeting (greeting.pcm)│
│    - On audioFrame: Accumulates 2 seconds of audio → processes     │
│    - Ignores audio while speaking (isSendingGreeting/Response)     │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 5. AI Processing Pipeline                                          │
│                                                                     │
│  Client Audio (PCM) → Groq Whisper STT → Text                      │
│                              ↓                                      │
│                    OpenRouter (Claude 3.5 Sonnet)                  │
│                              ↓                                      │
│                        AI Response Text                             │
│                              ↓                                      │
│                    ElevenLabs TTS → Audio (MP3)                    │
│                              ↓                                      │
│                  ffmpeg converts to PCM 8kHz                        │
│                              ↓                                      │
│              Send back via AudioSocket to Asterisk                 │
│                              ↓                                      │
│                    Client hears AI response                         │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Components

**CallManager** (`src/call-manager.js`)
- Orchestrates the complete call flow
- Manages session state and audio buffering
- Coordinates between AudioSocket, STT, AI, and TTS services
- Accumulates audio frames into 2-second chunks before processing
- Protects against echo: ignores incoming audio while speaking (`isSendingGreeting`, `isSendingResponse`)
- Pre-loads greeting audio (`greeting.pcm`) for instant playback

**AudioSocketServer** (`src/audiosocket-server.js`)
- TCP server implementing Asterisk AudioSocket protocol (RFC compliant)
- **Passive handshake**: Waits for Asterisk to send UUID first
- Receives 323-byte messages: 3-byte header + 320-byte PCM payload
- Sends 323-byte messages: `[0x10, 0x01, 0x40, pcm(320)]`
- Emits events: `handshakeComplete`, `audioFrame`, `callEnded`, `dtmf`
- Properly handles HANGUP (0x00), UUID (0x01), AUDIO (0x10), DTMF (0x03), ERROR (0xFF)

**Service Layer** (`src/services/`)
- `groq-service.js`: Speech-to-text using Groq Whisper large-v3
- `elevenlabs-service.js`: Text-to-speech using ElevenLabs v2.x API
- `openrouter-service.js`: AI conversation using OpenAI-compatible API

### Audio Format Specifications

- **AudioSocket Protocol**: PCM 8kHz 16-bit mono (signed linear, little-endian)
- **Frame Size**: 320 bytes = 160 samples = 20ms of audio
- **Frame Format**: `[kind(1), size_hi(1), size_lo(1), pcm_data(320)] = 323 bytes total`
- **Processing Threshold**: 16,000 bytes (~2 seconds) before STT processing
- **Asterisk Codecs**: slin (signed linear) at 8kHz
- **TTS Output**: MP3 converted to PCM via ffmpeg

## Critical Implementation Details

### AudioSocket Protocol Specification

**Official Spec**: https://github.com/CyCoreSystems/audiosocket

**Message Types**:
- `0x00` - HANGUP: Terminate connection (3 bytes: 0x00 0x00 0x00)
- `0x01` - UUID: Session identifier (3-byte header + 16-byte UUID)
- `0x03` - DTMF: Touch-tone digit (3-byte header + 1 ASCII byte)
- `0x10` - AUDIO: PCM audio at 8kHz (3-byte header + 320 bytes)
- `0xFF` - ERROR: Error notification from Asterisk

**Message Format**: `[kind, size_hi, size_lo, payload...]`
- Header: 3 bytes (kind + 16-bit big-endian length)
- Payload: Variable length

**Handshake Flow** (CRITICAL):
1. **Client connects** to Asterisk AudioSocket (port 9092)
2. **Client DOES NOT send anything** - wait passively
3. **Asterisk sends UUID**: `[0x01, 0x00, 0x10, uuid(16 bytes)]`
4. **Client marks handshake complete** and can now send/receive audio
5. **Audio frames**: `[0x10, 0x01, 0x40, pcm(320 bytes)]` bidirectionally

**CRITICAL ERROR**: Sending `[0x00, 0x00, 0x10, ...]` as "handshake" is WRONG! This is a HANGUP command and causes "read ECONNRESET".

### AudioSocket Application Syntax

The correct Asterisk dialplan syntax:
```
AudioSocket(uuid,service)
```

**Example**:
```
exten => s,1,AudioSocket(550e8400-e29b-41d4-a716-446655440000,127.0.0.1:9092)
```

The first parameter is a UUID (for logging/tracking), second is the host:port.

### ElevenLabs API v2.x

The `@elevenlabs/elevenlabs-js` v2.24.1 uses a different API than v1.x:

**Incorrect (v1.x)**:
```javascript
const audio = await client.generate({ voice: voiceId, text: text });
```

**Correct (v2.x)**:
```javascript
const audioStream = await client.textToSpeech.convert(
  voiceId,  // First parameter
  { text: text, model_id: 'eleven_multilingual_v2' }  // Second parameter
);
```

### Session State Management

**AudioSocketServer session** (`audiosocket-server.js`):
- `socket`: TCP socket connection to Asterisk
- `slinBuffer`: Accumulates incoming bytes until full message received
- `handshakeComplete`: Flag set after UUID received from Asterisk
- `silenceInterval`: Timer for sending silence frames (if needed)
- `audioInterval`: Timer for sending audio in 20ms intervals (real-time)

**CallManager session** (`call-manager.js`):
- `audioBuffer`: Accumulated PCM frames before processing (resets after STT)
- `lastSpeechTime`: Timestamp for silence detection
- `isProcessing`: Prevents concurrent audio processing
- `isSendingGreeting`: Flag to ignore incoming audio while sending greeting
- `isSendingResponse`: Flag to ignore incoming audio while AI is speaking
- `conversationStarted`: Tracks if greeting was sent

The CallManager tracks sessions by `sessionId` format: `IP:PORT` (e.g., `127.0.0.1:39374`)

### Asterisk Configuration Requirements

**File Permissions**: All `/etc/asterisk/*.conf` files must be owned by `asterisk:asterisk` with mode 640:
```bash
chown asterisk:asterisk /etc/asterisk/*.conf
chmod 640 /etc/asterisk/*.conf
```

**Module Conflicts**: `pbx_lua.so` conflicts with `pbx_config.so`. Add to `/etc/asterisk/modules.conf`:
```
noload => pbx_lua.so
```

**Dialplan Contexts**:
- `outbound-calls-ai`: Routes calls through AudioSocket for AI processing
- `outbound-calls`: Direct SIP trunk calls without AI
- `from-trunk`: Handles incoming calls from SIP provider

## Environment Configuration

Required API keys in `.env`:
- `OPENROUTER_API_KEY`: AI conversation model (supports multiple providers)
- `GROQ_API_KEY`: Whisper speech-to-text
- `ELEVENLABS_API_KEY`: Text-to-speech voice synthesis

Optional configuration:
- `AI_MODEL`: Default `anthropic/claude-3.5-sonnet` (can use any OpenRouter model)
- `AI_TEMPERATURE`: Default `0.7`
- `AI_MAX_TOKENS`: Default `150` (keeps responses concise for phone calls)
- `AUDIOSOCKET_HOST`: Default `0.0.0.0`
- `AUDIOSOCKET_PORT`: Default `9092`

## SIP Trunk Configuration

Provider: IP-based authentication (no username/password)
- **IP**: 138.59.146.69
- **Tech Prefix**: 1290# (prepended to all dialed numbers)
- **Protocol**: PJSIP
- **Configured in**: `/etc/asterisk/pjsip.conf`

Format for outbound calls: `1290#<full_number_with_country_code>`

## Conversation Flow Timing (Working Implementation)

1. **Call Initiation** (~1-5s depending on carrier)
   ```
   asterisk -rx "channel originate Local/NUMBER@outbound-calls-ai application Wait 60"
   ```
   - Asterisk dials via PJSIP trunk (138.59.146.69)
   - Tech prefix 1290# prepended automatically
   - Client phone rings and answers

2. **AudioSocket Handshake** (<50ms)
   - Asterisk executes `U(audio-socket-handler)` after answer
   - `AudioSocket(UUID, 127.0.0.1:9092)` connects to Node.js server
   - Node.js awaits UUID passively (does NOT send first)
   - Asterisk sends: `[0x01, 0x00, 0x10, UUID(16 bytes)]`
   - Node.js emits `handshakeComplete` event
   - Log: "🔑 UUID da chamada recebido: 550e8400..."

3. **Greeting Playback** (~3.3 seconds)
   - Pre-recorded `greeting.pcm` loaded at startup (53,500 bytes)
   - Sent in 168 frames at 20ms intervals (real-time)
   - Client hears: "Olá, aqui é da addebitare, você tem precatórios para vender?"
   - `isSendingGreeting=true` during playback (ignores incoming audio)
   - Log: "✅ Saudação completa enviada - aguardando resposta do cliente..."

4. **Client Speaks** (variable duration)
   - Asterisk sends audio frames continuously: `[0x10, 0x01, 0x40, PCM(320)]`
   - Node.js accumulates frames in `audioBuffer`
   - When buffer reaches 16,000 bytes (~2 seconds), triggers processing
   - Silences (0x08 0x00 0x08...) and noise (0xf8 0xff...) are included

5. **AI Processing Pipeline** (~2-5 seconds total)
   - **STT** (500-1500ms): Groq Whisper large-v3 transcribes accumulated audio
   - **AI** (300-1000ms): OpenRouter (Claude 3.5 Sonnet) generates response
   - **TTS** (1000-3000ms): ElevenLabs converts text to MP3 → ffmpeg → PCM
   - `isProcessing=true` prevents concurrent processing

6. **AI Response Playback** (variable duration)
   - Audio sent in frames at 20ms intervals (real-time)
   - Example: 111,178 bytes = 348 frames = ~7 seconds of speech
   - `isSendingResponse=true` during playback (prevents echo)
   - Log: "✅ Resposta enviada - pronto para ouvir..."

7. **Conversation Loop**
   - Returns to step 4 (client speaks)
   - Continues until client hangs up or Asterisk timeout
   - Each exchange: listen (2s) → process (2-5s) → respond (variable)

## Common Issues and Solutions

### "read ECONNRESET" Error - CONNECTION RESET
**Symptoms**: Asterisk closes connection immediately, "❌ Erro no socket: read ECONNRESET"

**Root Cause**: Sending `[0x00, 0x00, 0x10, ...]` as handshake. This is a HANGUP command (0x00)!

**Solution**: DO NOT send anything on connection. Wait for Asterisk to send UUID first:
```javascript
// WRONG - sends hangup command:
const HANDSHAKE = Buffer.from([0x00, 0x00, 0x10, /* UUID */]);
socket.write(HANDSHAKE);

// CORRECT - wait passively:
socket.on('data', (data) => {
  // Asterisk sends UUID first: [0x01, 0x00, 0x10, UUID...]
  this.handleData(sessionId, data);
});
```

### "Failed to parse UUID" Error
The dialplan is using incorrect AudioSocket syntax. UUID must be first parameter.

### "this.client.generate is not a function"
ElevenLabs v2.x requires `client.textToSpeech.convert()` not `client.generate()`.

### "pbx_config declined to load"
Check file permissions on `/etc/asterisk/extensions.conf` and ensure `pbx_lua.so` is not loaded.

### AI Cannot Understand Client / "Nenhum texto detectado"
**Symptoms**: Whisper returns empty string, AI says "Desculpe, estou tendo dificuldade para entender"

**Root Cause**: Accumulating too much silence with speech. 3-second threshold captures mostly silence frames (`0x08 0x00...`).

**Solution**: Reduce threshold to 2 seconds (16,000 bytes) or implement VAD (Voice Activity Detection)

### Echo / AI Hears Itself
**Symptoms**: AI processes its own speech, responds to itself

**Root Cause**: Not ignoring incoming audio while AI is speaking

**Solution**: Use `isSendingResponse` flag:
```javascript
if (session.isSendingResponse) {
  return; // Ignore audio while speaking
}
```

### Audio Playback Too Fast / Protocol Violation
**Symptoms**: All audio sent at once, Asterisk disconnects

**Root Cause**: Sending all frames immediately instead of real-time

**Solution**: Use `setInterval` with 20ms delay:
```javascript
setInterval(() => {
  const frame = Buffer.alloc(323);
  frame[0] = 0x10;           // kind = audio
  frame[1] = 0x01;           // size_hi
  frame[2] = 0x40;           // size_lo = 320
  pcmData.copy(frame, 3);
  socket.write(frame);
}, 20); // Real-time: 20ms per frame
```

## AI Prompt Customization

The system prompt is set in `CallManager.sendGreeting()` and defines AI behavior. To customize for specific use cases (sales, support, etc.), modify the `setSystemPrompt()` call with appropriate instructions.

Key guidelines for phone AI:
- Keep responses under 30 words
- Use Brazilian Portuguese
- Avoid emojis and special characters
- Be conversational and natural
- Adapt to caller's tone

## Dependencies

External system requirements:
- Asterisk 18.10.0+ with AudioSocket modules
- ffmpeg (for MP3 to PCM audio conversion)
- Node.js 14+

NPM packages:
- `@elevenlabs/elevenlabs-js@^2.24.1`: TTS (note: v2.x API breaking changes)
- `groq-sdk@^0.36.0`: Whisper STT
- `openai@^6.9.1`: OpenRouter API client (OpenAI-compatible)
- `dotenv@^17.2.3`: Environment variable management
- `ws@^8.18.3`: WebSocket support (future use)
