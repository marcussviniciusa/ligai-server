/**
 * Call Manager - Gerencia o fluxo completo de chamadas com IA
 */

const AudioSocketServer = require('./audiosocket-server');
const GroqService = require('./services/groq-service');
const ElevenLabsService = require('./services/elevenlabs-service');
const OpenRouterService = require('./services/openrouter-service');

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

    this.setupEventHandlers();
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
        isSpeaking: false,
        isProcessing: false,
        conversationStarted: false
      });

      // Envia saudação inicial imediatamente
      this.sendGreeting(sessionId);
    });

    // Frame de áudio recebido
    this.audioServer.on('audioFrame', (sessionId, frame) => {
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

    // Acumula áudio
    session.audioBuffer = Buffer.concat([session.audioBuffer, frame]);
    session.lastSpeechTime = Date.now();

    // Processa a cada 3 segundos de áudio acumulado (24000 bytes @ 8kHz 16-bit)
    const PROCESS_THRESHOLD = 24000; // 3 segundos

    if (session.audioBuffer.length >= PROCESS_THRESHOLD) {
      await this.processAudio(sessionId);
    }
  }

  async processAudio(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.isProcessing) return;

    session.isProcessing = true;
    const audioToProcess = session.audioBuffer;
    session.audioBuffer = Buffer.alloc(0);

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
        this.audioServer.sendAudio(sessionId, responseAudio);
      }

    } catch (error) {
      console.error('❌ Erro ao processar áudio:', error.message);
    }

    session.isProcessing = false;
  }

  async sendGreeting(sessionId) {
    // Verifica se a sessão ainda existe
    if (!this.sessions.has(sessionId)) {
      console.log('⚠️  Sessão encerrada antes da saudação');
      return;
    }

    try {
      console.log('👋 Enviando saudação inicial...');

      const greeting = 'Olá! Tudo bem? Sou a assistente virtual da empresa. Como posso ajudar você hoje?';

      // Define prompt do sistema
      this.openRouterService.setSystemPrompt(sessionId, `Você é um assistente de IA amigável fazendo uma ligação telefônica.

Seu objetivo é:
- Ser educado e profissional
- Fazer perguntas diretas e objetivas
- Ouvir atentamente as respostas
- Não ser muito verboso (respostas curtas de 1-2 frases)
- Adaptar-se ao tom da conversa

Importante:
- Sempre responda em português do Brasil
- Mantenha as respostas curtas (máximo 30 palavras)
- Seja natural e conversacional
- Não use emojis ou símbolos especiais`);

      // Gera áudio da saudação
      const greetingAudio = await this.elevenLabsService.textToSpeech(greeting);

      // Verifica novamente se a sessão ainda existe antes de enviar
      if (greetingAudio.length > 0 && this.sessions.has(sessionId)) {
        this.audioServer.sendAudio(sessionId, greetingAudio);
        console.log('✅ Saudação enviada');
      } else if (!this.sessions.has(sessionId)) {
        console.log('⚠️  Sessão encerrada durante geração da saudação');
      }

    } catch (error) {
      console.error('❌ Erro ao enviar saudação:', error.message);
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
