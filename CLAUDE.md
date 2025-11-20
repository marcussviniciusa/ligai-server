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

### Audio Flow Pipeline

```
Client Phone → Asterisk → AudioSocket (TCP) → Node.js Server
                                                    ↓
                                    ┌──────────────┴──────────────┐
                                    ↓                             ↓
                            Incoming Audio                 Outgoing Audio
                                    ↓                             ↑
                            Groq Whisper STT              ElevenLabs TTS
                                    ↓                             ↑
                            OpenRouter AI Chat ────────────────────┘
```

### Key Components

**CallManager** (`src/call-manager.js`)
- Orchestrates the complete call flow
- Manages session state and audio buffering
- Coordinates between AudioSocket, STT, AI, and TTS services
- Accumulates audio frames into 3-second chunks before processing

**AudioSocketServer** (`src/audiosocket-server.js`)
- TCP server implementing Asterisk AudioSocket protocol
- Receives/sends 320-byte PCM frames (20ms audio @ 8kHz 16-bit mono)
- Emits events: `callStarted`, `audioFrame`, `callEnded`
- Handles UUID handshake with Asterisk

**Service Layer** (`src/services/`)
- `groq-service.js`: Speech-to-text using Groq Whisper large-v3
- `elevenlabs-service.js`: Text-to-speech using ElevenLabs v2.x API
- `openrouter-service.js`: AI conversation using OpenAI-compatible API

### Audio Format Specifications

- **AudioSocket Protocol**: PCM 8kHz 16-bit mono, 320-byte frames (20ms)
- **Processing Threshold**: 24,000 bytes (~3 seconds) before STT processing
- **Asterisk Codecs**: ulaw, alaw, gsm
- **TTS Output**: MP3 converted to PCM via ffmpeg

## Critical Implementation Details

### AudioSocket Application Syntax

The correct Asterisk dialplan syntax for AudioSocket is:
```
AudioSocket(uuid,service)
```

**Incorrect**: `AudioSocket(127.0.0.1:9092,${UNIQUEID})`
**Correct**: `AudioSocket(550e8400-e29b-41d4-a716-446655440000,127.0.0.1:9092)`

The first parameter must be a valid UUID string, the second is the host:port.

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

Each call session maintains:
- `audioBuffer`: Accumulated PCM frames before processing
- `lastSpeechTime`: Timestamp for silence detection
- `isProcessing`: Prevents concurrent audio processing
- `conversationStarted`: Tracks if greeting was sent

The CallManager tracks sessions by `sessionId` format: `IP:PORT` (e.g., `127.0.0.1:46000`)

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

## Conversation Flow Timing

1. **Call Setup**: Asterisk dials number → PJSIP trunk → client answers
2. **AudioSocket Connection**: Immediate after answer, AudioSocket handshake occurs
3. **Greeting**: Sent immediately upon connection (no delay)
4. **Audio Accumulation**: Waits for 3 seconds of audio (24,000 bytes)
5. **Processing**: STT → AI → TTS pipeline (~300-700ms total latency)
6. **Response**: Audio sent back via AudioSocket frames

## Common Issues and Solutions

### "Failed to parse UUID" Error
The dialplan is using incorrect AudioSocket syntax. UUID must be first parameter.

### "this.client.generate is not a function"
ElevenLabs v2.x requires `client.textToSpeech.convert()` not `client.generate()`.

### "pbx_config declined to load"
Check file permissions on `/etc/asterisk/extensions.conf` and ensure `pbx_lua.so` is not loaded.

### Session Ends Before Greeting
The greeting was being sent with a delay. It should be immediate upon `callStarted` event.

### Echo/Hearing Own Voice
Using `application Echo` in the originate command reflects audio back. Use `application Wait 30` or `application Milliwatt` for testing.

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
