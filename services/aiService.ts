
import { GoogleGenAI } from "@google/genai";
import { Message, ModelProvider, Chat } from '../types';

const MAX_HISTORY_MESSAGES = 40;
const MAX_HISTORY_CHARS = 12000;

/**
 * Подготавливает историю сообщений для разных провайдеров.
 * Для DeepSeek/OpenAI реализует строгую логику чередования ролей без "костыльных" сообщений.
 */
function mapHistory(history: Message[], provider: ModelProvider) {
  if (history.length === 0) return [];

  // 1. Предварительная фильтрация и обрезка
  const chatMessages = history.filter(m => m.sender !== 'system');
  let recent = chatMessages.slice(-MAX_HISTORY_MESSAGES);
  
  let totalChars = 0;
  let finalMessages: Message[] = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i];
    if (totalChars + msg.text.length > MAX_HISTORY_CHARS && finalMessages.length > 0) break;
    totalChars += msg.text.length;
    finalMessages.unshift(msg);
  }

  // 2. Базовое маппирование с сохранением авторства через теги
  const mapped = finalMessages.map(msg => {
    const authorLabel = msg.authorName || (msg.sender === 'user' ? 'User' : 'Assistant');
    const role = provider === 'gemini' 
      ? (msg.sender === 'user' ? 'user' : 'model') 
      : (msg.sender === 'user' ? 'user' : 'assistant');
    
    return {
      role,
      content: `--- SOURCE: ${authorLabel.toUpperCase()} ---\n${msg.text.trim()}\n--- END ${authorLabel.toUpperCase()} ---`
    };
  });

  // 3. Обработка для DeepSeek и OpenAI (Строгое чередование)
  if (provider !== 'gemini') {
    let strictHistory: { role: 'user' | 'assistant'; content: string }[] = [];
    
    // Сначала просто склеиваем идущие подряд одинаковые роли
    mapped.forEach((m) => {
      const currentRole = m.role as 'user' | 'assistant';
      if (strictHistory.length > 0 && strictHistory[strictHistory.length - 1].role === currentRole) {
        strictHistory[strictHistory.length - 1].content += "\n\n" + m.content;
      } else {
        strictHistory.push({ role: currentRole, content: m.content });
      }
    });

    // ПРАВИЛО 1: Должно начинаться с 'user'
    if (strictHistory.length > 0 && strictHistory[0].role === 'assistant') {
      const first = strictHistory.shift()!;
      strictHistory.unshift({ 
        role: 'user', 
        content: `[PREVIOUS CONTEXT]:\n${first.content}` 
      });
    }

    // ПРАВИЛО 2: DeepSeek требует, чтобы история ЗАКАНЧИВАЛАСЬ на 'user'.
    // Если в истории последним ответил другой ИИ (assistant), мы вливаем его ответ 
    // в предыдущий user-блок как часть контекста, чтобы не плодить "костыльные" сообщения.
    if (strictHistory.length > 1 && strictHistory[strictHistory.length - 1].role === 'assistant') {
      const lastAssistantTurn = strictHistory.pop()!;
      // Вливаем в предыдущий user-блок
      strictHistory[strictHistory.length - 1].content += `\n\n[FOLLOW-UP RESPONSE]:\n${lastAssistantTurn.content}`;
    } else if (strictHistory.length === 1 && strictHistory[0].role === 'assistant') {
        // Если вообще всего одно сообщение и оно от ассистента (подмена роли)
        const onlyMsg = strictHistory.pop()!;
        strictHistory.push({ role: 'user', content: `[DIALOGUE CONTEXT]:\n${onlyMsg.content}` });
    }

    return strictHistory;
  }

  // 4. Обработка для Gemini
  const geminiHistory: any[] = [];
  mapped.forEach(m => {
    if (geminiHistory.length > 0 && geminiHistory[geminiHistory.length - 1].role === m.role) {
      geminiHistory[geminiHistory.length - 1].content += "\n\n" + m.content;
    } else {
      geminiHistory.push(m);
    }
  });

  return geminiHistory;
}

/**
 * Очистка ответа от технических тегов протокола SOURCE/END
 */
