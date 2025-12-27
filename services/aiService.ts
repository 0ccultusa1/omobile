
import { GoogleGenAI } from "@google/genai";
import { Message, ModelProvider, Chat } from '../types';

const MAX_HISTORY_MESSAGES = 40;
const MAX_HISTORY_CHARS = 12000;

function mapHistory(history: Message[], provider: ModelProvider) {
  if (history.length === 0) return [];

  const chatMessages = history.filter(m => m.sender !== 'system');
  let recent = chatMessages.slice(-MAX_HISTORY_MESSAGES);
  
  let totalChars = 0;
  let finalMessages: Message[] = [];
  
  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i];
    if (totalChars + msg.text.length > MAX_HISTORY_CHARS && finalMessages.length > 0) {
      break;
    }
    totalChars += msg.text.length;
    finalMessages.unshift(msg);
  }

  const merged: { role: 'user' | 'assistant' | 'model'; content: string }[] = [];
  
  finalMessages.forEach(msg => {
    let role: 'user' | 'assistant' | 'model';
    if (provider === 'gemini') {
      role = msg.sender === 'user' ? 'user' : 'model';
    } else {
      role = msg.sender === 'user' ? 'user' : 'assistant';
    }

    // ИЗМЕНЕНИЕ: Используем более жесткие визуальные границы для разделения контекста участников
    const authorLabel = msg.authorName || (msg.sender === 'user' ? 'User' : 'Assistant');
    const structuredText = `\n--- SOURCE: ${authorLabel.toUpperCase()} ---\n${msg.text.trim()}\n--- END ${authorLabel.toUpperCase()} ---`;

    if (merged.length > 0 && merged[merged.length - 1].role === role) {
      // Если несколько ИИ ответили подряд, они склеиваются, но теперь с четкими границами
      merged[merged.length - 1].content += `\n${structuredText}`;
    } else {
      merged.push({ role, content: structuredText });
    }
  });

  // Strict alternation check for OpenAI/DeepSeek to prevent consecutive same-role messages
  // This is a "paranoid" pass to fix "Invalid consecutive assistant message" errors.
  if (provider !== 'gemini') {
      const strictMerged: typeof merged = [];
      merged.forEach(m => {
          if (strictMerged.length > 0 && strictMerged[strictMerged.length - 1].role === m.role) {
              strictMerged[strictMerged.length - 1].content += "\n\n" + m.content;
          } else {
              strictMerged.push(m);
          }
      });
      
      // Ensure the history starts with a user message if the first one is an assistant
      if (strictMerged.length > 0 && strictMerged[0].role === 'assistant') {
          strictMerged.unshift({ role: 'user', content: 'Wake up and analyze the dialogue log.' });
      }
      return strictMerged;
  }

  return merged;
}

// Function to strip the protocol tags if the AI regurgitates them
function cleanResponse(text: string): string {
  if (!text) return "";
  // Regex to remove lines like "--- SOURCE: NAME ---" and "--- END NAME ---"
  // Handles potential whitespace/hyphens variations
  let cleaned = text.replace(/^-+\s*SOURCE:.*?-+\s*$/gim, "");
  cleaned = cleaned.replace(/^-+\s*END.*?-+\s*$/gim, "");
  // Remove leading/trailing newlines that might be left over
  return cleaned.trim();
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
            const message = data.error?.message || `Error ${res.status}`;
            // Improve error clarity for Auth failures
            if (res.status === 401) {
                 throw new Error(`${provider.toUpperCase()}: Authentication Fails. Please check your API Key in Settings.`);
            }
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

  // Clean the output before returning
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
