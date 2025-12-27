
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Chat, Message, ModelProvider, AppSettings } from '../types';
import { getAIResponse } from '../services/aiService';
import { MODEL_OPTIONS } from '../constants';

interface Props {
  chat: Chat;
  onClose: () => void;
  updateMessages: (msgs: Message[]) => void;
  updateChat: (updates: Partial<Chat>) => void;
  onDeleteMessage: (msgId: string) => void;
  onDeleteChat: () => void;
  onArchiveChat: () => void;
  onDuplicateChat: () => void;
  apiKey: string;
  settings: AppSettings;
  allChats: Chat[];
  onPrepareForward: (text: string, fromName: string, targetChatId: string) => void;
  pendingForward: { text: string, fromName: string } | null;
  onClearForward: () => void;
  triggerAIResponse: (msgs: Message[], specificAuthorId?: string) => Promise<void>;
  startInProfile?: boolean;
  onBranch?: (msg: Message) => void;
  branchRootMsg?: Message | null;
  onOpenSettings?: () => void;
}

const AvatarDisplay: React.FC<{ avatar: string, size?: string, fallbackIcon?: string, isActive?: boolean, color?: string }> = ({ 
  avatar, size = "w-8 h-8", fallbackIcon = "fa-user", isActive = false, color = "blue" 
}) => {
  const hasImage = avatar && (avatar.startsWith('http') || avatar.startsWith('data:'));
  const activeClass = color === 'blue' 
    ? 'border-blue-500 ring-2 ring-blue-500/20' 
    : 'border-orange-500 ring-2 ring-orange-500/20';
  
  return (
    <div className={`${size} rounded-full flex items-center justify-center border-2 transition-all duration-300 ${isActive ? `${activeClass} scale-110 shadow-lg` : 'border-transparent opacity-90'} shrink-0 bg-[#2c2c2e] overflow-hidden`}>
      {hasImage ? (
        <img src={avatar} className="h-full w-full object-cover" alt="" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[#8e8e93]">
          <i className={`fa-solid ${fallbackIcon} ${size.includes('w-6') ? 'text-[10px]' : size.includes('w-11') ? 'text-xl' : size.includes('w-12') ? 'text-2xl' : 'text-sm'}`}></i>
        </div>
      )}
    </div>
  );
};

const MultiAvatar: React.FC<{ participants: Chat[], mainAvatar: string }> = ({ participants, mainAvatar }) => {
  if (participants.length === 0) return <AvatarDisplay avatar={mainAvatar} size="w-9 h-9" isActive={true} />;
  
  return (
    <div className="relative w-14 h-9 flex items-center shrink-0">
      <div className="absolute left-0 z-10 scale-95 ring-2 ring-white dark:ring-ios-darkBg rounded-full overflow-hidden bg-[#1d2733]">
        <AvatarDisplay avatar={mainAvatar} size="w-7 h-7" isActive={true} />
      </div>
      {participants.slice(0, 2).map((p, idx) => (
        <div key={p.id} className="absolute z-0" style={{ left: `${(idx + 1) * 16}px` }}>
          <div className="rounded-full overflow-hidden bg-[#1d2733] ring-1 ring-white dark:ring-ios-darkBg">
            <AvatarDisplay avatar={p.avatar} size="w-6 h-6" />
          </div>
        </div>
      ))}
    </div>
  );
};

const HighlightedText: React.FC<{ text: string, highlight: string, isActive: boolean }> = ({ text, highlight, isActive }) => {
  if (!highlight.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === highlight.toLowerCase() ? (
          <mark key={i} className={`${isActive ? 'bg-yellow-400 text-black' : 'bg-yellow-200/50 dark:bg-yellow-500/30 dark:text-white'} rounded-sm px-0.5 transition-colors duration-200`}>
            {part}
          </mark>
        ) : part
      )}
    </>
  );
};

