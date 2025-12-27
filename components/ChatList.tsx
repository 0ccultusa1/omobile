
import React, { useState, useEffect } from 'react';
import { Chat } from '../types';

interface Props {
  chats: Chat[];
  allChats: Chat[];
  isFiltered?: boolean;
  isArchivedView?: boolean;
  shrunk?: boolean;
  activeParentId?: string | null;
  onSelectChat: (id: string) => void;
  onTogglePin: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onArchiveChat: (id: string) => void;
  onUnarchiveChat: (id: string) => void;
  onManageTags: (id: string) => void;
  onDuplicateChat: (id: string) => void;
}

const AvatarDisplay: React.FC<{ avatar: string, size?: string, isArchived?: boolean, children?: React.ReactNode }> = ({ avatar, size = "w-12 h-12", isArchived = false, children }) => {
  const hasImage = avatar && (avatar.startsWith('data:') || avatar.startsWith('http'));
  
  return (
    <div className={`${size} rounded-full overflow-hidden border border-gray-100 dark:border-gray-800 shadow-sm shrink-0 relative bg-[#1d2733]`}>
      {hasImage ? (
        <img src={avatar} className={`h-full w-full object-cover ${isArchived ? 'grayscale' : ''}`} alt="" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[#4e5c6e]">
          <i className={`fa-solid fa-user ${size.includes('w-12') ? 'text-2xl' : size.includes('w-9') ? 'text-lg' : 'text-xs'}`}></i>
        </div>
      )}
      {children}
    </div>
  );
};

const GroupAvatar: React.FC<{ chat: Chat, allChats: Chat[], size?: string }> = ({ chat, allChats, size = "w-12 h-12" }) => {
  const participantIds = chat.participantIds || [];
  const participants = allChats.filter(c => participantIds.includes(c.id));
  const displayCount = 3;
  const visibleParticipants = participants.slice(0, displayCount);
  const remaining = participants.length > displayCount ? participants.length - (displayCount - 1) : 0;

  return (
    <div className={`relative ${size} shrink-0 flex flex-col items-center`}>
      <div className="z-10 shadow-lg -translate-y-1">
        <AvatarDisplay avatar={chat.avatar} size="w-9 h-9" />
      </div>
      
      <div className="absolute bottom-0 flex -space-x-1.5 z-20">
        {visibleParticipants.map((p, idx) => {
          const isLastWithRemaining = remaining > 0 && idx === displayCount - 1;
          return (
            <div key={p.id} className="ring-2 ring-white dark:ring-ios-darkBg rounded-full overflow-hidden bg-[#1d2733]">
              <AvatarDisplay avatar={p.avatar} size="w-5 h-5">
                {isLastWithRemaining && (
                  <div className="absolute inset-0 bg-blue-600/90 flex items-center justify-center text-[7px] font-black text-white">
                    +{remaining}
                  </div>
                )}
              </AvatarDisplay>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ChatList: React.FC<Props> = ({ 
  chats, 
  allChats,
  isFiltered = false, 
  isArchivedView = false,
  shrunk = false,
  activeParentId = null,
  onSelectChat, 
  onTogglePin, 
  onDeleteChat, 
  onArchiveChat,
  onUnarchiveChat,
  onManageTags,
  onDuplicateChat
}) => {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const sortedChats = [...chats].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return (b.lastTimestamp || 0) - (a.lastTimestamp || 0);
  });

  const toggleMenu = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setActiveMenuId(activeMenuId === id ? null : id);
  };

  useEffect(() => {
    const handleScroll = () => setActiveMenuId(null);
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, []);

  return (
    <div className={`bg-white dark:bg-ios-darkBg flex flex-col transition-all duration-300 w-full ${shrunk ? 'items-center py-4' : ''}`}>
      {activeMenuId && (
        <div 
          className="fixed inset-0 z-20" 
          onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); }}
        ></div>
      )}

      {sortedChats.map(chat => {
        const isMenuOpen = activeMenuId === chat.id;
        const isActiveContext = activeParentId === chat.id;
        const hasChildren = !isArchivedView && allChats.some(s => s.parentId === chat.id && !s.tags.includes('#archived'));
        const isSubChat = !!chat.parentId;
        const hasDraft = chat.draft && chat.draft.trim().length > 0;
        const isMulti = (chat.participantIds?.length || 0) > 0 || chat.isGroup;
        
        return (
          <div key={chat.id} className="w-full">
            <div 
              className={`group relative flex items-center px-4 py-3 cursor-pointer transition-all duration-300 border-b border-gray-100 dark:border-gray-800/40 bg-white dark:bg-ios-darkBg active:bg-gray-100 dark:active:bg-gray-800/50 ${shrunk ? 'justify-center' : ''}`}
              onClick={() => onSelectChat(chat.id)}
            >
              <div className="relative shrink-0 flex items-center justify-center w-12 h-12">
                {isMulti ? <GroupAvatar chat={chat} allChats={allChats} size="w-12 h-12" /> : <AvatarDisplay avatar={chat.avatar} size="w-12 h-12" isArchived={isArchivedView} />}
                {chat.isPinned && !shrunk && (
                  <div className="absolute -top-1 -right-1 bg-blue-500 text-white w-5 h-5 rounded-full flex items-center justify-center border-2 border-white dark:border-ios-darkBg shadow-sm z-30">
                    <i className="fa-solid fa-thumbtack text-[8px]"></i>
                  </div>
                )}
              </div>
              
              {!shrunk && (
                <div className="ml-3 flex-1 overflow-hidden min-w-0">
                  <div className="flex justify-between items-baseline">
                    <h3 className={`font-bold truncate pr-2 text-[15px] ${isSubChat ? 'text-gray-600 dark:text-gray-300 italic' : 'text-gray-900 dark:text-white'}`}>
                      {chat.name}
                    </h3>
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-tighter shrink-0">
                      {chat.lastTimestamp ? new Date(chat.lastTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <div className="flex items-center mt-0.5 min-w-0">
                    <p className={`text-[13px] truncate font-medium ${hasDraft ? 'text-blue-500 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
                      {hasDraft && <span className="font-black text-[11px] uppercase tracking-tighter mr-1">Draft:</span>}
                      {hasDraft ? chat.draft : (chat.lastMessage || chat.systemPrompt.slice(0, 40) + '...')}
                    </p>
                  </div>
                </div>
              )}

              {!shrunk && (
                <div className="flex items-center ml-2 shrink-0">
                  <button 
                    onClick={(e) => toggleMenu(e, chat.id)}
                    className={`p-2 transition-colors ${isMenuOpen ? 'text-blue-500' : 'text-gray-300 dark:text-gray-600 hover:text-blue-500'}`}
                  >
                    <i className="fa-solid fa-ellipsis-vertical text-[16px]"></i>
                  </button>

                  {isMenuOpen && (
                    <div className="absolute right-0 mt-8 w-48 bg-white/95 dark:bg-ios-darkSurface/95 ios-blur rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 z-40 overflow-hidden py-1 pop-in">
                      {!isArchivedView && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); onTogglePin(chat.id); setActiveMenuId(null); }}
                          className="w-full text-left px-4 py-3 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center"
                        >
                          <i className={`fa-solid fa-thumbtack w-6 ${chat.isPinned ? 'text-blue-500' : 'text-gray-400'}`}></i>
                          {chat.isPinned ? 'Unpin' : 'Pin'}
                        </button>
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); onDuplicateChat(chat.id); setActiveMenuId(null); }}
                        className="w-full text-left px-4 py-3 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center"
                      >
                        <i className="fa-solid fa-copy w-6 text-blue-500"></i> Duplicate
                      </button>
                      
                      {isArchivedView ? (
                        <button 
                          onClick={(e) => { e.stopPropagation(); onUnarchiveChat(chat.id); setActiveMenuId(null); }}
                          className="w-full text-left px-4 py-3 text-xs font-bold text-blue-500 hover:bg-blue-50 flex items-center border-t border-gray-100 dark:border-gray-800"
                        >
                          <i className="fa-solid fa-arrow-up-from-bracket w-6 text-blue-500"></i> Unarchive
                        </button>
                      ) : (
                        <button 
                          onClick={(e) => { e.stopPropagation(); onArchiveChat(chat.id); setActiveMenuId(null); }}
                          className="w-full text-left px-4 py-3 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 flex items-center border-t border-gray-100 dark:border-gray-800"
                        >
                          <i className="fa-solid fa-box-archive w-6 text-gray-400"></i> Archive
                        </button>
                      )}

                      <button 
                        onClick={(e) => { e.stopPropagation(); if (confirm(`Delete chat with ${chat.name}?`)) onDeleteChat(chat.id); setActiveMenuId(null); }}
                        className="w-full text-left px-4 py-3 text-xs font-bold text-red-500 hover:bg-red-50 flex items-center border-t border-gray-100 dark:border-gray-800"
                      >
                        <i className="fa-solid fa-trash w-6"></i> Delete Chat
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {sortedChats.length === 0 && (
        <div className="flex flex-col items-center justify-center p-12 text-center h-[30vh]">
          <i className="fa-solid fa-comments text-3xl text-gray-200 mb-4"></i>
          <p className="text-xs text-gray-400 uppercase tracking-widest font-bold opacity-40">{isArchivedView ? 'Archive is empty' : 'No chats found'}</p>
        </div>
      )}
    </div>
  );
};

export default ChatList;
