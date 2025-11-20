/**
 * STT Service - Speech to Text usando Eleven Labs
 */

const { ElevenLabsClient } = require('elevenlabs');

class STTService {
  constructor(apiKey) {
    this.client = new ElevenLabsClient({ apiKey });
    this.audioBuffer = Buffer.alloc(0);
    this.isProcessing = false;
  }

  /**
   * Adiciona frame de áudio ao buffer
   * @param {Buffer} audioFrame - Frame de áudio PCM 8kHz 16-bit
   */
  addAudioFrame(audioFrame) {
    this.audioBuffer = Buffer.concat([this.audioBuffer, audioFrame]);
  }

  /**
   * Processa o áudio acumulado e retorna texto
   * @returns {Promise<string>} Texto transcrito
   */
  async processAudio() {
    if (this.audioBuffer.length === 0 || this.isProcessing) {
      return null;
    }

    this.isProcessing = true;
    const audioToProcess = this.audioBuffer;
    this.audioBuffer = Buffer.alloc(0);

    try {
      // Converte PCM 8kHz para formato WAV temporário
      const wavBuffer = this.pcmToWav(audioToProcess);

      // Eleven Labs Speech-to-Text
      // Nota: Eleven Labs não tem STT nativo, vamos usar Groq Whisper
      console.log('⚠️  Eleven Labs não suporta STT, usando Groq Whisper');

      const result = await this.transcribeWithWhisper(wavBuffer);

      this.isProcessing = false;
      return result;

    } catch (error) {
      console.error('❌ Erro no STT:', error.message);
      this.isProcessing = false;
      return null;
    }
  }

  /**
   * Converte PCM para WAV
   */
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

  /**
   * Transcribe usando Groq Whisper
   */
  async transcribeWithWhisper(wavBuffer) {
    // Implementação será feita no groq-service.js
    throw new Error('Use GroqService para STT');
  }

  reset() {
    this.audioBuffer = Buffer.alloc(0);
    this.isProcessing = false;
  }
}

module.exports = STTService;
