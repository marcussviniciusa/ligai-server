/**
 * Call Manager - Gerencia o fluxo completo de chamadas com IA
 */

const AudioSocketServer = require('./audiosocket-server');
const GroqService = require('./services/groq-service');
const ElevenLabsService = require('./services/elevenlabs-service');
const OpenRouterService = require('./services/openrouter-service');
const fs = require('fs');
const path = require('path');

class CallManager {
  constructor(config) {
    this.config = config;

    // Inicializa serviços
    this.audioServer = new AudioSocketServer(
      config.audioSocket.host,
      config.audioSocket.port
    );

    this.groqService = new GroqService(config.groq.apiKey);
    this.elevenLabsService = new ElevenLabsService(config.elevenLabs.apiKey);
    this.openRouterService = new OpenRouterService(
      config.openRouter.apiKey,
      config.openRouter.model
    );

    // Estado das sessões
    this.sessions = new Map();

    // Carrega áudio pré-gravado da saudação
    this.greetingAudio = null;
    this.loadGreetingAudio();

    this.setupEventHandlers();
  }

  loadGreetingAudio() {
    try {
      const greetingPath = path.join(__dirname, '..', 'greeting.pcm');
      if (fs.existsSync(greetingPath)) {
        this.greetingAudio = fs.readFileSync(greetingPath);
        console.log(`✅ Áudio de saudação carregado: ${this.greetingAudio.length} bytes`);
      } else {
        console.log('⚠️  Arquivo greeting.pcm não encontrado');
      }
    } catch (error) {
      console.error('❌ Erro ao carregar áudio de saudação:', error.message);
    }
  }

  setupEventHandlers() {
    // Nova chamada iniciada
    this.audioServer.on('callStarted', (sessionId, session) => {
      console.log('\n📞 ============ NOVA CHAMADA ============');
      console.log('Session ID:', sessionId);

      // Inicializa estado da sessão
      this.sessions.set(sessionId, {
        audioBuffer: Buffer.alloc(0),
        lastSpeechTime: Date.now(),
        lastHighEnergyTime: null,
        isSpeaking: false,
        isProcessing: false,
        conversationStarted: false,
        isSendingGreeting: false,
        isSendingResponse: false
      });
    });

    // Handshake completado - pode enviar áudio
    this.audioServer.on('handshakeComplete', (sessionId) => {
      console.log('✅ Handshake completado - enviando saudação...');
      this.sendGreeting(sessionId);
    });

    // Frame de áudio recebido
    this.audioServer.on('audioFrame', (sessionId, frame) => {
      const session = this.sessions.get(sessionId);

      // Ignora áudio enquanto IA está falando (evita echo)
      if (session && (session.isSendingGreeting || session.isSendingResponse)) {
        return;
      }

      // Processa com IA
      this.handleAudioFrame(sessionId, frame);
    });

    // Chamada encerrada
    this.audioServer.on('callEnded', (sessionId) => {
      console.log('📞 ============ CHAMADA ENCERRADA ============');
      console.log('Session ID:', sessionId);

      // Limpa recursos
      this.openRouterService.resetConversation(sessionId);
      this.sessions.delete(sessionId);
    });
  }

  async handleAudioFrame(sessionId, frame) {
    const session = this.sessions.get(sessionId);
    if (!session || session.isProcessing) return;

    // Calcula energia do frame para detectar fala
    const energy = this.calculateAudioEnergy(frame);
    const SPEECH_ENERGY_THRESHOLD = 40; // Threshold para detectar fala
    const SILENCE_TOLERANCE_MS = 700;   // Continua capturando por 700ms após fala parar

    const now = Date.now();

    // Detecta se há fala neste frame
    const hasSpeech = energy > SPEECH_ENERGY_THRESHOLD;

    if (hasSpeech) {
      // Fala detectada - atualiza timestamp
      session.lastHighEnergyTime = now;
    }

    // Calcula há quanto tempo não detectamos fala
    const timeSinceHighEnergy = session.lastHighEnergyTime
      ? now - session.lastHighEnergyTime
      : Infinity;

    // Captura frame SE:
    // 1. Houver fala agora OU
    // 2. Detectamos fala recentemente (dentro da tolerância) E já estamos capturando
    const shouldCapture = hasSpeech ||
                          (session.lastHighEnergyTime &&
                           timeSinceHighEnergy < SILENCE_TOLERANCE_MS &&
                           session.audioBuffer.length > 0);

    if (shouldCapture) {
      session.audioBuffer = Buffer.concat([session.audioBuffer, frame]);
      session.lastSpeechTime = now;

      // Log para debug (a cada 200ms)
      if (session.audioBuffer.length % 3200 === 0) {
        console.log(`🎙️  Capturando... ${(session.audioBuffer.length / 16000).toFixed(1)}s (energia: ${energy.toFixed(1)})`);
      }
    }

    // Processa quando tiver 2-3 segundos de fala
    const PROCESS_THRESHOLD = 20000; // 2.5 segundos

    if (session.audioBuffer.length >= PROCESS_THRESHOLD) {
      await this.processAudio(sessionId);
    }

    // Timeout: se passou 1s desde última fala forte e tem algo no buffer, processa
    if (session.audioBuffer.length > 8000 && // Min 0.5s de fala
        timeSinceHighEnergy > 1000) {         // 1s de silêncio após fala
      console.log(`⏱️  Fim de fala detectado (${(session.audioBuffer.length / 16000).toFixed(1)}s) - processando...`);
      await this.processAudio(sessionId);
    }
  }

