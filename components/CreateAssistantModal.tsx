
import React, { useState, useRef, useEffect } from 'react';
import { Chat, ModelProvider, AppSettings } from '../types';
import { MODEL_OPTIONS } from '../constants';
import { getAIResponse, createRemoteAssistant } from '../services/aiService';

interface Props {
  onClose: () => void;
  onCreate: (chat: Chat) => void;
  settings: AppSettings;
}

const CreateAssistantModal: React.FC<Props> = ({ onClose, onCreate, settings }) => {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [avatar, setAvatar] = useState(''); 
  const [provider, setProvider] = useState<ModelProvider>(settings.defaultProvider);
  const [model, setModel] = useState(MODEL_OPTIONS[settings.defaultProvider][0]);
  const [temperature, setTemperature] = useState(0.7);
  const [tags, setTags] = useState<string[]>(['#custom']);
  const [newTagInput, setNewTagInput] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImproving, setIsImproving] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const handleImprovePrompt = async () => {
    if (isImproving || !prompt.trim()) return;
    setIsImproving(true);
    try {
      const improved = await getAIResponse(
        'gemini', 
        'gemini-3-flash-preview', 
        "You are an expert prompt engineer. Refine the user's instructions into a professional, structured system prompt for an AI assistant. Output ONLY the refined prompt text without any explanations or formatting.", 
        [{ id: '1', text: prompt, sender: 'user', timestamp: Date.now() }], 
        '', 
        0.8
      );
      setPrompt(improved.trim());
    } catch (e) {
      console.error("Failed to improve prompt:", e);
      alert("Failed to refine prompt automatically.");
    } finally {
      setIsImproving(false);
    }
  };

  const addTag = () => {
    const tag = newTagInput.trim().replace(/^#/, '');
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setNewTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleSave = async () => {
    if (!name.trim() || !prompt.trim()) return;

    setIsSyncing(true);
    let remoteId = null;

    try {
      const apiKey = provider === 'openai' ? settings.openaiKey : provider === 'deepseek' ? settings.deepseekKey : '';
      
      if (provider === 'openai' && apiKey) {
        const result = await createRemoteAssistant(provider, name, prompt, model, apiKey);
        if ('error' in result) {
          if (!confirm(`Warning: Could not sync with OpenAI (${result.error}). Create local version instead?`)) {
             setIsSyncing(false);
             return;
          }
        } else {
          remoteId = result.id;
        }
      }

      const newChat: Chat = {
        id: remoteId || `custom-${Date.now()}`,
        name: name.trim(),
        avatar: avatar,
        provider: provider,
        modelName: model,
        systemPrompt: prompt.trim(),
        temperature: temperature,
        isPinned: false,
        messages: [],
        tags: tags.map(t => t.startsWith('#') ? t : `#${t}`),
        lastMessage: remoteId ? "Assistant successfully synced with OpenAI cloud." : "Local assistant created.",
        lastTimestamp: Date.now()
      };

      onCreate(newChat);
    } catch (e) {
      console.error("Creation failed:", e);
      alert("Failed to create assistant.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#f2f2f7] dark:bg-ios-darkBg overflow-y-auto modal-animate flex flex-col pb-10">
      <header className="ios-blur bg-white/90 dark:bg-ios-darkBg/90 px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50">
        <button onClick={onClose} className="text-blue-500 font-medium active:opacity-50">Cancel</button>
        <h2 className="text-lg font-bold text-black dark:text-white">New Assistant</h2>
        <button 
          onClick={handleSave} 
          disabled={!name.trim() || !prompt.trim() || isSyncing}
          className={`font-bold transition-opacity ${(!name.trim() || !prompt.trim() || isSyncing) ? 'text-gray-300' : 'text-blue-500 active:opacity-50'}`}
        >
          {isSyncing ? 'Syncing...' : 'Create'}
        </button>
      </header>

      <div className="p-4 space-y-6 flex-1">
        {/* Avatar Section */}
        <section className="flex flex-col items-center pt-2">
          <div 
            className="w-24 h-24 rounded-full flex items-center justify-center border border-gray-100 dark:border-gray-800 shadow-md mb-3 relative group cursor-pointer bg-white dark:bg-ios-darkSurface overflow-hidden" 
            onClick={() => fileInputRef.current?.click()}
          >
            {avatar ? (
              <img src={avatar} className="w-full h-full object-cover" alt="preview" />
            ) : (
              <i className="fa-solid fa-user text-4xl text-gray-300 dark:text-gray-600"></i>
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <i className="fa-solid fa-camera text-white text-xl"></i>
            </div>
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileChange} 
          />
          <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-black text-blue-500 uppercase tracking-widest active:opacity-50">Set Photo</button>
        </section>

        {/* Basic Info */}
        <section className="space-y-1">
          <label className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">General</label>
          <div className="bg-white dark:bg-ios-darkSurface rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <input 
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Display Name"
              className="w-full px-4 py-4 text-sm outline-none bg-transparent dark:text-white"
            />
          </div>
        </section>

        {/* Categories / Tags */}
        <section className="space-y-1">
          <label className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Categories</label>
          <div className="bg-white dark:bg-ios-darkSurface p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm space-y-3">
            <div className="flex flex-wrap gap-2">
              {tags.map(t => (
                <span key={t} className="px-3 py-1 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-900/20 text-blue-500 flex items-center border border-blue-100 dark:border-blue-800/30">
                  {t.startsWith('#') ? t : `#${t}`}
                  <button onClick={() => removeTag(t)} className="ml-2 hover:text-red-500">
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </span>
              ))}
            </div>
            <div className="flex space-x-2">
              <input 
                type="text" 
                value={newTagInput} 
                onChange={e => setNewTagInput(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && addTag()}
                placeholder="Add tag (e.g. work)..." 
                className="flex-1 bg-transparent border-b border-gray-100 dark:border-gray-800 text-sm py-1 dark:text-white focus:border-blue-500 outline-none transition-colors" 
              />
              <button onClick={addTag} className="text-blue-500 font-bold text-xs active:opacity-50">ADD</button>
            </div>
          </div>
        </section>

        {/* Engine Settings */}
        <section className="space-y-1">
          <label className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Engine</label>
          <div className="bg-white dark:bg-ios-darkSurface rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm divide-y dark:divide-gray-800">
            <div className="p-4 flex items-center justify-between">
              <span className="text-sm dark:text-gray-300">Provider</span>
              <select 
                value={provider}
                onChange={(e) => {
                  const p = e.target.value as ModelProvider;
                  setProvider(p);
                  setModel(MODEL_OPTIONS[p][0]);
                }}
                className="text-sm font-bold text-blue-500 bg-transparent outline-none appearance-none cursor-pointer text-right"
              >
                <option value="gemini">GEMINI</option>
                <option value="openai">OPENAI</option>
                <option value="deepseek">DEEPSEEK</option>
              </select>
            </div>
            <div className="p-4 flex items-center justify-between">
              <span className="text-sm dark:text-gray-300">Model</span>
              <select 
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="text-sm font-bold text-blue-500 bg-transparent outline-none appearance-none cursor-pointer text-right"
              >
                {MODEL_OPTIONS[provider].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Instructions */}
        <section className="space-y-1">
          <div className="flex justify-between px-4 items-center">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Instructions</label>
            <button 
              onClick={handleImprovePrompt} 
              disabled={isImproving || !prompt.trim()} 
              className={`text-[10px] font-black uppercase tracking-tight transition-all ${isImproving || !prompt.trim() ? 'text-gray-300' : 'text-purple-500 active:scale-95'}`}
            >
              <i className={`fa-solid ${isImproving ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'} mr-1`}></i>
              {isImproving ? 'Improving...' : 'Improve'}
            </button>
          </div>
          <div className="bg-white dark:bg-ios-darkSurface rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Define assistant behavior, knowledge, and style..."
              className="w-full px-4 py-4 text-sm outline-none bg-transparent min-h-[140px] resize-none dark:text-white leading-relaxed"
            />
          </div>
          <p className="px-4 text-[9px] text-gray-400 font-medium italic">Describe the role, and use 'Improve' for a professional prompt.</p>
        </section>

        {/* Creativity Control */}
        <section className="space-y-1">
          <label className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Temperature</label>
          <div className="bg-white dark:bg-ios-darkSurface p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-black text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded uppercase tracking-tighter">Value: {temperature.toFixed(2)}</span>
            </div>
            <input 
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-[9px] text-gray-400 font-black mt-2 uppercase tracking-widest">
              <span>Predictable</span>
              <span>Creative</span>
            </div>
          </div>
        </section>

        {provider === 'openai' && (
          <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/20 rounded-2xl p-4 flex items-start space-x-3">
            <i className="fa-solid fa-cloud-arrow-up text-blue-400 mt-0.5"></i>
            <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-relaxed font-medium">
              This assistant will be synced with your <span className="font-bold">OpenAI Cloud</span> account.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateAssistantModal;