function cleanResponse(text: string): string {
  if (!text) return "";
  return text
    .replace(/^-+\s*SOURCE:.*?-+\s*$/gim, "")
    .replace(/^-+\s*END.*?-+\s*$/gim, "")
    .trim();
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function getAIResponse(
  provider: ModelProvider,
  modelName: string,
  systemPrompt: string,
  history: Message[],
  apiKey: string,
  temperature: number = 0.7,
  retryCount: number = 0
): Promise<string> {
  const safeTemperature = Math.min(Math.max(temperature, 0), 1.2);
  let rawText = "No response.";
  
  if (provider === 'gemini') {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    const normalizedHistory = mapHistory(history, 'gemini');
    const contents = normalizedHistory.map((h) => ({
      role: h.role,
      parts: [{ text: h.content }]
    }));

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: safeTemperature,
          ...(modelName.includes('pro') ? { thinkingConfig: { thinkingBudget: 32768 } } : {})
        }
      });
      rawText = response.text || "No response.";
    } catch (e: any) {
      throw new Error(`Gemini: ${e.message}`);
    }
  } else {
    if (!apiKey) throw new Error(`API Key missing for ${provider.toUpperCase()}`);

    const normalizedHistory = mapHistory(history, provider);
    const baseUrl = provider === 'openai' 
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://api.deepseek.com/chat/completions';

    const messages = [
        { role: 'system', content: systemPrompt || "You are a helpful assistant." },
        ...normalizedHistory.map((h) => ({
          role: h.role as string,
          content: h.content
        }))
    ];

    try {
        const payload: any = {
          model: modelName,
          messages: messages,
          max_tokens: 2048 
        };

        if (modelName !== 'deepseek-reasoner') {
          payload.temperature = safeTemperature;
        }

        const res = await fetch(baseUrl, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        
        if (!res.ok) {
            if (res.status === 401) {
              throw new Error(`${provider.toUpperCase()}: Authentication Failed. Check API Key.`);
            }
            
            const message = data.error?.message || `Error ${res.status}`;
            if (res.status === 429 && retryCount < 1) {
                await sleep(2000); 
                return getAIResponse(provider, modelName, systemPrompt, history, apiKey, temperature, retryCount + 1);
            }
            throw new Error(`${provider.toUpperCase()}: ${message}`);
        }

        rawText = data.choices?.[0]?.message?.content || "No content.";
    } catch (error: any) {
        console.error(`AI Request Failure (${provider}):`, error);
        throw error;
    }
  }

  return cleanResponse(rawText);
}

export async function discoverRemoteOccultPersonas(settings: { openaiKey: string; deepseekKey: string; }): Promise<Partial<Chat>[]> {
  const found: Partial<Chat>[] = [];

  if (settings.openaiKey) {
    const headers = {
      'Authorization': `Bearer ${settings.openaiKey}`,
      'OpenAI-Beta': 'assistants=v2',
      'Content-Type': 'application/json'
    };

    try {
      const resAs = await fetch('https://api.openai.com/v1/assistants?limit=100', { headers });
      if (resAs.ok) {
        const data = await resAs.json();
        data.data.forEach((as: any) => {
          found.push({
            id: as.id,
            name: as.name || "Cloud Assistant",
            systemPrompt: as.instructions || "No instructions provided.",
            provider: 'openai',
            modelName: as.model,
            tags: ['#synced', 'assistant'],
            avatar: ''
          });
        });
      }
    } catch (e) {
      console.warn("OpenAI scan partially failed:", e);
    }
  }

  if (settings.deepseekKey) {
    found.push({
      id: `ds-v3-discovery`,
      name: "DeepSeek Assistant",
      systemPrompt: "You are a helpful and efficient assistant powered by DeepSeek.",
      provider: "deepseek",
      modelName: "deepseek-chat",
      tags: ["#synced", "deepseek"],
      avatar: ""
    });
  }

  if (process.env.API_KEY) {
    found.push({
      id: `gem-discovery`,
      name: "Gemini Pro Assistant",
      systemPrompt: "You are a helpful and capable assistant powered by Google Gemini.",
      provider: "gemini",
      modelName: "gemini-3-pro-preview",
      tags: ["#synced", "gemini"],
      avatar: ""
    });
  }

  return found;
}

export async function deleteRemoteAssistant(
  assistantId: string,
  apiKey: string
): Promise<boolean> {
  if (!assistantId.startsWith('as-')) return false;

  try {
    const res = await fetch(`https://api.openai.com/v1/assistants/${assistantId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });
    return res.ok;
  } catch (e) {
    console.error("Failed to delete remote assistant:", e);
    return false;
  }
}

export async function createRemoteAssistant(
  provider: ModelProvider,
  name: string,
  instructions: string,
  model: string,
  apiKey: string
): Promise<{ id: string } | { error: string }> {
  if (provider !== 'openai') return { error: "Remote creation only supported for OpenAI." };

  try {
    const res = await fetch('https://api.openai.com/v1/assistants', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        name: name,
        instructions: instructions,
        model: model
      })
    });

    const data = await res.json();
    if (res.ok) {
      return { id: data.id };
    } else {
      return { error: data.error?.message || `API Error ${res.status}` };
    }
  } catch (e: any) {
    console.error("Failed to create remote assistant:", e);
    return { error: e.message || "Network connection failed." };
  }
}
