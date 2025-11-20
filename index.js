/**
 * LigAI - Sistema de IA de Ligações em Tempo Real
 *
 * Arquitetura:
 * Asterisk → AudioSocket → Node.js → Groq (STT) → OpenRouter (IA) → Eleven Labs (TTS) → Asterisk
 */

require('dotenv').config();
const CallManager = require('./src/call-manager');

// Configuração
const config = {
  audioSocket: {
    host: process.env.AUDIOSOCKET_HOST || '0.0.0.0',
    port: parseInt(process.env.AUDIOSOCKET_PORT) || 9092
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY
  },
  elevenLabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    voiceId: process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB', // Adam (default)
    modelId: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2'  // Multilingual v2 (default)
  },
  openRouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.AI_MODEL || 'anthropic/claude-3.5-sonnet'
  }
};

// Valida configuração
function validateConfig() {
  const required = [
    'GROQ_API_KEY',
    'ELEVENLABS_API_KEY',
    'OPENROUTER_API_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Variáveis de ambiente faltando:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\n💡 Copie .env.example para .env e preencha as chaves de API');
    process.exit(1);
  }
}

// Verifica se ffmpeg está instalado
function checkFFmpeg() {
  const { execSync } = require('child_process');
  try {
    execSync('which ffmpeg', { stdio: 'ignore' });
  } catch (error) {
    console.error('❌ ffmpeg não encontrado!');
    console.error('💡 Instale com: sudo apt-get install -y ffmpeg');
    process.exit(1);
  }
}

// Inicializa sistema
async function main() {
  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║              🤖  LigAI - Sistema de IA                    ║
  ║           Sistema de Ligações com IA em Tempo Real       ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
  `);

  validateConfig();
  checkFFmpeg();

  const callManager = new CallManager(config);
  callManager.start();

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Encerrando LigAI...');
    callManager.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n\n🛑 Encerrando LigAI...');
    callManager.stop();
    process.exit(0);
  });
}

// Tratamento de erros
process.on('unhandledRejection', (error) => {
  console.error('❌ Erro não tratado:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Exceção não capturada:', error);
  process.exit(1);
});

// Inicia
main().catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