  calculateAudioEnergy(pcmBuffer) {
    // Calcula RMS (Root Mean Square) do áudio PCM 16-bit
    let sum = 0;
    for (let i = 0; i < pcmBuffer.length; i += 2) {
      // Lê sample de 16-bit little-endian
      const sample = pcmBuffer.readInt16LE(i);
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / (pcmBuffer.length / 2));
    return rms;
  }

  async processAudio(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.isProcessing) return;

    session.isProcessing = true;
    const audioToProcess = session.audioBuffer;
    session.audioBuffer = Buffer.alloc(0);

    // Removido envio de silêncio - deixa o Asterisk aguardar

    try {
      // Converte PCM para WAV
      const wavBuffer = this.pcmToWav(audioToProcess);

      // STT: Áudio → Texto (usando Groq Whisper)
      console.log('🎤 Transcrevendo áudio...');
      const userText = await this.groqService.speechToText(wavBuffer);

      if (!userText || userText.trim().length === 0) {
        console.log('⚠️  Nenhum texto detectado');
        session.isProcessing = false;
        return;
      }

      console.log('👤 Usuário disse:', userText);

      // IA: Texto → Resposta (usando OpenRouter)
      const aiResponse = await this.openRouterService.chat(sessionId, userText);

      // TTS: Resposta → Áudio (usando Eleven Labs)
      console.log('🗣️  Gerando resposta em áudio...');
      const responseAudio = await this.elevenLabsService.textToSpeech(aiResponse);

      // Envia áudio de volta para o Asterisk
      if (responseAudio.length > 0) {
        console.log('📡 Enviando áudio para Asterisk...');

        // Marca que está enviando resposta (ignora áudio recebido para evitar echo)
        session.isSendingResponse = true;

        this.audioServer.stopSilence(sessionId);
        await this.audioServer.sendAudio(sessionId, responseAudio);

        // Terminou de enviar resposta
        if (this.sessions.has(sessionId)) {
          session.isSendingResponse = false;
          // Limpa buffer para não processar áudio capturado durante resposta
          session.audioBuffer = Buffer.alloc(0);
          console.log('✅ Resposta enviada - aguardando cliente falar...');
        }
      }

    } catch (error) {
      console.error('❌ Erro ao processar áudio:', error.message);
      if (session) {
        session.isSendingResponse = false;
      }
    }

    session.isProcessing = false;
  }

  async sendGreeting(sessionId) {
    const session = this.sessions.get(sessionId);

    // Verifica se a sessão ainda existe
    if (!session) {
      console.log('⚠️  Sessão encerrada antes da saudação');
      return;
    }

    try {
      console.log('👋 Enviando saudação pré-gravada...');

      // Marca que está enviando saudação (para ignorar áudio recebido)
      session.isSendingGreeting = true;

      // Define prompt do sistema para vendas de precatórios
      this.openRouterService.setSystemPrompt(sessionId, `Você é um assistente de IA da Addebitare fazendo uma ligação para comprar precatórios.

Seu objetivo é:
- Confirmar se a pessoa tem precatórios para vender
- Qualificar o precatório (valor, tribunal, estado)
- Agendar uma proposta comercial
- Ser educado e profissional
- Fazer perguntas diretas e objetivas

Importante:
- Sempre responda em português do Brasil
- Mantenha as respostas curtas (máximo 30 palavras)
- Seja natural e conversacional
- Não use emojis ou símbolos especiais
- Se a pessoa disser que não tem precatórios, agradeça e encerre educadamente`);

      // Envia áudio pré-gravado imediatamente (em frames de 20ms)
      if (this.greetingAudio && this.sessions.has(sessionId)) {
        await this.audioServer.sendAudio(sessionId, this.greetingAudio);
        console.log('✅ Saudação completa enviada - aguardando resposta do cliente...');

        // Marca que terminou de enviar (agora pode processar áudio)
        if (this.sessions.has(sessionId)) {
          session.isSendingGreeting = false;
          // Limpa buffer de áudio que possa ter acumulado
          session.audioBuffer = Buffer.alloc(0);
        }
      } else if (!this.greetingAudio) {
        console.log('⚠️  Áudio de saudação não disponível');
        session.isSendingGreeting = false;
      }

    } catch (error) {
      console.error('❌ Erro ao enviar saudação:', error.message);
      if (session) {
        session.isSendingGreeting = false;
      }
    }
  }

  pcmToWav(pcmData) {
    const sampleRate = 8000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmData.length;

    const header = Buffer.alloc(44);

    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);

    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);

    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmData]);
  }

  start() {
    console.log('\n🚀 ============ LigAI Iniciando ============');
    console.log('📡 AudioSocket:', `${this.config.audioSocket.host}:${this.config.audioSocket.port}`);
    console.log('🤖 IA Model:', this.config.openRouter.model);
    console.log('==========================================\n');

    this.audioServer.start();
  }

  stop() {
    this.audioServer.stop();
    console.log('🛑 LigAI parado');
  }
}

module.exports = CallManager;
