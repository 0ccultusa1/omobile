
import React, { useState, useRef, useEffect } from 'react';
import { TagFolder, Chat } from '../types';

interface Props {
  tag: TagFolder;
  allChats: Chat[];
  onClose: () => void;
  onUpdate: (tag: TagFolder) => void;
  onDelete: (id: string) => void;
  onUpdateChat: (chatId: string, updates: Partial<Chat>) => void;
}

const EMOJI_SET = ['💬', '📁', '💼', '🏠', '🎓', '🛠️', '✈️', '🎨', '🛒', '🎮', '💡', '🎵', '📍', '⭐', '📱'];

const EditTagModal: React.FC<Props> = ({ tag, allChats, onClose, onUpdate, onDelete, onUpdateChat }) => {
  const [name, setName] = useState(tag.name);
  const [desc, setDesc] = useState(tag.description);
  const [emoji, setEmoji] = useState(tag.emoji);
  const [isPinned, setIsPinned] = useState(tag.isPinned);
  const [searchMember, setSearchMember] = useState('');

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const tagNameNormalized = tag.name.toLowerCase();
  
  const currentMembers = allChats.filter(c => 
    c.tags.some(t => t.toLowerCase() === tagNameNormalized || t.toLowerCase() === `#${tagNameNormalized}`)
  );

  const nonMembers = allChats.filter(c => 
    !c.tags.some(t => t.toLowerCase() === tagNameNormalized || t.toLowerCase() === `#${tagNameNormalized}`) &&
    c.name.toLowerCase().includes(searchMember.toLowerCase()) &&
    !c.tags.includes('#archived')
  );

  const handleSave = () => {
    const cleanName = name.trim();
    if (!cleanName) return;
    if (cleanName.toLowerCase() === 'archived') {
        alert("The 'Archive' folder is reserved for archived chats.");
        return;
    }
    onUpdate({ ...tag, name: cleanName, description: desc, emoji, isPinned });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  };

  const addChatToFolder = (chatId: string) => {
    const chat = allChats.find(c => c.id === chatId);
    if (chat) {
      onUpdateChat(chatId, { tags: [...chat.tags, tag.name] });
    }
  };

  const removeChatFromFolder = (chatId: string) => {
    const chat = allChats.find(c => c.id === chatId);
    if (chat) {
      onUpdateChat(chatId, { 
        tags: chat.tags.filter(t => t.toLowerCase() !== tagNameNormalized && t.toLowerCase() !== `#${tagNameNormalized}`) 
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#f2f2f7] dark:bg-ios-darkBg overflow-y-auto modal-animate flex flex-col pb-20">
      <header className="ios-blur bg-white/90 dark:bg-ios-darkBg/90 px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <button onClick={onClose} className="text-blue-500 font-medium">Cancel</button>
        <h2 className="text-lg font-bold text-black dark:text-white">Edit Folder</h2>
        <button 
          onClick={handleSave}
          disabled={!name.trim()}
          className={`font-bold ${!name.trim() ? 'text-gray-300' : 'text-blue-500'}`}
        >
          Save
        </button>
      </header>

      <div className="p-4 space-y-6">
        <div className="flex flex-col items-center py-6">
          <div className="text-6xl p-4 bg-white dark:bg-ios-darkSurface rounded-3xl shadow-inner mb-4">{emoji}</div>
          <div className="flex flex-wrap justify-center gap-3">
            {EMOJI_SET.map(e => (
              <button key={e} onClick={() => setEmoji(e)} className={`text-2xl p-2 rounded-xl border-2 transition-all ${emoji === e ? 'border-blue-500 scale-110' : 'border-transparent'}`}>{e}</button>
            ))}
          </div>
        </div>

        <section className="space-y-1">
          <label className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Metadata</label>
          <div className="bg-white dark:bg-ios-darkSurface rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden divide-y dark:divide-gray-800">
            <input 
              ref={nameInputRef}
              type="text" value={name} onChange={e => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-4 py-4 text-sm outline-none bg-transparent dark:text-white"
            />
            <input 
              type="text" value={desc} onChange={e => setDesc(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-4 py-4 text-sm outline-none bg-transparent dark:text-white"
            />
          </div>
        </section>

        <section className="flex items-center justify-between px-4 py-4 bg-white dark:bg-ios-darkSurface rounded-2xl border border-gray-100 dark:border-gray-800">
          <span className="text-sm font-bold dark:text-gray-300">Pin Folder</span>
          <input 
            type="checkbox" checked={isPinned} onChange={e => setIsPinned(e.target.checked)}
            className="w-5 h-5 accent-blue-500"
          />
        </section>

        <section className="space-y-2">
          <label className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Current Members ({currentMembers.length})</label>
          <div className="bg-white dark:bg-ios-darkSurface rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden divide-y dark:divide-gray-800">
            {currentMembers.map(chat => (
              <div key={chat.id} className="flex items-center px-4 py-3">
                <div className="w-8 h-8 rounded-full border dark:border-gray-800 mr-3 bg-[#1d2733] flex items-center justify-center overflow-hidden">
                   {chat.avatar ? <img src={chat.avatar} className="w-full h-full object-cover" /> : <i className="fa-solid fa-user text-[#4e5c6e] text-sm"></i>}
                </div>
                <span className="flex-1 text-sm font-bold dark:text-white">{chat.name}</span>
                <button onClick={() => removeChatFromFolder(chat.id)} className="text-red-500 p-2">
                  <i className="fa-solid fa-circle-minus"></i>
                </button>
              </div>
            ))}
            {currentMembers.length === 0 && (
              <div className="p-4 text-center text-xs text-gray-400">Folder is empty.</div>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <label className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Add Assistants</label>
          <div className="bg-white dark:bg-ios-darkSurface rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="p-2 border-b border-gray-100 dark:border-gray-800">
              <div className="bg-gray-50 dark:bg-ios-darkBg rounded-lg flex items-center px-3 py-2">
                <i className="fa-solid fa-magnifying-glass text-gray-400 text-xs mr-2"></i>
                <input 
                  type="text" 
                  value={searchMember}
                  onChange={(e) => setSearchMember(e.target.value)}
                  placeholder="Search assistants..."
                  className="bg-transparent text-xs w-full outline-none dark:text-white"
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y dark:divide-gray-800">
              {nonMembers.map(chat => (
                <div key={chat.id} className="flex items-center px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <div className="w-8 h-8 rounded-full border dark:border-gray-800 mr-3 bg-[#1d2733] flex items-center justify-center overflow-hidden">
                    {chat.avatar ? <img src={chat.avatar} className="w-full h-full object-cover" /> : <i className="fa-solid fa-user text-[#4e5c6e] text-sm"></i>}
                  </div>
                  <span className="flex-1 text-sm dark:text-white truncate">{chat.name}</span>
                  <button onClick={() => addChatToFolder(chat.id)} className="text-blue-500 p-2">
                    <i className="fa-solid fa-circle-plus"></i>
                  </button>
                </div>
              ))}
              {nonMembers.length === 0 && (
                <div className="p-4 text-center text-xs text-gray-400">No assistants available to add.</div>
              )}
            </div>
          </div>
        </section>

        <button 
          onClick={() => { if(confirm("Delete this folder? Assistants will not be deleted.")) onDelete(tag.id); }}
          className="w-full py-4 text-red-500 font-bold bg-white dark:bg-ios-darkSurface rounded-2xl border border-red-100 dark:border-red-900/30 shadow-sm active:bg-red-50"
        >
          Delete Folder
        </button>
      </div>
    </div>
  );
};

export default EditTagModal;
