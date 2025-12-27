
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { AppSettings, Chat, AppTheme, ModelProvider } from '../types';
import { discoverRemoteOccultPersonas } from '../services/aiService';

interface Props {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  chats: Chat[];
  onImportMany: (newChats: Chat[]) => void;
  onUnarchiveChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onClose: () => void;
}

const SettingsView: React.FC<Props> = ({ settings, setSettings, chats, onImportMany, onUnarchiveChat, onDeleteChat, onClose }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [scanStatus, setScanStatus] = useState<{ type: 'idle' | 'success' | 'error' | 'loading', message: string }>({
    type: 'idle',
    message: ''
  });

  const lastScannedKeysRef = useRef("");
  const archivedChats = useMemo(() => chats.filter(c => c.tags.includes('#archived')), [chats]);

  const handleRealScan = useCallback(async (isAuto = false) => {
    if (!settings.openaiKey && !settings.deepseekKey && !process.env.API_KEY) {
      if (!isAuto) {
        setScanStatus({ type: 'error', message: 'Please set at least one API Key below to sync assistants.' });
      }
      return;
    }

    setIsScanning(true);
    setScanStatus({ type: 'loading', message: isAuto ? 'Auto-syncing assistants...' : 'Syncing with cloud providers...' });
    
    try {
      const discovered = await discoverRemoteOccultPersonas({
        openaiKey: settings.openaiKey,
        deepseekKey: settings.deepseekKey
      });
      
      if (discovered.length > 0) {
        const newChats: Chat[] = discovered.map((d, i) => ({
          id: d.id || `remote-${Date.now()}-${i}`,
          name: d.name!,
          avatar: d.avatar!,
          provider: d.provider!,
          modelName: d.modelName!,
          systemPrompt: d.systemPrompt!,
          isPinned: false,
          messages: [],
          tags: d.tags || ['#synced'],
          lastMessage: "Assistant imported from cloud sync.",
          lastTimestamp: Date.now()
        }));

        onImportMany(newChats);
        setScanStatus({ 
          type: 'success', 
          message: `Successfully synced ${newChats.length} assistants.` 
        });
      } else {
        setScanStatus({ 
          type: 'idle', 
          message: isAuto ? '' : 'No new cloud-based assistants found.' 
        });
      }
    } catch (e: any) {
      setScanStatus({ 
        type: 'error', 
        message: e.message || 'Sync failed.' 
      });
    } finally {
      setIsScanning(false);
    }
  }, [settings.openaiKey, settings.deepseekKey, onImportMany]);

  // Auto-sync effect: triggers when keys are entered or changed
  useEffect(() => {
    const hasOpenAI = settings.openaiKey && settings.openaiKey.length > 10;
    const hasDeepSeek = settings.deepseekKey && settings.deepseekKey.length > 10;
    
    if (!hasOpenAI && !hasDeepSeek) return;

    const currentKeys = `${settings.openaiKey}:${settings.deepseekKey}`;
    // Skip if we already auto-scanned these exact keys
    if (currentKeys === lastScannedKeysRef.current) return;

    const timer = setTimeout(() => {
      lastScannedKeysRef.current = currentKeys;
      handleRealScan(true);
    }, 1500); 

    return () => clearTimeout(timer);
  }, [settings.openaiKey, settings.deepseekKey, handleRealScan]);

  const handleExportVault = () => {
    const data = {
        chats,
        settings: {
            theme: settings.theme,
            customFolders: settings.customFolders,
            openaiKey: settings.openaiKey,
            deepseekKey: settings.deepseekKey,
            defaultProvider: settings.defaultProvider,
            globalSystemPrompt: settings.globalSystemPrompt
        },
        version: '1.2',
        exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartchat-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportVault = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target?.result as string);
            if (data.chats && Array.isArray(data.chats)) {
                if (confirm(`Restore ${data.chats.length} assistants? This will merge with your current list.`)) {
                    onImportMany(data.chats);
                    if (data.settings) {
                        setSettings(s => ({ 
                            ...s, 
                            theme: data.settings.theme || s.theme,
                            customFolders: data.settings.customFolders || s.customFolders,
                            openaiKey: data.settings.openaiKey || s.openaiKey,
                            deepseekKey: data.settings.deepseekKey || s.deepseekKey,
                            defaultProvider: data.settings.defaultProvider || s.defaultProvider,
                            globalSystemPrompt: data.settings.globalSystemPrompt || s.globalSystemPrompt
                        }));
                    }
                    alert("Data restored successfully.");
                }
            }
        } catch (err) {
            alert("Failed to parse backup file.");
        }
    };
    reader.readAsText(file);
  };

  const setTheme = (theme: AppTheme) => {
    setSettings(prev => ({ ...prev, theme }));
  };

  const setDefaultProvider = (provider: ModelProvider) => {
    setSettings(prev => ({ ...prev, defaultProvider: provider }));
  };

  return (
    <div className="flex flex-col h-full bg-[#f2f2f7] dark:bg-ios-darkBg">
      <header className="ios-blur bg-white/90 dark:bg-ios-darkBg/90 px-4 py-3 flex items-center border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40">
        <h2 className="text-xl font-bold text-black dark:text-white">Settings</h2>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-20">
        <section className="space-y-2">
          <label className="px-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Theme</label>
          <div className="bg-white dark:bg-ios-darkSurface rounded-2xl p-1 flex border border-gray-100 dark:border-gray-800 shadow-sm">
            {(['light', 'dark', 'system'] as AppTheme[]).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all capitalize ${
                  settings.theme === t 
                    ? 'bg-blue-500 text-white shadow-sm' 
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <label className="px-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Default AI Provider</label>
          <div className="bg-white dark:bg-ios-darkSurface rounded-2xl p-1 flex border border-gray-100 dark:border-gray-800 shadow-sm">
            {(['gemini', 'openai', 'deepseek'] as ModelProvider[]).map((p) => (
              <button
                key={p}
                onClick={() => setDefaultProvider(p)}
                className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all uppercase ${
                  settings.defaultProvider === p 
                    ? 'bg-blue-500 text-white shadow-sm' 
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </section>

        {/* НОВАЯ СЕКЦИЯ: Глобальный системный промпт */}
        <section className="space-y-2">
          <label className="px-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Global AI Instructions</label>
          <div className="bg-white dark:bg-ios-darkSurface rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden p-4">
            <p className="text-[9px] text-gray-400 font-bold mb-2 uppercase italic tracking-tight">Applied to all chats for consistent behavior</p>
            <textarea 
              value={settings.globalSystemPrompt}
              onChange={(e) => setSettings(s => ({ ...s, globalSystemPrompt: e.target.value }))}
              placeholder="Enter common instructions here..."
              className="w-full text-[13px] bg-gray-50 dark:bg-ios-darkBg p-3 rounded-xl dark:text-white outline-none min-h-[150px] resize-none border border-transparent focus:border-blue-500/30 transition-all leading-relaxed"
            />
          </div>
        </section>

        <section className="space-y-2">
          <label className="px-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Cloud & API Services</label>
          <div className="bg-white dark:bg-ios-darkSurface rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className="p-4 bg-gray-50/50 dark:bg-white/[0.02] border-b dark:border-gray-800">
               <button 
                disabled={isScanning}
                onClick={() => handleRealScan(false)}
                className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center space-x-2 ${
                  isScanning ? 'bg-gray-200 dark:bg-gray-800 text-gray-500' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 active:scale-95'
                }`}
              >
                <i className={`fa-solid ${isScanning ? 'fa-sync fa-spin' : 'fa-arrows-rotate'}`}></i>
                <span>{isScanning ? 'Syncing...' : 'Sync Assistants Now'}</span>
              </button>
              {scanStatus.message && (
                <div className={`mt-3 text-[11px] p-2 rounded-lg border text-center ${
                  scanStatus.type === 'success' ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/10' : 
                  scanStatus.type === 'error' ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/10' : 'bg-blue-50 border-blue-200 text-blue-700'
                }`}>
                  {scanStatus.message}
                </div>
              )}
            </div>

            <div className="p-4">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center space-x-2">
                  <i className="fa-solid fa-cloud text-blue-500 text-xs"></i>
                  <label className="text-xs font-bold dark:text-gray-300">Google Gemini API</label>
                </div>
                {process.env.API_KEY && <i className="fa-solid fa-circle-check text-green-500 text-[10px]"></i>}
              </div>
              <div className="w-full text-[13px] bg-gray-50 dark:bg-ios-darkBg p-3 rounded-xl dark:text-gray-400 italic border border-transparent">
                {process.env.API_KEY ? "Connected via environment" : "Key not found"}
              </div>
            </div>

            <div className="p-4">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center space-x-2">
                  <i className="fa-solid fa-robot text-indigo-500 text-xs"></i>
                  <label className="text-xs font-bold dark:text-gray-300">OpenAI API Key</label>
                </div>
                {settings.openaiKey && <i className="fa-solid fa-circle-check text-green-500 text-[10px]"></i>}
              </div>
              <input 
                type="password"
                value={settings.openaiKey}
                onChange={(e) => setSettings(s => ({ ...s, openaiKey: e.target.value }))}
                placeholder="sk-..."
                className="w-full text-sm outline-none bg-gray-50 dark:bg-ios-darkBg p-3 rounded-xl font-mono placeholder:text-gray-300 dark:text-white border border-transparent focus:border-blue-500/30 transition-all mb-1"
              />
              <a href="https://platform.openai.com/account/billing" target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 hover:underline">Check OpenAI Billing & Balance</a>
            </div>

            <div className="p-4">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center space-x-2">
                  <i className="fa-solid fa-brain text-purple-500 text-xs"></i>
                  <label className="text-xs font-bold dark:text-gray-300">DeepSeek API Key</label>
                </div>
                {settings.deepseekKey && <i className="fa-solid fa-circle-check text-green-500 text-[10px]"></i>}
              </div>
              <input 
                type="password"
                value={settings.deepseekKey}
                onChange={(e) => setSettings(s => ({ ...s, deepseekKey: e.target.value }))}
                placeholder="sk-..."
                className="w-full text-sm outline-none bg-gray-50 dark:bg-ios-darkBg p-3 rounded-xl font-mono placeholder:text-gray-300 dark:text-white border border-transparent focus:border-blue-500/30 transition-all mb-1"
              />
              <a href="https://platform.deepseek.com/usage" target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 hover:underline">Check DeepSeek Billing & Balance</a>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <label className="px-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Backup & Data</label>
          <div className="bg-white dark:bg-ios-darkSurface rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm divide-y dark:divide-gray-800">
              <button 
                  onClick={handleExportVault}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
              >
                  <div className="flex items-center space-x-3">
                      <i className="fa-solid fa-download text-blue-500"></i>
                      <span className="text-sm font-bold dark:text-white">Export Local Backup</span>
                  </div>
                  <i className="fa-solid fa-chevron-right text-[10px] text-gray-300"></i>
              </button>
              <label className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer">
                  <div className="flex items-center space-x-3 text-left">
                      <i className="fa-solid fa-upload text-purple-500"></i>
                      <span className="text-sm font-bold dark:text-white">Import Backup File</span>
                  </div>
                  <input type="file" accept=".json" onChange={handleImportVault} className="hidden" />
                  <i className="fa-solid fa-chevron-right text-[10px] text-gray-300"></i>
              </label>
          </div>
        </section>

        <section className="space-y-2">
          <label className="px-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Storage Management</label>
          <div className="bg-white dark:bg-ios-darkSurface rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
              <button 
                  onClick={() => setShowArchive(!showArchive)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
              >
                  <div className="flex items-center space-x-3">
                      <i className="fa-solid fa-box-archive text-gray-400"></i>
                      <span className="text-sm font-bold dark:text-white">Archive Folder</span>
                  </div>
                  <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{archivedChats.length}</span>
                      <i className={`fa-solid fa-chevron-right text-[10px] text-gray-300 transition-transform ${showArchive ? 'rotate-90' : ''}`}></i>
                  </div>
              </button>
              
              {showArchive && (
                  <div className="border-t dark:border-gray-800 divide-y dark:divide-gray-800 max-h-64 overflow-y-auto">
                      {archivedChats.map(chat => (
                          <div key={chat.id} className="flex items-center p-3">
                              <div className="w-8 h-8 rounded-full border dark:border-gray-800 mr-3 grayscale bg-[#1d2733] flex items-center justify-center">
                                <i className="fa-solid fa-user text-[#4e5c6e] text-sm"></i>
                              </div>
                              <div className="flex-1 min-w-0">
                                  <div className="text-xs font-bold dark:text-white truncate">{chat.name}</div>
                                  <div className="text-[10px] text-gray-400">Inactive chat</div>
                              </div>
                              <div className="flex space-x-1">
                                  <button 
                                      onClick={() => onUnarchiveChat(chat.id)}
                                      className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded-lg transition-colors"
                                      title="Unarchive"
                                  >
                                      <i className="fa-solid fa-arrow-up-from-bracket"></i>
                                  </button>
                                  <button 
                                      onClick={() => { if(confirm("Permanently delete this chat?")) onDeleteChat(chat.id); }}
                                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors"
                                      title="Delete"
                                  >
                                      <i className="fa-solid fa-trash-can"></i>
                                  </button>
                              </div>
                          </div>
                      ))}
                      {archivedChats.length === 0 && (
                          <div className="p-8 text-center text-xs text-gray-400">Archive is empty.</div>
                      )}
                  </div>
              )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default SettingsView;
