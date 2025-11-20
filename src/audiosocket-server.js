/**
 * AudioSocket Server - Recebe áudio do Asterisk em tempo real
 * Protocolo: TCP com frames de 320 bytes (20ms de áudio PCM 8kHz 16-bit)
 */

const net = require('net');
const { EventEmitter } = require('events');

// AudioSocket Protocol UUIDs
const AUDIOSOCKET_UUID = Buffer.from([
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

class AudioSocketServer extends EventEmitter {
  constructor(host = '0.0.0.0', port = 9092) {
    super();
    this.host = host;
    this.port = port;
    this.server = null;
    this.sessions = new Map();
  }

  start() {
    this.server = net.createServer((socket) => {
      console.log('📞 Nova conexão AudioSocket:', socket.remoteAddress);

      const sessionId = `${socket.remoteAddress}:${socket.remotePort}`;
      const session = {
        socket,
        audioBuffer: Buffer.alloc(0),
        slinBuffer: Buffer.alloc(0),
        callId: null
      };

      this.sessions.set(sessionId, session);

      // Envia handshake UUID
      socket.write(AUDIOSOCKET_UUID);

      socket.on('data', (data) => {
        this.handleData(sessionId, data);
      });

      socket.on('end', () => {
        console.log('📞 Conexão encerrada:', sessionId);
        this.emit('callEnded', sessionId);
        this.sessions.delete(sessionId);
      });

      socket.on('error', (err) => {
        console.error('❌ Erro no socket:', err.message);
        this.sessions.delete(sessionId);
      });

      this.emit('callStarted', sessionId, session);
    });

    this.server.listen(this.port, this.host, () => {
      console.log(`🎧 AudioSocket Server rodando em ${this.host}:${this.port}`);
    });
  }

  handleData(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Adiciona ao buffer
    session.slinBuffer = Buffer.concat([session.slinBuffer, data]);

    // Processa frames de 320 bytes (20ms de áudio)
    const FRAME_SIZE = 320;

    while (session.slinBuffer.length >= FRAME_SIZE) {
      const frame = session.slinBuffer.slice(0, FRAME_SIZE);
      session.slinBuffer = session.slinBuffer.slice(FRAME_SIZE);

      // Emite frame de áudio para processamento
      this.emit('audioFrame', sessionId, frame);
    }
  }

  sendAudio(sessionId, audioData) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.socket) {
      console.error('❌ Sessão não encontrada:', sessionId);
      return;
    }

    try {
      // AudioSocket espera PCM 8kHz 16-bit em frames de 320 bytes
      session.socket.write(audioData);
    } catch (err) {
      console.error('❌ Erro ao enviar áudio:', err.message);
    }
  }

  endCall(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session && session.socket) {
      session.socket.end();
      this.sessions.delete(sessionId);
    }
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('🛑 AudioSocket Server parado');
    }
  }
}

module.exports = AudioSocketServer;
