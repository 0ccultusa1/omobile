
export type ModelProvider = 'openai' | 'deepseek' | 'gemini';
export type AppTheme = 'light' | 'dark' | 'system';

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai' | 'system';
  authorId?: string; 
  authorName?: string; 
  timestamp: number;
  isError?: boolean;
}

export interface TagFolder {
  id: string;
  name: string;
  description: string;
  emoji: string;
  isPinned: boolean;
}

export interface Chat {
  id: string;
  name: string;
  avatar: string;
  provider: ModelProvider;
  modelName: string;
  systemPrompt: string;
  temperature?: number;
  lastMessage?: string;
  lastTimestamp?: number;
  isPinned: boolean;
  messages: Message[];
  tags: string[];
  parentId?: string;
  draft?: string;
  isGroup?: boolean;
  participantIds?: string[]; 
}

export interface AppSettings {
  openaiKey: string;
  deepseekKey: string;
  defaultProvider: ModelProvider;
  activeTab: 'chats' | 'settings' | 'import';
  theme: AppTheme;
  customFolders: TagFolder[];
  globalSystemPrompt: string; // New field for user-visible instructions
}

export interface ImportCandidate {
  id: string;
  name: string;
  prompt: string;
  tags: string[];
}
