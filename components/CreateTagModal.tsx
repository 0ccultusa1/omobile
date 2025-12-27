
import React, { useState, useRef, useEffect } from 'react';
import { TagFolder } from '../types';

interface Props {
  onClose: () => void;
  onCreate: (tag: TagFolder) => void;
}

const EMOJI_SET = ['💬', '📁', '💼', '🏠', '🎓', '🛠️', '✈️', '🎨', '🛒', '🎮', '💡', '🎵', '📍', '⭐', '📱'];

const CreateTagModal: React.FC<Props> = ({ onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [emoji, setEmoji] = useState('📁');
  const [isPinned, setIsPinned] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const handleCreate = () => {
    const cleanName = name.trim();
    if (!cleanName) return;
    if (cleanName.toLowerCase() === 'archived') {
        alert("The 'Archive' folder is reserved for archived chats.");
        return;
    }
    onCreate({ id: `tag-${Date.now()}`, name: cleanName, description: desc, emoji, isPinned });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreate();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#f2f2f7] dark:bg-ios-darkBg overflow-y-auto modal-animate flex flex-col">
      <header className="ios-blur bg-white/90 dark:bg-ios-darkBg/90 px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <button onClick={onClose} className="text-blue-500 font-medium">Cancel</button>
        <h2 className="text-lg font-bold text-black dark:text-white">New Folder</h2>
        <button 
          onClick={handleCreate}
          disabled={!name.trim()}
          className={`font-bold ${!name.trim() ? 'text-gray-300' : 'text-blue-500'}`}
        >
          Create
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
          <label className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Details</label>
          <div className="bg-white dark:bg-ios-darkSurface rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden divide-y dark:divide-gray-800">
            <input 
              ref={nameInputRef}
              type="text" value={name} onChange={e => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Folder Name (e.g. Work)"
              className="w-full px-4 py-4 text-sm outline-none bg-transparent dark:text-white"
            />
            <input 
              type="text" value={desc} onChange={e => setDesc(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Description (Optional)"
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
      </div>
    </div>
  );
};

export default CreateTagModal;
