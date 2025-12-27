
import React, { useState } from 'react';
import { Chat, TagFolder } from '../types';

interface Props {
  onClose: () => void;
  onCreate: (chat: Chat) => void;
  availableAssistants: Chat[];
}

const CreateGroupModal: React.FC<Props> = ({ onClose, onCreate, availableAssistants }) => {
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [topic, setTopic] = useState('');

  const toggleAssistant = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleCreate = () => {
    if (!name.trim() || selectedIds.length < 1) return;

    const newGroup: Chat = {
      id: `group-${Date.now()}`,
      name: name.trim(),
      avatar: '',
      provider: 'gemini', // Group context usually defaults or uses participants' own
      modelName: 'multi-context',
      systemPrompt: topic || "Group discussion between AI assistants.",
      isPinned: false,
      messages: [],
      tags: ['#group'],
      lastMessage: "Group chat created.",
      lastTimestamp: Date.now(),
      isGroup: true,
      participantIds: selectedIds
    };

    onCreate(newGroup);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#f2f2f7] dark:bg-ios-darkBg overflow-y-auto modal-animate flex flex-col">
      <header className="ios-blur bg-white/90 dark:bg-ios-darkBg/90 px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <button onClick={onClose} className="text-blue-500 font-medium">Cancel</button>
        <h2 className="text-lg font-bold text-black dark:text-white">AI Arena</h2>
        <button 
          onClick={handleCreate}
          disabled={!name.trim() || selectedIds.length < 1}
          className={`font-bold ${(!name.trim() || selectedIds.length < 1) ? 'text-gray-300' : 'text-blue-500'}`}
        >
          Create
        </button>
      </header>

      <div className="p-4 space-y-6">
        <section className="space-y-1">
          <label className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Group Settings</label>
          <div className="bg-white dark:bg-ios-darkSurface rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden divide-y dark:divide-gray-800">
            <input 
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Arena Name (e.g. Philosophical Debate)"
              className="w-full px-4 py-4 text-sm outline-none bg-transparent dark:text-white"
            />
            <textarea 
              value={topic} onChange={e => setTopic(e.target.value)}
              placeholder="What should they talk about? (Topic/Rules)"
              className="w-full px-4 py-4 text-sm outline-none bg-transparent dark:text-white min-h-[100px]"
            />
          </div>
        </section>

        <section className="space-y-2">
          <label className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Choose Participants ({selectedIds.length})</label>
          <div className="bg-white dark:bg-ios-darkSurface rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden divide-y dark:divide-gray-800">
            {availableAssistants.filter(a => !a.isGroup).map(assistant => (
              <div 
                key={assistant.id} 
                onClick={() => toggleAssistant(assistant.id)}
                className="flex items-center px-4 py-3 cursor-pointer active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-ios-darkSurface flex items-center justify-center mr-3 border dark:border-gray-700 overflow-hidden">
                  {assistant.avatar ? <img src={assistant.avatar} className="w-full h-full object-cover" /> : <i className="fa-solid fa-user text-gray-400 text-sm"></i>}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold dark:text-white">{assistant.name}</div>
                  <div className="text-[10px] text-gray-400 uppercase">{assistant.provider} • {assistant.modelName}</div>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedIds.includes(assistant.id) ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-200 dark:border-gray-700'}`}>
                  {selectedIds.includes(assistant.id) && <i className="fa-solid fa-check text-[10px]"></i>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default CreateGroupModal;
