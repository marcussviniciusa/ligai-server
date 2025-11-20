/**
 * Eleven Labs Service - Text-to-Speech
 */

const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');
const { Readable } = require('stream');

class ElevenLabsService {
  constructor(apiKey) {
    this.client = new ElevenLabsClient({ apiKey });
    this.voiceId = 'pNInz6obpgDQGcFmaJgB'; // Adam voice (Portuguese)
  }

  /**
   * Converte texto em fala
   * @param {string} text - Texto para converter
   * @returns {Promise<Buffer>} Áudio em formato PCM 8kHz 16-bit
   */
  async textToSpeech(text) {
    if (!text || text.trim().length === 0) {
      return Buffer.alloc(0);
    }

    try {
      console.log('🗣️  Gerando TTS:', text);

      // API v2.x: usa textToSpeech.convert()
      const audioStream = await this.client.textToSpeech.convert(
        this.voiceId,  // Primeiro parâmetro: voiceId
        {              // Segundo parâmetro: opções
          text: text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true
          }
        }
      );

      // Converte stream para buffer
      const chunks = [];
      for await (const chunk of audioStream) {
        chunks.push(chunk);
      }
      const mp3Buffer = Buffer.concat(chunks);

      // Converte MP3 para PCM 8kHz 16-bit
      const pcmBuffer = await this.convertToPCM(mp3Buffer);

      console.log('✅ TTS gerado:', pcmBuffer.length, 'bytes');
      return pcmBuffer;

    } catch (error) {
      console.error('❌ Erro no TTS:', error.message);
      return Buffer.alloc(0);
    }
  }

  /**
   * Converte MP3 para PCM 8kHz 16-bit (formato do AudioSocket)
   * @param {Buffer} mp3Buffer - Áudio em MP3
   * @returns {Promise<Buffer>} Áudio em PCM 8kHz 16-bit
   */
  async convertToPCM(mp3Buffer) {
    const { spawn } = require('child_process');
    const fs = require('fs');
    const path = require('path');

    return new Promise((resolve, reject) => {
      // Salva MP3 temporário
      const tempMp3 = path.join('/tmp', `tts-${Date.now()}.mp3`);
      const tempPcm = path.join('/tmp', `tts-${Date.now()}.pcm`);

      fs.writeFileSync(tempMp3, mp3Buffer);

      // Usa ffmpeg para converter
      const ffmpeg = spawn('ffmpeg', [
        '-i', tempMp3,
        '-f', 's16le',
        '-acodec', 'pcm_s16le',
        '-ar', '8000',
        '-ac', '1',
        tempPcm
      ]);

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          const pcmBuffer = fs.readFileSync(tempPcm);

          // Remove arquivos temporários
          fs.unlinkSync(tempMp3);
          fs.unlinkSync(tempPcm);

          resolve(pcmBuffer);
        } else {
          reject(new Error('Erro ao converter áudio'));
        }
      });

      ffmpeg.stderr.on('data', (data) => {
        // Log de debug do ffmpeg (opcional)
        // console.log('ffmpeg:', data.toString());
      });
    });
  }

  /**
   * Lista vozes disponíveis
   */
  async listVoices() {
    try {
      const voices = await this.client.voices.getAll();
      return voices.voices;
    } catch (error) {
      console.error('❌ Erro ao listar vozes:', error.message);
      return [];
    }
  }
}

module.exports = ElevenLabsService;
