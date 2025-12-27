
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Chat, Message, AppSettings, ModelProvider, AppTheme, TagFolder } from './types';
import { INITIAL_CHATS, IMPORT_CATALOG, MODEL_OPTIONS } from './constants';
import ChatList from './components/ChatList';
import ChatWindow from './components/ChatWindow';
import SettingsView from './components/SettingsView';
import ImportView from './components/ImportView';
import CreateAssistantModal from './components/CreateAssistantModal';
import CreateGroupModal from './components/CreateGroupModal';
import CreateTagModal from './components/CreateTagModal';
import EditTagModal from './components/EditTagModal';
import { getAIResponse } from './services/aiService';

const generateUniqueId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const DEFAULT_GLOBAL_PROMPT = `[GROUP CHAT PROTOCOL]
You are part of a multi-turn dialogue. 
- You will see messages starting with "--- SOURCE: NAME ---". 
- These names represent different participants (Users or other AI agents).
- Natively interact with the conversation flow. 
- Respond to the latest messages, reference others if needed, and contribute naturally.
- DO NOT start your response with source tags or your own name. Just write the message content.`;

interface NavTag extends TagFolder {
  count: number;
  isSystem?: boolean;
}

const App: React.FC = () => {
  const [chats, setChats] = useState<Chat[]>(() => {
    const saved = localStorage.getItem('chat_app_chats');
    if (!saved) return INITIAL_CHATS;
    const parsed = JSON.parse(saved) as Chat[];
    return Array.from(new Map(parsed.map(item => [item.id, item])).values());
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('chat_app_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!parsed.globalSystemPrompt) parsed.globalSystemPrompt = DEFAULT_GLOBAL_PROMPT;
      return parsed;
    }
    return {
      openaiKey: '',
      deepseekKey: '',
      defaultProvider: 'gemini',
      activeTab: 'chats',
      theme: 'dark',
      globalSystemPrompt: DEFAULT_GLOBAL_PROMPT,
      customFolders: [
        { id: 'all', name: 'All Chats', emoji: '💬', description: 'Everything', isPinned: true },
        { id: 'work', name: 'Work', emoji: '💼', description: 'Professional tasks', isPinned: false }
      ]
    };
  });

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [navigationPath, setNavigationPath] = useState<string[]>([]);
  const [openInProfile, setOpenInProfile] = useState(false);
  const [activeTagId, setActiveTagId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingForward, setPendingForward] = useState<{ text: string, fromName: string } | null>(null);
  const [pendingBranch, setPendingBranch] = useState<{ parentId: string, rootMsg: Message } | null>(null);
  const [draftSubChat, setDraftSubChat] = useState<Chat | null>(null);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [isEditingTag, setIsEditingTag] = useState<TagFolder | null>(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);

  const activeChat = useMemo(() => {
    if (draftSubChat && draftSubChat.id === activeChatId) return draftSubChat;
    return chats.find(c => c.id === activeChatId) || null;
  }, [chats, activeChatId, draftSubChat]);

  const activityKey = useMemo(() => {
    const totalMessages = chats.reduce((acc, chat) => acc + chat.messages.length, 0);
    return `${chats.length}-${totalMessages}`;
  }, [chats]);

  const currentParentId = navigationPath[navigationPath.length - 1] || null;
  const currentParent = useMemo(() => chats.find(c => c.id === currentParentId) || null, [chats, currentParentId]);
  const rootAncestorId = navigationPath[0] || null;

  useEffect(() => {
    const root = window.document.documentElement;
    const applyTheme = (theme: AppTheme) => {
      let isDark = theme === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches : theme === 'dark';
      if (isDark) { root.classList.add('dark'); root.classList.remove('light'); }
      else { root.classList.remove('dark'); root.classList.add('light'); }
    };
    applyTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => { 
    const uniqueChats = Array.from(new Map(chats.map(item => [item.id, item])).values());
    localStorage.setItem('chat_app_chats', JSON.stringify(uniqueChats)); 
  }, [chats]);
  
  useEffect(() => { localStorage.setItem('chat_app_settings', JSON.stringify(settings)); }, [settings]);

  const availableDimensions = useMemo(() => {
    const nonArchivedChats = chats.filter(c => !c.tags.includes('#archived'));
    const archivedChatsCount = chats.filter(c => c.tags.includes('#archived')).length;

    const folders = settings.customFolders.map(f => {
      let count = 0;
      if (f.id === 'all') { count = nonArchivedChats.length; } else {
        const tagName = f.name.toLowerCase();
        count = nonArchivedChats.filter(c => c.tags.some(t => t.replace(/^#/, '').toLowerCase() === tagName)).length;
      }
      return { ...f, count };
    }) as NavTag[];

    const allTags = chats.flatMap((c: Chat) => c.tags.map((t: string) => t.replace(/^#/, '').trim()));
    const dynamicTags = Array.from(new Set<string>(allTags))
      .filter((t: string) => t.length > 0 && t.toLowerCase() !== 'archived' && !folders.some(f => f.name.toLowerCase() === t.toLowerCase()))
      .map((t: string) => ({
        id: `tag-auto-${t}`,
        name: t,
        emoji: '🏷️',
        description: 'Auto-category',
        isPinned: false,
        count: nonArchivedChats.filter(c => c.tags.some(tag => tag.replace(/^#/, '').toLowerCase() === t.toLowerCase())).length
      } as NavTag));

    const result = [...folders, ...dynamicTags];
    if (archivedChatsCount > 0) result.push({ id: 'tag-system-archived', name: 'Archive', emoji: '📦', description: 'Stored conversations', isPinned: false, count: archivedChatsCount, isSystem: true });
    return result;
  }, [chats, settings.customFolders]);

  const activeTag = useMemo(() => availableDimensions.find(t => t.id === activeTagId) || availableDimensions[0], [availableDimensions, activeTagId]);

  const sidebarChats = useMemo(() => {
    let baseChats: Chat[] = [];
    if (activeTagId === 'tag-system-archived') {
      baseChats = chats.filter(c => c.tags.includes('#archived'));
    } else {
      const nonArchived = chats.filter(c => !c.parentId);
      if (activeTagId === 'all') {
        baseChats = nonArchived.filter(c => !c.parentId);
      } else {
        const tagName = activeTag.name.toLowerCase();
        baseChats = nonArchived.filter(c => !c.parentId && c.tags.some(t => t.replace(/^#/, '').toLowerCase() === tagName));
      }
    }

    if (!searchQuery.trim()) return baseChats;

    const query = searchQuery.toLowerCase();
    return baseChats.filter(chat => {
      const nameMatch = chat.name.toLowerCase().includes(query);
      const lastMessageMatch = chat.lastMessage?.toLowerCase().includes(query);
      const historyMatch = chat.messages.some(m => m.text.toLowerCase().includes(query));
      return nameMatch || lastMessageMatch || historyMatch;
    });
  }, [chats, activeTagId, activeTag, searchQuery]);

  const currentLevelChats = useMemo(() => currentParentId ? chats.filter(c => c.parentId === currentParentId && !c.tags.includes('#archived')) : [], [chats, currentParentId]);

  const triggerAIResponseForChat = async (chatId: string, currentMessages: Message[], specificAuthorId?: string) => {
    const isDraft = draftSubChat && draftSubChat.id === chatId;
    const chatBase = isDraft ? draftSubChat : chats.find(c => c.id === chatId);
    if (!chatBase) return;

    let targetAssistant: Chat | undefined;
    
    if (specificAuthorId && specificAuthorId !== 'user') {
      targetAssistant = chats.find(c => c.id === specificAuthorId);
    } else if (!chatBase.isGroup && (!chatBase.participantIds || chatBase.participantIds.length === 0)) {
      targetAssistant = chatBase;
    } else if (chatBase.participantIds && chatBase.participantIds.length > 0) {
      targetAssistant = chats.find(c => c.id === chatBase.participantIds![0]);
    }

    if (!targetAssistant) return;

    let apiKey = '';
    if (targetAssistant.provider === 'openai') {
      apiKey = settings.openaiKey;
    } else if (targetAssistant.provider === 'deepseek') {
      apiKey = settings.deepseekKey;
    }
    
    // ПРОЗРАЧНАЯ СКЛЕЙКА: Промпт агента + Глобальная инструкция
    const finalSystemPrompt = `${targetAssistant.systemPrompt}\n\n${settings.globalSystemPrompt}`;

    if (targetAssistant.provider !== 'gemini' && !apiKey) {
      const systemMsg: Message = {
        id: `sys-${Date.now()}`,
        text: `⚠️ Error: No API key for ${targetAssistant.provider.toUpperCase()}.`,
        sender: 'system',
        timestamp: Date.now(),
        isError: true
      };
      const finalMessages = [...currentMessages, systemMsg];
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: finalMessages, lastMessage: systemMsg.text, lastTimestamp: Date.now() } : c));
      return;
    }
    
    try {
      let aiResponseText = await getAIResponse(targetAssistant.provider, targetAssistant.modelName, finalSystemPrompt, currentMessages, apiKey, targetAssistant.temperature ?? 0.7);
      
      let cleanedText = aiResponseText.trim();
      
      // Базовая очистка от случайных префиксов в начале (на всякий случай)
      const prefixesToStrip = [
        `[${targetAssistant.name}]:`, 
        `${targetAssistant.name}:`,
        `--- SOURCE: ${targetAssistant.name.toUpperCase()} ---`
      ];
      
      for (const prefix of prefixesToStrip) {
        if (cleanedText.startsWith(prefix)) {
          cleanedText = cleanedText.substring(prefix.length).trim();
        }
      }

      const aiMsg: Message = { 
        id: `ai-${Date.now()}`, 
        text: cleanedText, 
        sender: 'ai', 
        authorId: targetAssistant.id,
        authorName: targetAssistant.name,
        timestamp: Date.now() 
      };
      const finalMessages = [...currentMessages, aiMsg];

      if (isDraft) {
        const finalizedChat = { ...chatBase, messages: finalMessages, lastMessage: cleanedText, lastTimestamp: Date.now() };
        setChats(prev => [finalizedChat, ...prev.filter(c => c.id !== finalizedChat.id)]);
        setDraftSubChat(null);
        setActiveChatId(finalizedChat.id);
        setPendingBranch(null);
      } else {
        setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: finalMessages, lastMessage: cleanedText, lastTimestamp: Date.now() } : c));
      }
    } catch (e: any) { 
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        text: `${e.message}`,
        sender: 'system',
        timestamp: Date.now(),
        isError: true
      };
      const finalMessages = [...currentMessages, errorMsg];
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: finalMessages, lastMessage: errorMsg.text, lastTimestamp: Date.now() } : c));
    }
  };

  const handleChatSelection = (id: string) => {
    const chat = chats.find(c => c.id === id);
    if (!chat) return;
    const hasChildren = chats.some(c => c.parentId === id && !c.tags.includes('#archived'));
    if (hasChildren && !chat.tags.includes('#archived')) {
      if (!chat.parentId) setNavigationPath([id]); else setNavigationPath(prev => [...prev, id]);
    } else { setActiveChatId(id); }
  };

  const handleBack = () => setNavigationPath(prev => prev.length > 1 ? prev.slice(0, -1) : []);
  const handleCloseRitual = () => setNavigationPath([]);

  const updateChatMessages = useCallback((chatId: string, newMessages: Message[]) => {
    if (draftSubChat && draftSubChat.id === chatId) { setDraftSubChat(prev => prev ? ({ ...prev, messages: newMessages }) : null); return; }
    setChats(prev => prev.map(c => {
      if (c.id === chatId) {
        const last = newMessages[newMessages.length - 1];
        return { ...c, messages: newMessages, lastMessage: last?.text || c.lastMessage, lastTimestamp: last?.timestamp || c.lastTimestamp };
      }
      return c;
    }));
  }, [draftSubChat]);

  const updateChat = useCallback((chatId: string, updates: Partial<Chat>) => {
    if (draftSubChat && draftSubChat.id === chatId) { setDraftSubChat(prev => prev ? ({ ...prev, ...updates }) : null); return; }
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, ...updates } : c));
  }, [draftSubChat]);

  const handleArchiveChat = (id: string) => {
    setChats(prev => prev.map(c => c.id === id ? { ...c, tags: Array.from(new Set([...c.tags, '#archived'])), isPinned: false } : c));
    if (activeChatId === id) setActiveChatId(null);
    if (navigationPath.includes(id)) { const idx = navigationPath.indexOf(id); setNavigationPath(prev => prev.slice(0, idx)); }
  };

  const handleUnarchiveChat = (id: string) => setChats(prev => prev.map(c => c.id === id ? { ...c, tags: c.tags.filter(t => t !== '#archived') } : c));

  const handleDuplicateChat = (id: string) => {
    const original = chats.find(c => c.id === id);
    if (!original) return;
    
    const newChat: Chat = {
      ...original,
      id: generateUniqueId('dup'),
      name: `${original.name} Copy`,
      messages: [],
      lastMessage: `Copy of ${original.name}`,
      lastTimestamp: Date.now(),
      isPinned: false,
      parentId: original.parentId,
      draft: ''
    };
    
    setChats(prev => [newChat, ...prev]);
  };

  const handleBranch = (msg: Message) => {
    const parentChat = chats.find(c => c.id === activeChatId);
    if (!parentChat) return;
    const newDraft: Chat = { ...parentChat, id: generateUniqueId('branch'), name: `Thread: ${msg.text.slice(0, 15)}...`, parentId: parentChat.id, messages: [], lastMessage: "Starting new thread...", lastTimestamp: Date.now(), isPinned: false };
    setPendingBranch({ parentId: parentChat.id, rootMsg: msg });
    setDraftSubChat(newDraft);
    setActiveChatId(newDraft.id);
  };

  const handleImportMany = useCallback((newChats: Chat[]) => {
    setChats((prev: Chat[]) => {
      const mergedMap = new Map<string, Chat>(prev.map(c => [c.id, c]));
      newChats.forEach((nc: Chat) => {
        if (mergedMap.has(nc.id)) {
          const existing = mergedMap.get(nc.id)!;
          mergedMap.set(nc.id, { 
            ...existing, 
            name: existing.name || nc.name,
            systemPrompt: existing.systemPrompt || nc.systemPrompt,
            tags: Array.from(new Set([...existing.tags, ...(nc.tags || [])]))
          });
        } else {
          mergedMap.set(nc.id, nc);
        }
      });
      return Array.from(mergedMap.values());
    });
  }, []);

  const openSettings = useCallback(() => {
    setSettings(s => ({ ...s, activeTab: 'settings' }));
    setActiveChatId(null);
  }, []);

  return (
    <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white dark:bg-ios-darkBg overflow-hidden shadow-2xl relative transition-colors duration-300">
      {settings.activeTab === 'chats' && (
        <header className={`ios-blur bg-white/80 dark:bg-ios-darkBg/80 sticky top-0 z-30 px-4 py-3 flex justify-between items-center ${navigationPath.length > 0 ? 'border-b border-gray-200 dark:border-gray-800' : ''}`}>
          <div className="flex items-center space-x-2 cursor-pointer group" onClick={() => { if (navigationPath.length === 0 && activeTagId !== 'all' && activeTagId !== 'tag-system-archived') setIsEditingTag(activeTag as TagFolder); }}>
            <span className="text-xl filter drop-shadow-sm">{navigationPath.length === 0 ? (activeTagId === 'all' ? '' : activeTag.emoji) : '💬'}</span>
            <div className="flex flex-col">
              <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white leading-tight">
                {navigationPath.length > 0 ? 'Conversation' : (activeTagId === 'all' ? 'Messages' : activeTag.name)}
              </h1>
            </div>
            {navigationPath.length === 0 && activeTagId !== 'all' && activeTagId !== 'tag-system-archived' && <i className="fa-solid fa-chevron-right text-[10px] text-gray-400 opacity-50 group-hover:opacity-100 transition-opacity ml-1"></i>}
          </div>
          {!navigationPath.length ? (
            <div className="relative">
              <button onClick={() => setShowPlusMenu(!showPlusMenu)} className="text-blue-500 p-1 flex items-center justify-center"><i className={`fa-solid fa-circle-plus text-2xl transition-transform duration-300 ${showPlusMenu ? 'rotate-45' : ''}`}></i></button>
              {showPlusMenu && (
                <>
                  <div className="fixed inset-0 z-40 bg-black/10 dark:bg-black/40" onClick={() => setShowPlusMenu(false)}></div>
                  <div className="absolute right-0 mt-2 w-72 bg-white/95 dark:bg-ios-darkSurface/95 ios-blur rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 py-2 overflow-hidden pop-in">
                    <button onClick={() => { setIsCreatingChat(true); setShowPlusMenu(false); }} className="w-full text-left px-6 py-5 text-[17px] font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center transition-colors"><i className="fa-solid fa-robot w-8 text-blue-500 text-xl"></i> New AI Contact</button>
                    <button onClick={() => { setIsCreatingGroup(true); setShowPlusMenu(false); }} className="w-full text-left px-6 py-5 text-[17px] font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center border-t dark:border-gray-800 transition-colors"><i className="fa-solid fa-users w-8 text-orange-500 text-xl"></i> New AI Arena</button>
                    <button onClick={() => { setIsCreatingTag(true); setShowPlusMenu(false); }} className="w-full text-left px-6 py-5 text-[17px] font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center border-t dark:border-gray-800 transition-colors"><i className="fa-solid fa-folder-plus w-8 text-purple-500 text-xl"></i> New Folder</button>
                  </div>
                </>
              )}
            </div>
          ) : <button onClick={handleCloseRitual} className="text-blue-500 font-bold text-sm bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-full">Back</button>}
        </header>
      )}

      {settings.activeTab === 'chats' && !navigationPath.length && (
        <div key="chats-header" className="modal-animate">
          <div className="bg-white/80 dark:bg-ios-darkBg px-4 py-2 flex space-x-2 overflow-x-auto ios-blur no-scrollbar sticky top-[52px] z-20">
            {availableDimensions.map(tag => (
              <button key={tag.id} onClick={() => setActiveTagId(tag.id)} className={`px-4 py-1.5 rounded-full whitespace-nowrap text-[11px] font-bold border transition-all flex items-center space-x-1.5 ${activeTagId === tag.id ? (tag.id === 'tag-system-archived' ? 'bg-gray-600 border-gray-600 text-white shadow-md scale-105' : 'bg-blue-500 border-blue-500 text-white shadow-md scale-105') : 'bg-gray-50 dark:bg-ios-darkSurface border-gray-100 dark:border-gray-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                <span>{tag.emoji}</span><span>{tag.name}</span>
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full min-w-[1.5em] transition-colors ${activeTagId === tag.id ? 'bg-white/20 text-white' : 'bg-gray-200/50 dark:bg-gray-800 text-gray-400'}`}>{tag.count}</span>
              </button>
            ))}
          </div>
          
          <div className="px-4 py-2 bg-white/80 dark:bg-ios-darkBg ios-blur sticky top-[92px] z-20">
            <div className="bg-gray-100 dark:bg-ios-darkSurface rounded-xl flex items-center px-3 py-1.5">
              <i className="fa-solid fa-magnifying-glass text-gray-400 text-xs mr-2"></i>
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="bg-transparent text-sm w-full outline-none dark:text-white"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-gray-400 ml-2">
                  <i className="fa-solid fa-circle-xmark"></i>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-hidden bg-[#f2f2f7] dark:bg-ios-darkBg relative">
        <div className="h-full w-full relative">
          {settings.activeTab === 'chats' && (
            <div key="chats-main" className="flex h-full w-full modal-animate absolute inset-0 overflow-hidden">
               <div className={`transition-all duration-500 h-full overflow-y-auto border-r border-gray-100 dark:border-gray-900/30 ${navigationPath.length > 0 ? 'w-20' : 'w-full'}`}>
                  <ChatList chats={sidebarChats} allChats={chats} isFiltered={activeTagId !== 'all' || searchQuery !== ''} isArchivedView={activeTagId === 'tag-system-archived'} shrunk={navigationPath.length > 0} activeParentId={rootAncestorId} onSelectChat={handleChatSelection} onTogglePin={(id) => setChats(prev => prev.map(c => c.id === id ? { ...c, isPinned: !c.isPinned } : c))} onDeleteChat={(id) => setChats(prev => prev.filter(c => c.id !== id))} onArchiveChat={handleArchiveChat} onUnarchiveChat={handleUnarchiveChat} onManageTags={(id) => { setActiveChatId(id); setOpenInProfile(true); }} onDuplicateChat={handleDuplicateChat} />
               </div>
               {navigationPath.length > 0 && (
                 <div className="flex-1 bg-white dark:bg-[#0a141d] h-full overflow-y-auto modal-animate shadow-2xl z-10 flex flex-col">
                    <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-white/[0.01]">
                      <div className="flex items-center mb-3"><button onClick={handleBack} className="text-blue-500 mr-2 flex items-center space-x-1 active:scale-90 transition-transform"><i className="fa-solid fa-chevron-left text-xs"></i><span className="text-[10px] font-bold uppercase tracking-tighter">Up</span></button><div className="h-[1px] flex-1 bg-gray-100 dark:bg-gray-800 ml-2 opacity-50"></div></div>
                      {currentParent && (<div onClick={() => setActiveChatId(currentParent.id)} className="p-4 bg-white dark:bg-ios-darkSurface rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm active:scale-[0.98] transition-all cursor-pointer group hover:border-blue-500/30"><div className="flex justify-between items-start mb-1"><h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight truncate pr-2">{currentParent.name}</h4><i className="fa-solid fa-comments text-blue-500 text-[10px] group-hover:animate-pulse"></i></div><p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 italic leading-relaxed">{currentParent.lastMessage || "Chat thread active"}</p></div>)}
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      <div className="px-4 py-2 bg-gray-50/50 dark:bg-white/[0.02]"><h2 className="text-[9px] font-black text-purple-500 uppercase tracking-[0.25em]">Sub-Threads</h2></div>
                      <ChatList chats={currentLevelChats} allChats={chats} isFiltered={true} onSelectChat={handleChatSelection} onTogglePin={(id) => setChats(prev => prev.map(c => c.id === id ? { ...c, isPinned: !c.isPinned } : c))} onDeleteChat={(id) => setChats(prev => prev.filter(c => c.id !== id))} onArchiveChat={handleArchiveChat} onUnarchiveChat={handleUnarchiveChat} onManageTags={(id) => { setActiveChatId(id); setOpenInProfile(true); }} onDuplicateChat={handleDuplicateChat} />
                    </div>
                 </div>
               )}
            </div>
          )}
          {settings.activeTab === 'settings' && (
            <div key="settings-main" className="modal-animate h-full absolute inset-0 overflow-y-auto">
              <SettingsView settings={settings} setSettings={setSettings} chats={chats} onImportMany={handleImportMany} onUnarchiveChat={handleUnarchiveChat} onDeleteChat={(id) => setChats(prev => prev.filter(c => c.id !== id))} onClose={() => setSettings(s => ({ ...s, activeTab: 'chats' }))} />
            </div>
          )}
          {settings.activeTab === 'import' && (
            <div key="import-main" className="modal-animate h-full absolute inset-0 overflow-y-auto">
              <ImportView onImport={(id) => { const candidate = IMPORT_CATALOG.find(c => c.id === id); if (candidate) { const newChat: Chat = { id: generateUniqueId('imported'), name: candidate.name, avatar: '', provider: settings.defaultProvider, modelName: MODEL_OPTIONS[settings.defaultProvider][0], systemPrompt: candidate.prompt, temperature: 0.7, isPinned: false, messages: [], tags: candidate.tags, lastMessage: 'Assistant added.', lastTimestamp: Date.now() }; setChats(prev => [newChat, ...prev]); setSettings(s => ({ ...s, activeTab: 'chats' })); } }} />
            </div>
          )}
        </div>
      </main>

      {!navigationPath.length && !activeChat && (
        <nav className="ios-blur bg-white/80 dark:bg-ios-darkBg/80 border-t border-gray-200 dark:border-gray-800 flex justify-around items-center safe-bottom h-20 shrink-0 z-30 px-6">
          <button 
            onClick={() => setSettings(s => ({ ...s, activeTab: 'import' }))} 
            className={`flex items-center justify-center transition-all ${settings.activeTab === 'import' ? 'text-blue-600 scale-110' : 'text-gray-400 opacity-70'}`}
          >
            <i className="fa-solid fa-globe-americas text-2xl"></i>
          </button>
          <button 
            onClick={() => { setSettings(s => ({ ...s, activeTab: 'chats' })); setActiveTagId('all'); }} 
            className={`flex items-center justify-center transition-all ${settings.activeTab === 'chats' ? 'text-blue-600 scale-110' : 'text-gray-400 opacity-70'}`}
          >
            <i 
              key={activityKey}
              className="fa-solid fa-infinity text-2xl nav-activity-roll"
            ></i>
          </button>
          <button 
            onClick={() => setSettings(s => ({ ...s, activeTab: 'settings' }))} 
            className={`flex items-center justify-center transition-all ${settings.activeTab === 'settings' ? 'text-blue-600 scale-110' : 'text-gray-400 opacity-70'}`}
          >
            <i className="fa-solid fa-cog text-2xl"></i>
          </button>
        </nav>
      )}

      {activeChat && (<div className="fixed inset-0 z-50 bg-white dark:bg-ios-darkBg modal-animate"><ChatWindow chat={activeChat} onClose={() => { setActiveChatId(null); setOpenInProfile(false); setPendingBranch(null); setDraftSubChat(null); }} updateMessages={(msgs) => updateChatMessages(activeChat.id, msgs)} updateChat={(updates) => updateChat(activeChat.id, updates)} onDeleteMessage={(msgId) => setChats(prev => prev.map(c => c.id === activeChat.id ? { ...c, messages: c.messages.filter(m => m.id !== msgId) } : c))} onDeleteChat={() => { setChats(prev => prev.filter(c => c.id !== activeChat.id)); setActiveChatId(null); }} onArchiveChat={() => { handleArchiveChat(activeChat.id); setActiveChatId(null); }} onDuplicateChat={() => { handleDuplicateChat(activeChat.id); setActiveChatId(null); }} apiKey={activeChat.provider === 'openai' ? settings.openaiKey : activeChat.provider === 'deepseek' ? settings.deepseekKey : ''} settings={settings} allChats={chats} onPrepareForward={(text, fromName, targetId) => { setPendingForward({ text, fromName }); setActiveChatId(targetId); }} pendingForward={pendingForward} onClearForward={() => setPendingForward(null)} triggerAIResponse={(msgs, specificId) => triggerAIResponseForChat(activeChat.id, msgs, specificId)} startInProfile={openInProfile} onBranch={handleBranch} branchRootMsg={draftSubChat?.id === activeChatId ? pendingBranch?.rootMsg : null} onOpenSettings={openSettings} /></div>)}

      {isCreatingChat && <CreateAssistantModal settings={settings} onClose={() => setIsCreatingChat(false)} onCreate={(chat) => { setChats(prev => [chat, ...prev]); setIsCreatingChat(false); }} />}
      {isCreatingGroup && <CreateGroupModal onClose={() => setIsCreatingGroup(false)} availableAssistants={chats} onCreate={(chat) => { setChats(prev => [chat, ...prev]); setIsCreatingGroup(false); }} />}
      {isCreatingTag && <CreateTagModal onClose={() => setIsCreatingTag(false)} onCreate={(tag) => { setSettings(s => ({ ...s, customFolders: [...s.customFolders, tag] })); setIsCreatingTag(false); }} />}
      {isEditingTag && <EditTagModal tag={isEditingTag} allChats={chats} onClose={() => setIsEditingTag(null)} onUpdate={(tag) => { setSettings(s => { const index = s.customFolders.findIndex(t => t.id === tag.id); let newFolders = [...s.customFolders]; if (index > -1) { newFolders[index] = tag; } else { newFolders.push({ ...tag, id: generateUniqueId('tag-permanent') }); } return { ...s, customFolders: newFolders }; }); setIsEditingTag(null); }} onDelete={(id) => { setSettings(s => ({ ...s, customFolders: s.customFolders.filter(t => t.id !== id), activeTagId: 'all' })); setIsEditingTag(null); }} onUpdateChat={updateChat} />}
    </div>
  );
};

export default App;
