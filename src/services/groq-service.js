/**
 * Groq Service - STT (Whisper) e TTS
 */

const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

class GroqService {
  constructor(apiKey) {
    this.client = new Groq({ apiKey });
  }

  /**
   * Speech-to-Text usando Whisper
   * @param {Buffer} wavBuffer - Áudio em formato WAV
   * @returns {Promise<string>} Texto transcrito
   */
  async speechToText(wavBuffer) {
    try {
      // Salva temporariamente o WAV
      const tempFile = path.join('/tmp', `audio-${Date.now()}.wav`);
      fs.writeFileSync(tempFile, wavBuffer);

      const transcription = await this.client.audio.transcriptions.create({
        file: fs.createReadStream(tempFile),
        model: 'whisper-large-v3',
        language: 'pt',
        response_format: 'json'
      });

      // Remove arquivo temporário
      fs.unlinkSync(tempFile);

      console.log('🎤 Transcrito:', transcription.text);
      return transcription.text;

    } catch (error) {
      console.error('❌ Erro no Whisper STT:', error.message);
      return null;
    }
  }

  /**
   * Text-to-Speech usando Groq
   * Nota: Groq não tem TTS nativo, vamos usar Eleven Labs para TTS
   * @param {string} text - Texto para converter em fala
   * @returns {Promise<Buffer>} Áudio em formato PCM
   */
  async textToSpeech(text) {
    console.log('⚠️  Groq não suporta TTS, use ElevenLabsService');
    throw new Error('Use ElevenLabsService para TTS');
  }
}

module.exports = GroqService;
