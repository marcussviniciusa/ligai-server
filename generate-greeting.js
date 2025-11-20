/**
 * Script para gerar nova saudação pré-gravada
 *
 * Uso:
 * 1. Edite a variável TEXTO_SAUDACAO abaixo
 * 2. Execute: node generate-greeting.js
 * 3. Reinicie o servidor (npm start)
 */

require('dotenv').config();
const ElevenLabsService = require('./src/services/elevenlabs-service');
const fs = require('fs');

// ===== EDITE AQUI A MENSAGEM DE SAUDAÇÃO =====
const TEXTO_SAUDACAO = 'Olá, aqui é da addebitare, você tem precatórios para vender?';
// =============================================

async function gerarSaudacao() {
  console.log('🎙️  Gerando nova saudação...');
  console.log('📝 Texto:', TEXTO_SAUDACAO);
  console.log('');

  // Valida API key
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('❌ ELEVENLABS_API_KEY não encontrada no .env');
    process.exit(1);
  }

  try {
    // Cria serviço ElevenLabs
    const service = new ElevenLabsService(
      process.env.ELEVENLABS_API_KEY,
      process.env.ELEVENLABS_VOICE_ID,
      process.env.ELEVENLABS_MODEL
    );

    // Gera áudio
    const audio = await service.textToSpeech(TEXTO_SAUDACAO);

    if (audio.length === 0) {
      console.error('❌ Falha ao gerar áudio');
      process.exit(1);
    }

    // Salva arquivo
    fs.writeFileSync('greeting.pcm', audio);

    console.log('');
    console.log('✅ Nova saudação gerada com sucesso!');
    console.log(`📦 Tamanho: ${audio.length} bytes (${(audio.length / 16000).toFixed(1)}s)`);
    console.log('');
    console.log('🔄 Reinicie o servidor para aplicar:');
    console.log('   npm start');

  } catch (error) {
    console.error('❌ Erro ao gerar saudação:', error.message);
    process.exit(1);
  }
}

gerarSaudacao();
