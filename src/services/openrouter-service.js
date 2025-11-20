/**
 * OpenRouter Service - IA/LLM para processar conversas
 */

const { OpenAI } = require('openai');

class OpenRouterService {
  constructor(apiKey, model = 'anthropic/claude-3.5-sonnet') {
    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://ligai.app',
        'X-Title': 'LigAI - Sistema de IA de Ligações'
      }
    });
    this.model = model;
    this.conversationHistory = new Map();
  }

  /**
   * Processa mensagem do usuário e retorna resposta da IA
   * @param {string} sessionId - ID da sessão
   * @param {string} userMessage - Mensagem do usuário
   * @param {object} systemPrompt - Prompt do sistema (opcional)
   * @returns {Promise<string>} Resposta da IA
   */
  async chat(sessionId, userMessage, systemPrompt = null) {
    try {
      // Inicializa histórico da conversa se não existir
      if (!this.conversationHistory.has(sessionId)) {
        const initialMessages = [];

        if (systemPrompt) {
          initialMessages.push({
            role: 'system',
            content: systemPrompt
          });
        } else {
          // Prompt padrão para vendas/atendimento
          initialMessages.push({
            role: 'system',
            content: `Você é um assistente de IA amigável fazendo uma ligação telefônica.

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
- Não use emojis ou símbolos especiais`
          });
        }

        this.conversationHistory.set(sessionId, initialMessages);
      }

      // Adiciona mensagem do usuário
      const history = this.conversationHistory.get(sessionId);
      history.push({
        role: 'user',
        content: userMessage
      });

      console.log('🤖 Processando com IA:', userMessage);

      // Chama OpenRouter
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: history,
        temperature: 0.7,
        max_tokens: 150,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      });

      const aiResponse = response.choices[0].message.content;

      // Adiciona resposta ao histórico
      history.push({
        role: 'assistant',
        content: aiResponse
      });

      // Limita histórico a últimas 10 mensagens
      if (history.length > 12) {
        // Mantém system prompt + últimas 10 mensagens
        const systemMsg = history[0];
        const recentMessages = history.slice(-10);
        this.conversationHistory.set(sessionId, [systemMsg, ...recentMessages]);
      }

      console.log('🤖 Resposta da IA:', aiResponse);
      return aiResponse;

    } catch (error) {
      console.error('❌ Erro no OpenRouter:', error.message);
      return 'Desculpe, estou tendo problemas técnicos. Pode repetir?';
    }
  }

  /**
   * Reset do histórico de conversa
   */
  resetConversation(sessionId) {
    this.conversationHistory.delete(sessionId);
    console.log('🔄 Histórico resetado para sessão:', sessionId);
  }

  /**
   * Define um prompt customizado para a sessão
   */
  setSystemPrompt(sessionId, promptText) {
    const messages = [{
      role: 'system',
      content: promptText
    }];
    this.conversationHistory.set(sessionId, messages);
  }
}

module.exports = OpenRouterService;
