/**
 * AudioSocket Server - Recebe áudio do Asterisk em tempo real
 * Protocolo: TCP com frames de 320 bytes (20ms de áudio PCM 8kHz 16-bit)
 */

const net = require('net');
const { EventEmitter } = require('events');

// AudioSocket Protocol Constants
// Baseado em: https://github.com/CyCoreSystems/audiosocket
const KIND_HANGUP = 0x00;    // Terminate connection
const KIND_UUID = 0x01;       // UUID identifier (16 bytes)
const KIND_DTMF = 0x03;       // DTMF digit (1 ASCII byte)
const KIND_AUDIO = 0x10;      // PCM audio 8kHz (320 bytes)
const KIND_ERROR = 0xFF;      // Error notification

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
        callId: null,
        silenceInterval: null,
        audioInterval: null,
        handshakeComplete: false
      };

      this.sessions.set(sessionId, session);

      // NÃO enviamos nada! Aguardamos o Asterisk enviar o UUID primeiro
      console.log('🤝 Aguardando UUID do Asterisk...');

      socket.on('data', (data) => {
        console.log(`📥 Recebido ${data.length} bytes de dados:`, data.toString('hex').substring(0, 60));
        this.handleData(sessionId, data);
      });

      socket.on('end', () => {
        console.log('📞 Conexão encerrada:', sessionId);
        const sess = this.sessions.get(sessionId);
        if (sess) {
          if (sess.silenceInterval) clearInterval(sess.silenceInterval);
          if (sess.audioInterval) clearInterval(sess.audioInterval);
        }
        this.emit('callEnded', sessionId);
        this.sessions.delete(sessionId);
      });

      socket.on('error', (err) => {
        console.error('❌ Erro no socket:', err.message);
        const sess = this.sessions.get(sessionId);
        if (sess) {
          if (sess.silenceInterval) clearInterval(sess.silenceInterval);
          if (sess.audioInterval) clearInterval(sess.audioInterval);
        }
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
    if (!session) {
      console.log('⚠️  Sessão não encontrada para handleData:', sessionId);
      return;
    }

    // Adiciona ao buffer
    session.slinBuffer = Buffer.concat([session.slinBuffer, data]);

    // Processa mensagens do protocolo AudioSocket
    while (session.slinBuffer.length >= 3) {
      // Lê cabeçalho (3 bytes)
      const kind = session.slinBuffer[0];
      const sizeHi = session.slinBuffer[1];
      const sizeLo = session.slinBuffer[2];
      const payloadSize = (sizeHi << 8) | sizeLo;

      // Verifica se temos a mensagem completa
      if (session.slinBuffer.length < 3 + payloadSize) {
        break; // Aguarda mais dados
      }

      // Extrai payload
      const payload = session.slinBuffer.slice(3, 3 + payloadSize);
      session.slinBuffer = session.slinBuffer.slice(3 + payloadSize);

      // Processa baseado no tipo
      if (kind === KIND_UUID) {
        // UUID de resposta do Asterisk
        const uuid = payload.toString('hex');
        console.log('🔑 UUID da chamada recebido:', uuid);
        session.handshakeComplete = true;

        // Emite evento indicando que pode começar a enviar áudio
        this.emit('handshakeComplete', sessionId);

      } else if (kind === KIND_AUDIO) {
        // Frame de áudio - só processa se handshake completo
        if (session.handshakeComplete) {
          this.emit('audioFrame', sessionId, payload);
        }
      } else if (kind === KIND_HANGUP) {
        // Asterisk está encerrando a conexão
        console.log('☎️  Asterisk enviou HANGUP');
        this.endCall(sessionId);
      } else if (kind === KIND_DTMF) {
        // DTMF digit
        const digit = String.fromCharCode(payload[0]);
        console.log(`📞 DTMF recebido: ${digit}`);
        this.emit('dtmf', sessionId, digit);
      } else if (kind === KIND_ERROR) {
        // Error from Asterisk
        const errorCode = payload.length > 0 ? payload[0] : 0;
        console.log(`❌ Asterisk enviou erro: 0x${errorCode.toString(16)}`);
      } else {
        console.log(`⚠️  Tipo de mensagem desconhecido: 0x${kind.toString(16)}`);
      }
    }
  }

  sendAudio(sessionId, audioData) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.socket) {
      console.error('❌ Sessão não encontrada:', sessionId);
      return Promise.reject(new Error('Sessão não encontrada'));
    }

    if (!session.handshakeComplete) {
      console.log('⚠️  Aguardando handshake completar antes de enviar áudio...');
      return Promise.reject(new Error('Handshake não completado'));
    }

    // Para qualquer envio anterior
    this.stopAudioSending(sessionId);

    const FRAME_SIZE = 320; // 20ms de áudio PCM
    const totalFrames = Math.ceil(audioData.length / FRAME_SIZE);

    console.log(`📤 Enviando ${audioData.length} bytes de áudio (${totalFrames} frames em tempo real)...`);

    return new Promise((resolve, reject) => {
      let frameIndex = 0;

      const intervalId = setInterval(() => {
        const currentSession = this.sessions.get(sessionId);

        if (!currentSession || !currentSession.socket) {
          clearInterval(intervalId);
          if (currentSession) {
            currentSession.audioInterval = null;
          }
          reject(new Error('Sessão encerrada durante envio'));
          return;
        }

        if (frameIndex >= totalFrames) {
          clearInterval(intervalId);
          if (currentSession) {
            currentSession.audioInterval = null;
          }
          console.log(`✅ Áudio completo enviado (${frameIndex} frames)`);
          resolve();
          return;
        }

        try {
          const start = frameIndex * FRAME_SIZE;
          const end = Math.min(start + FRAME_SIZE, audioData.length);
          let frame = audioData.slice(start, end);

          // Se o último frame for menor que 320 bytes, completa com zeros
          if (frame.length < FRAME_SIZE) {
            const paddedFrame = Buffer.alloc(FRAME_SIZE, 0);
            frame.copy(paddedFrame);
            frame = paddedFrame;
          }

          // Cria mensagem AudioSocket com cabeçalho
          const message = Buffer.alloc(3 + FRAME_SIZE);
          message[0] = KIND_AUDIO;           // kind = audio
          message[1] = (FRAME_SIZE >> 8) & 0xFF;  // size high byte (0x01)
          message[2] = FRAME_SIZE & 0xFF;         // size low byte (0x40)
          frame.copy(message, 3);

          currentSession.socket.write(message);
          frameIndex++;
        } catch (err) {
          console.error('❌ Erro ao enviar frame de áudio:', err.message);
          clearInterval(intervalId);
          if (currentSession) {
            currentSession.audioInterval = null;
          }
          reject(err);
        }
      }, 20); // Envia um frame a cada 20ms (tempo real)

      // Salva o intervalId na sessão para poder cancelar se necessário
      session.audioInterval = intervalId;
    });
  }

  stopAudioSending(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session && session.audioInterval) {
      clearInterval(session.audioInterval);
      session.audioInterval = null;
      console.log('🛑 Envio de áudio interrompido');
    }
  }

  sendSilence(sessionId, durationMs = 1000) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.socket) {
      return;
    }

    // Para qualquer silêncio anterior
    this.stopSilence(sessionId);

    // 8kHz 16-bit = 16000 bytes por segundo
    // 320 bytes = 20ms de áudio
    const framesNeeded = Math.floor(durationMs / 20);
    const silenceFrame = Buffer.alloc(320, 0); // Frame de silêncio

    console.log(`🔇 Iniciando envio de ${durationMs}ms de silêncio em tempo real...`);

    let frameCount = 0;
    const intervalId = setInterval(() => {
      const currentSession = this.sessions.get(sessionId);

      if (!currentSession || !currentSession.socket || frameCount >= framesNeeded) {
        clearInterval(intervalId);
        if (currentSession) {
          currentSession.silenceInterval = null;
        }
        if (frameCount >= framesNeeded) {
          console.log(`✅ Silêncio completo enviado (${frameCount} frames)`);
        }
        return;
      }

      try {
        currentSession.socket.write(silenceFrame);
        frameCount++;
      } catch (err) {
        console.error('❌ Erro ao enviar silêncio:', err.message);
        clearInterval(intervalId);
        if (currentSession) {
          currentSession.silenceInterval = null;
        }
      }
    }, 20); // Envia um frame a cada 20ms (tempo real)

    // Salva o intervalId na sessão para poder cancelar se necessário
    session.silenceInterval = intervalId;
  }

  stopSilence(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session && session.silenceInterval) {
      clearInterval(session.silenceInterval);
      session.silenceInterval = null;
      console.log('🛑 Envio de silêncio interrompido');
    }
  }

  endCall(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Limpa intervals se existirem
      if (session.silenceInterval) clearInterval(session.silenceInterval);
      if (session.audioInterval) clearInterval(session.audioInterval);
      if (session.socket) {
        session.socket.end();
      }
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
