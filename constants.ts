
import { Chat, ImportCandidate } from './types';

export const INITIAL_CHATS: Chat[] = [
  {
    id: '1',
    name: 'General Assistant',
    avatar: '', // Empty means use default ghost icon
    provider: 'gemini',
    modelName: 'gemini-3-flash-preview',
    systemPrompt: 'You are a helpful and polite AI assistant. Answer questions clearly and concisely.',
    lastMessage: 'How can I help you today?',
    lastTimestamp: Date.now(),
    isPinned: true,
    messages: [
      { id: 'm1', text: 'Hello! I am your AI assistant. How can I help you today?', sender: 'ai', timestamp: Date.now() - 10000 }
    ],
    tags: ['#general']
  }
];

export const IMPORT_CATALOG: ImportCandidate[] = [
  {
    id: 'it-1',
    name: 'Coding Expert',
    prompt: 'You are an expert software engineer. Help the user with code, debugging, and architectural advice.',
    tags: ['#work']
  },
  {
    id: 'ed-1',
    name: 'Language Tutor',
    prompt: 'You are a patient language tutor. Help the user practice conversation and correct their grammar.',
    tags: ['#education']
  },
  {
    id: 'gen-1',
    name: 'Creative Writer',
    prompt: 'You are a creative writing assistant. Help the user brainstorm stories, poems, and scripts.',
    tags: ['#creative']
  },
  {
    id: 'tr-1',
    name: 'Travel Planner',
    prompt: 'You are a professional travel agent. Help the user plan itineraries and find interesting locations.',
    tags: ['#travel']
  }
];

export const MODEL_OPTIONS = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  gemini: ['gemini-3-flash-preview', 'gemini-3-pro-preview']
};