const ChatWindow: React.FC<Props> = ({ 
  chat, onClose, updateMessages, updateChat, onDeleteMessage, onDeleteChat, onArchiveChat, 
  onDuplicateChat, apiKey, settings, allChats, onPrepareForward, pendingForward, onClearForward, 
  triggerAIResponse, startInProfile = false, onBranch, branchRootMsg = null, onOpenSettings
}) => {
  const [inputText, setInputText] = useState(chat.draft || '');
  const [isTyping, setIsTyping] = useState(false);
  const [showProfile, setShowProfile] = useState(startInProfile);
  
  const [chatSearchText, setChatSearchText] = useState('');
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const [selectedAuthorId, setSelectedAuthorId] = useState<string>('user');
  const [senderPersonaId, setSenderPersonaId] = useState<string>('user');
  const [isPickingSender, setIsPickingSender] = useState(false);
  const [senderSearch, setSenderSearch] = useState('');
  const [activeMessageMenuId, setActiveMessageMenuId] = useState<string | null>(null);

  const [isAutoFlow, setIsAutoFlow] = useState(false);
  const [isAddingParticipant, setIsAddingParticipant] = useState(false);
  const [participantSearch, setParticipantSearch] = useState('');
  const autoFlowTimer = useRef<number | null>(null);

  const [editPrompt, setEditPrompt] = useState(chat.systemPrompt);
  const [editTemp, setEditTemp] = useState(chat.temperature ?? 0.7);
  const [editTags, setEditTags] = useState(chat.tags);
  const [editAvatar, setEditAvatar] = useState(chat.avatar);
  const [editProvider, setEditProvider] = useState<ModelProvider>(chat.provider);
  const [editModel, setEditModel] = useState(chat.modelName);
  const [editName, setEditName] = useState(chat.name);
  const [isImproving, setIsImproving] = useState(false);

  useEffect(() => {
    if (!showProfile) {
      setEditPrompt(chat.systemPrompt);
      setEditTemp(chat.temperature ?? 0.7);
      setEditTags(chat.tags);
      setEditAvatar(chat.avatar);
      setEditProvider(chat.provider);
      setEditModel(chat.modelName);
      setEditName(chat.name);
    }
  }, [chat, showProfile]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search inputs when modals open
  useEffect(() => {
    if (isPickingSender || isAddingParticipant) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setSenderSearch('');
      setParticipantSearch('');
    }
  }, [isPickingSender, isAddingParticipant]);

  const participants = useMemo(() => {
    const list = chat.participantIds || [];
    return allChats.filter(c => list.includes(c.id));
  }, [chat.participantIds, allChats]);

  const responders = useMemo(() => {
    const res = [{ id: 'user', name: 'Me', avatar: '', icon: 'fa-user', color: 'blue' }];
    res.push({ id: chat.id, name: chat.name, avatar: chat.avatar, icon: 'fa-robot', color: 'orange' });
    participants.forEach(p => {
      if (p.id !== chat.id) res.push({ id: p.id, name: p.name, avatar: p.avatar, icon: 'fa-robot', color: 'orange' });
    });
    return res;
  }, [chat.id, chat.name, chat.avatar, participants]);

  const personaCandidates = useMemo(() => {
    const sorted = [...allChats].sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));
    return sorted.filter(c => 
      !c.isGroup && 
      c.name.toLowerCase().includes(senderSearch.toLowerCase())
    );
  }, [allChats, senderSearch]);

  const participantCandidates = useMemo(() => {
    const currentList = chat.participantIds || [];
    return allChats.filter(c => 
      !c.isGroup && 
      !currentList.includes(c.id) && 
      c.id !== chat.id && 
      !c.tags.includes('#archived') &&
      c.name.toLowerCase().includes(participantSearch.toLowerCase())
    );
  }, [chat.participantIds, chat.id, allChats, participantSearch]);

  const currentSender = useMemo(() => {
    if (senderPersonaId === 'user') return { id: 'user', name: 'Me', avatar: '', icon: 'fa-user' };
    const p = allChats.find(c => c.id === senderPersonaId);
    return p ? { id: p.id, name: p.name, avatar: p.avatar, icon: 'fa-robot' } : { id: 'user', name: 'Me', avatar: '', icon: 'fa-user' };
  }, [senderPersonaId, allChats]);

  const matches = useMemo(() => {
    if (!chatSearchText.trim()) return [];
    const query = chatSearchText.toLowerCase();
    return chat.messages.map(m => m.text.toLowerCase().includes(query) ? m.id : null).filter((id): id is string => id !== null);
  }, [chat.messages, chatSearchText]);

  useEffect(() => { setCurrentMatchIndex(matches.length > 0 ? matches.length - 1 : 0); }, [matches.length]);

  useEffect(() => {
    if (matches.length > 0 && isSearchVisible) {
      const activeId = matches[currentMatchIndex];
      const el = document.getElementById(`msg-container-${activeId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentMatchIndex, matches, isSearchVisible]);

  const triggerNextAI = useCallback(async () => {
    if (responders.length < 2 || isTyping) return;
    const lastAiMsg = [...chat.messages].reverse().find(m => m.sender === 'ai' && m.authorId);
    const aiResponders = responders.filter(r => r.id !== 'user');
    let nextIdx = 0;
    if (lastAiMsg) {
      const lastIdx = aiResponders.findIndex(r => r.id === lastAiMsg.authorId);
      nextIdx = (lastIdx + 1) % aiResponders.length;
    }
    setIsTyping(true);
    try { await triggerAIResponse(chat.messages, aiResponders[nextIdx].id); } finally { setIsTyping(false); }
  }, [chat.messages, responders, triggerAIResponse, isTyping]);

  useEffect(() => {
    if (isAutoFlow && !isTyping && responders.length > 1) {
      autoFlowTimer.current = window.setTimeout(() => { triggerNextAI(); }, 2500);
    }
    return () => { if(autoFlowTimer.current) clearTimeout(autoFlowTimer.current); };
  }, [isAutoFlow, isTyping, chat.messages, responders.length, triggerNextAI]);

  const handleImprovePrompt = async () => {
    if (isImproving) return;
    setIsImproving(true);
    try {
      const improved = await getAIResponse('gemini', 'gemini-3-flash-preview', 
        "Expert prompt engineer. Refine instructions into a professional system prompt. Output ONLY refined text.", 
        [{ id: '1', text: editPrompt, sender: 'user', timestamp: Date.now() }], '', 0.8);
      setEditPrompt(improved.trim());
    } catch (e) { console.error(e); } finally { setIsImproving(false); }
  };

  const handleSaveChanges = () => {
    updateChat({ 
      name: editName, 
      systemPrompt: editPrompt, 
      temperature: editTemp, 
      tags: editTags, 
      avatar: editAvatar, 
      provider: editProvider, 
      modelName: editModel 
    });
    setShowProfile(false);
  };

  const handleSend = async () => {
    const textToSend = inputText.trim();
    if (!textToSend && selectedAuthorId === 'user') return;
    
    let newMsgs = [...chat.messages];
    if (textToSend) {
      const isImpersonating = senderPersonaId !== 'user';
      const senderMsg: Message = { 
        id: `msg-${Date.now()}`, 
        text: textToSend, 
        sender: isImpersonating ? 'ai' : 'user', 
        authorId: isImpersonating ? currentSender.id : undefined,
        authorName: isImpersonating ? currentSender.name : undefined,
        timestamp: Date.now() 
      };
      newMsgs.push(senderMsg);
      setInputText('');
      updateMessages(newMsgs);
    }
    
    if (senderPersonaId === 'user') {
      setIsTyping(true);
      try {
        if (selectedAuthorId === 'user') {
          const defaultTargetId = responders.length > 1 ? responders[1].id : undefined;
          await triggerAIResponse(newMsgs, defaultTargetId);
        } else {
          await triggerAIResponse(newMsgs, selectedAuthorId);
        }
      } finally { setIsTyping(false); }
    }
  };

  const getSystemIcon = (text: string) => {
    const t = text.toLowerCase();
    if (t.includes('auth') || t.includes('key')) return 'fa-key';
    if (t.includes('billing') || t.includes('balance')) return 'fa-credit-card';
    return 'fa-circle-info';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f2f2f7] dark:bg-ios-darkBg relative transition-colors duration-300">
      <header className="ios-blur bg-white/90 dark:bg-ios-darkBg/90 px-4 py-3 flex items-center border-b border-gray-200 dark:border-gray-800 shrink-0 sticky top-0 z-40 min-h-[52px]">
        <button onClick={onClose} className="text-blue-500 mr-8 active:opacity-50 shrink-0">
          <i className="fa-solid fa-chevron-left text-xl"></i>
        </button>
        <div className="flex-1 flex items-center cursor-pointer overflow-hidden" onClick={() => setShowProfile(true)}>
          <MultiAvatar participants={participants} mainAvatar={chat.avatar} />
          <div className="flex flex-col ml-3 truncate">
            <span className="text-[14px] font-bold text-black dark:text-white truncate">{chat.name}</span>
            <span className="text-[9px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-tight">
              {responders.length > 2 ? `${responders.length - 1} entities in Arena` : 'Direct AI Line'}
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          {responders.length > 2 && (
             <button 
               onClick={() => setIsAutoFlow(!isAutoFlow)}
               className={`w-9 h-5 rounded-full relative transition-all duration-300 ${isAutoFlow ? 'bg-green-500 shadow-lg shadow-green-500/20' : 'bg-gray-200 dark:bg-gray-800'}`}
             >
               <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 ${isAutoFlow ? 'left-[18px]' : 'left-0.5'}`} />
             </button>
          )}
          <button onClick={() => setShowProfile(true)} className="text-blue-500 p-1"><i className="fa-solid fa-ellipsis text-xl"></i></button>
        </div>
      </header>

      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-6 no-scrollbar" onClick={() => setActiveMessageMenuId(null)}>
        {chat.messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full opacity-30 text-center px-10">
            <i className="fa-solid fa-infinity text-5xl mb-4 text-blue-500"></i>
            <p className="text-xs font-black uppercase tracking-[0.2em]">Context Established</p>
          </div>
        )}
        {chat.messages.map((msg) => (
          <div 
            id={`msg-container-${msg.id}`} 
            key={msg.id} 
            className={`flex flex-col w-full group ${msg.sender === 'user' ? 'items-end' : (msg.sender === 'system' ? 'items-center' : 'items-start')}`}
          >
            {msg.sender === 'system' ? (
              <div className="flex flex-col items-center w-full my-4">
                <div className={`${msg.isError ? 'message-bubble-error flex items-start gap-2' : 'message-bubble-system'} selectable-text`}>
                  {msg.isError && <i className={`fa-solid ${getSystemIcon(msg.text)} mt-1 opacity-70`}></i>}
                  <span>{msg.text}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col relative max-w-[85%]">
                {msg.authorName && <span className={`text-[9px] font-black uppercase text-gray-400 mb-0.5 px-2 ${msg.sender === 'user' ? 'text-right' : 'text-left'}`}>{msg.authorName}</span>}
                <div 
                  onClick={(e) => { e.stopPropagation(); setActiveMessageMenuId(activeMessageMenuId === msg.id ? null : msg.id); }}
                  className={`px-4 py-2.5 rounded-2xl text-[15px] shadow-sm relative transition-all cursor-pointer select-none active:scale-[0.98] ${msg.sender === 'user' ? 'message-bubble-user' : 'message-bubble-ai border dark:border-ios-darkSurface'} ${activeMessageMenuId === msg.id ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-[#010d18]' : ''} ${matches[currentMatchIndex] === msg.id && chatSearchText ? 'ring-2 ring-yellow-400' : ''}`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed selectable-text pointer-events-none"><HighlightedText text={msg.text} highlight={chatSearchText} isActive={matches[currentMatchIndex] === msg.id} /></p>
                  <div className="text-[9px] mt-1 opacity-40 text-right">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>

                {activeMessageMenuId === msg.id && (
                  <div className={`absolute z-50 top-full mt-2 w-32 bg-white/95 dark:bg-ios-darkSurface/95 ios-blur rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 py-1 message-menu-pop ${msg.sender === 'user' ? 'right-0' : 'left-0'}`}>
                    <button onClick={(e) => { e.stopPropagation(); onBranch?.(msg); setActiveMessageMenuId(null); }} className="w-full text-left px-4 py-2.5 text-xs font-bold text-blue-500 flex items-center"><i className="fa-solid fa-code-branch w-5"></i> Thread</button>
                    <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(msg.text); setActiveMessageMenuId(null); }} className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-600 dark:text-gray-300 flex items-center"><i className="fa-solid fa-copy w-5"></i> Copy</button>
                    <button onClick={(e) => { e.stopPropagation(); onDeleteMessage(msg.id); setActiveMessageMenuId(null); }} className="w-full text-left px-4 py-2.5 text-xs font-bold text-red-500 flex items-center border-t border-gray-50 dark:border-gray-800"><i className="fa-solid fa-trash w-5"></i> Delete</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {isTyping && <div className="flex justify-start"><div className="bg-gray-100 dark:bg-ios-darkSurface px-4 py-3 rounded-2xl flex space-x-1 items-center animate-pulse"><div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div><div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div><div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div></div></div>}
        <div ref={scrollRef} />
      </div>

      <footer className="ios-blur bg-white/90 dark:bg-ios-darkBg/90 border-t border-gray-200 dark:border-gray-800 p-2 safe-bottom flex flex-col z-40">
        <div className="flex items-center space-x-3 px-3 mb-2 overflow-x-auto no-scrollbar py-1 h-11 items-center">
            {responders.map(r => (
              <div key={r.id} className="flex flex-col items-center shrink-0">
                <button onClick={() => setSelectedAuthorId(r.id)} className="relative group flex flex-col items-center py-0.5">
                  <AvatarDisplay avatar={r.avatar} isActive={selectedAuthorId === r.id} color={r.color} fallbackIcon={r.icon} size="w-8 h-8" />
                </button>
              </div>
            ))}
            <button 
              onClick={() => setIsAddingParticipant(true)}
              className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:border-blue-500 hover:text-blue-500 transition-all shrink-0"
            >
              <i className="fa-solid fa-plus text-[10px]"></i>
            </button>
        </div>

        <div className="flex items-end space-x-2 px-2 pb-2">
          <div className="relative shrink-0 mb-1">
             <button onClick={() => setIsPickingSender(true)} className="transition-transform active:scale-90">
               <AvatarDisplay avatar={currentSender.avatar} fallbackIcon={currentSender.icon} size="w-11 h-11" isActive={senderPersonaId !== 'user'} color="orange" />
             </button>
          </div>

          <div className="flex-1 bg-gray-100 dark:bg-ios-darkSurface rounded-2xl px-4 py-2 flex flex-col min-h-[44px]">
            {selectedAuthorId !== 'user' && (
              <div className="flex items-center space-x-1 mb-1">
                <i className="fa-solid fa-wand-magic-sparkles text-[10px] text-orange-500"></i>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tight">{responders.find(r=>r.id===selectedAuthorId)?.name} focus</span>
              </div>
            )}
            <textarea 
              ref={inputRef} 
              value={inputText} 
              onChange={(e) => setInputText(e.target.value)} 
              onKeyDown={(e) => { if(e.key==='Enter' && !e.shiftKey){e.preventDefault(); handleSend();} }} 
              placeholder={senderPersonaId === 'user' ? (selectedAuthorId === 'user' ? "Type message..." : "Prompt AI...") : `Ghostwrite as ${currentSender.name}...`}
              className="bg-transparent w-full text-[16px] dark:text-white outline-none resize-none max-h-32 py-1" 
              rows={1} 
            />
          </div>
          <button onClick={handleSend} className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 ${(inputText.trim() || selectedAuthorId !== 'user') ? (senderPersonaId !== 'user' ? 'bg-purple-600 text-white shadow-lg' : selectedAuthorId === 'user' ? 'bg-blue-500 text-white scale-100' : 'bg-orange-500 text-white scale-105 shadow-lg shadow-orange-500/20') : 'bg-gray-200 dark:bg-gray-800 text-gray-400 scale-90'}`}>
            <i className={`fa-solid ${senderPersonaId !== 'user' ? 'fa-ghost' : selectedAuthorId === 'user' ? 'fa-arrow-up' : 'fa-wand-magic-sparkles'} text-lg`}></i>
          </button>
        </div>
      </footer>

      {/* SENDER SELECTION MODAL */}
      {isPickingSender && (
        <div className="absolute inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end justify-center" onClick={() => setIsPickingSender(false)}>
          <div className="w-full max-w-md bg-[#1c1c1e] rounded-t-[20px] shadow-2xl overflow-hidden flex flex-col max-h-[85%] modal-animate safe-bottom" onClick={e => e.stopPropagation()}>
            <div className="px-4 pt-3 pb-2 flex justify-between items-center border-b border-gray-800 bg-[#1c1c1e] sticky top-0 z-10">
              <span className="text-white font-bold text-lg">Send Message As...</span>
              <button onClick={() => setIsPickingSender(false)} className="w-8 h-8 rounded-full bg-[#2c2c2e] flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#3a3a3c] transition-colors">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            
            <div className="px-4 py-3 bg-[#1c1c1e]">
              <div className="bg-[#2c2c2e] rounded-xl flex items-center px-3 py-2">
                 <i className="fa-solid fa-magnifying-glass text-gray-500 text-sm mr-2"></i>
                 <input 
                   ref={searchInputRef}
                   type="text" 
                   value={senderSearch}
                   onChange={(e) => setSenderSearch(e.target.value)}
                   placeholder="Search persona..." 
                   className="bg-transparent text-[15px] text-white w-full outline-none placeholder-gray-500"
                 />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-6">
               <div className="flex flex-col">
                  {!senderSearch && (
                    <div 
                      onClick={() => { setSenderPersonaId('user'); setIsPickingSender(false); }}
                      className="flex items-center py-3 border-b border-gray-800 cursor-pointer group"
                    >
                       <AvatarDisplay avatar="" size="w-10 h-10" fallbackIcon="fa-user" />
                       <div className="ml-3 flex-1">
                          <div className="text-white font-semibold text-[16px]">Vladi Miro (You)</div>
                          <div className="text-gray-500 text-[13px]">personal account</div>
                       </div>
                       {senderPersonaId === 'user' && <i className="fa-solid fa-check text-blue-500 text-lg"></i>}
                    </div>
                  )}

                  {personaCandidates.map(p => (
                    <div 
                      key={p.id} 
                      onClick={() => { setSenderPersonaId(p.id); setIsPickingSender(false); }}
                      className="flex items-center py-3 border-b border-gray-800 cursor-pointer group"
                    >
                       <AvatarDisplay avatar={p.avatar} size="w-10 h-10" />
                       <div className="ml-3 flex-1 min-w-0 pr-2">
                          <div className="text-white font-semibold text-[16px] truncate">{p.name}</div>
                          <div className="text-gray-500 text-[13px] truncate">1 subscriber • {p.provider}</div>
                       </div>
                       {senderPersonaId === p.id && <i className="fa-solid fa-check text-blue-500 text-lg"></i>}
                    </div>
                  ))}
                  
                  {personaCandidates.length === 0 && senderSearch && (
                    <div className="py-8 text-center text-gray-500 text-sm">No personas found.</div>
                  )}
               </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD PARTICIPANT MODAL */}
      {isAddingParticipant && (
        <div className="absolute inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end justify-center" onClick={() => setIsAddingParticipant(false)}>
            <div className="w-full max-w-md bg-[#1c1c1e] rounded-t-[20px] shadow-2xl overflow-hidden flex flex-col max-h-[85%] modal-animate safe-bottom" onClick={e => e.stopPropagation()}>
                <div className="px-4 pt-3 pb-2 flex justify-between items-center border-b border-gray-800 bg-[#1c1c1e] sticky top-0 z-10">
                  <span className="text-white font-bold text-lg">Add Participant</span>
                  <button onClick={() => setIsAddingParticipant(false)} className="w-8 h-8 rounded-full bg-[#2c2c2e] flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#3a3a3c] transition-colors">
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>

                <div className="px-4 py-3 bg-[#1c1c1e]">
                  <div className="bg-[#2c2c2e] rounded-xl flex items-center px-3 py-2">
                     <i className="fa-solid fa-magnifying-glass text-gray-500 text-sm mr-2"></i>
                     <input 
                       ref={searchInputRef}
                       type="text" 
                       value={participantSearch}
                       onChange={(e) => setParticipantSearch(e.target.value)}
                       placeholder="Search assistant..." 
                       className="bg-transparent text-[15px] text-white w-full outline-none placeholder-gray-500"
                     />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 pb-6">
                  <div className="flex flex-col">
                    {participantCandidates.length > 0 ? participantCandidates.map(assistant => (
                      <div 
                        key={assistant.id} 
                        onClick={() => {
                          updateChat({ participantIds: [...(chat.participantIds||[]), assistant.id] });
                          // Optional: Keep open to add more, or close. Let's keep open for bulk add.
                        }}
                        className="flex items-center py-3 border-b border-gray-800 cursor-pointer active:bg-[#2c2c2e] transition-colors -mx-2 px-2 rounded-lg"
                      >
                         <AvatarDisplay avatar={assistant.avatar} size="w-10 h-10" />
                         <div className="ml-3 flex-1 min-w-0 pr-2">
                            <div className="text-white font-semibold text-[16px] truncate">{assistant.name}</div>
                            <div className="text-gray-500 text-[13px] truncate">{assistant.modelName} • {assistant.provider}</div>
                         </div>
                         <div className="w-6 h-6 rounded-full border border-gray-600 flex items-center justify-center text-transparent hover:border-blue-500 hover:text-blue-500 transition-all">
                           <i className="fa-solid fa-plus text-xs"></i>
                         </div>
                      </div>
                    )) : (
                      <div className="py-12 text-center text-gray-500">
                        <i className="fa-solid fa-user-slash text-2xl mb-2 opacity-50"></i>
                        <p className="text-sm">No available assistants found.</p>
                      </div>
                    )}
                  </div>
                </div>
            </div>
        </div>
      )}

      {showProfile && (
        <div className="absolute inset-0 z-50 bg-[#f2f2f7] dark:bg-ios-darkBg overflow-y-auto modal-animate flex flex-col pb-20">
          <header className="ios-blur bg-white/90 dark:bg-ios-darkBg/90 px-4 py-3 flex justify-between items-center border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
            <button onClick={() => setShowProfile(false)} className="text-blue-500 text-sm font-bold">Cancel</button>
            <h2 className="text-xs font-black uppercase tracking-[0.2em]">Context Settings</h2>
            <button onClick={handleSaveChanges} className="text-blue-500 font-black text-sm">Save</button>
          </header>
          <div className="p-4 space-y-6">
             <div className="flex flex-col items-center py-8 bg-white dark:bg-ios-darkSurface rounded-3xl border border-gray-100 dark:border-gray-800">
                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                   <AvatarDisplay avatar={editAvatar} size="w-24 h-24" isActive={true} />
                   <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full"><i className="fa-solid fa-camera text-white"></i></div>
                </div>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="mt-4 text-xl font-bold bg-transparent text-center dark:text-white outline-none" />
             </div>
             <section className="space-y-1">
                <label className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Engine</label>
                <div className="bg-white dark:bg-ios-darkSurface rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm divide-y dark:divide-gray-800">
                  <div className="p-4 flex items-center justify-between"><span className="text-sm dark:text-gray-300">Provider</span><select value={editProvider} onChange={(e) => { const p = e.target.value as ModelProvider; setEditProvider(p); setEditModel(MODEL_OPTIONS[p][0]); }} className="text-sm font-bold text-blue-500 bg-transparent outline-none appearance-none cursor-pointer text-right"><option value="gemini">GEMINI</option><option value="openai">OPENAI</option><option value="deepseek">DEEPSEEK</option></select></div>
                  <div className="p-4 flex items-center justify-between"><span className="text-sm dark:text-gray-300">Model</span><select value={editModel} onChange={(e) => setEditModel(e.target.value)} className="text-sm font-bold text-blue-500 bg-transparent outline-none appearance-none cursor-pointer text-right">{MODEL_OPTIONS[editProvider].map(m => (<option key={m} value={m}>{m}</option>))}</select></div>
                </div>
             </section>
             <section className="space-y-1">
                <div className="flex justify-between px-4 items-center"><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Instructions</label><button onClick={handleImprovePrompt} className="text-[10px] font-black text-purple-500 uppercase tracking-tight"><i className="fa-solid fa-wand-magic-sparkles mr-1"></i>Improve</button></div>
                <div className="bg-white dark:bg-ios-darkSurface rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm"><textarea value={editPrompt} onChange={e => setEditPrompt(e.target.value)} className="w-full px-4 py-4 text-sm outline-none bg-transparent min-h-[140px] resize-none dark:text-white leading-relaxed" /></div>
             </section>
             <section className="space-y-1">
                <label className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Creativity (Temp)</label>
                <div className="bg-white dark:bg-ios-darkSurface p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                  <div className="flex justify-between items-center mb-3"><span className="text-[10px] font-black text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded uppercase tracking-tighter">{editTemp.toFixed(2)}</span></div>
                  <input type="range" min="0" max="1.5" step="0.05" value={editTemp} onChange={(e) => setEditTemp(parseFloat(e.target.value))} className="w-full accent-blue-500" />
                </div>
             </section>
             <section className="space-y-2">
                <div className="flex justify-between items-center px-4"><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Active Entities</label><button onClick={() => setIsAddingParticipant(true)} className="text-[10px] font-black text-blue-500 uppercase">Summon</button></div>
                <div className="bg-white dark:bg-ios-darkSurface rounded-2xl border border-gray-100 dark:border-gray-800 divide-y dark:divide-gray-800 overflow-hidden">
                    <div className="flex items-center px-4 py-3"><AvatarDisplay avatar={chat.avatar} size="w-8 h-8" isActive={true} /><div className="ml-3 flex-1"><div className="text-xs font-bold dark:text-white">{chat.name} <span className="text-[8px] text-blue-500 ml-1 font-black">LEAD</span></div><div className="text-[9px] text-gray-400 uppercase">{chat.provider} • {chat.modelName}</div></div><i className="fa-solid fa-crown text-[10px] text-yellow-500"></i></div>
                    {participants.map(p => (<div key={p.id} className="flex items-center px-4 py-3"><AvatarDisplay avatar={p.avatar} size="w-8 h-8" isActive={true} color="orange" /><div className="ml-3 flex-1"><div className="text-xs font-bold dark:text-white">{p.name}</div><div className="text-[9px] text-gray-400 uppercase">{p.provider}</div></div><button onClick={() => updateChat({ participantIds: (chat.participantIds || []).filter(id => id !== p.id) })} className="text-red-500 p-2"><i className="fa-solid fa-circle-minus"></i></button></div>))}
                </div>
             </section>
             <div className="bg-white dark:bg-ios-darkSurface rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm divide-y dark:divide-gray-800 overflow-hidden">
                <button onClick={onDuplicateChat} className="w-full py-4 text-sm font-bold text-blue-500 active:bg-gray-50">Duplicate Thread</button>
                <button onClick={()=>{if(confirm("Archive thread?")) onArchiveChat();}} className="w-full py-4 text-sm font-bold text-gray-500 active:bg-gray-50">Archive Conversation</button>
                <button onClick={()=>{if(confirm("Delete thread?")) onDeleteChat();}} className="w-full py-4 text-sm font-bold text-red-500 active:bg-red-50">Destroy Thread</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatWindow;
