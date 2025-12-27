
import React, { useState, useRef, useEffect } from 'react';
import { IMPORT_CATALOG } from '../constants';

interface Props {
  onImport: (id: string) => void;
}

const ImportView: React.FC<Props> = ({ onImport }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const candidates = IMPORT_CATALOG.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 bg-[#f2f2f7] dark:bg-ios-darkBg min-h-full">
      <div className="bg-gray-200 dark:bg-ios-darkSurface rounded-lg px-3 py-2 flex items-center mb-6 border border-transparent dark:border-gray-800">
        <i className="fa-solid fa-magnifying-glass text-gray-400 mr-2"></i>
        <input 
          ref={searchInputRef}
          type="text" 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search for assistants..." 
          className="bg-transparent text-sm w-full outline-none dark:text-white"
        />
      </div>

      <div className="space-y-4">
        {candidates.map(candidate => (
          <div 
            key={candidate.id}
            className="bg-white dark:bg-ios-darkSurface p-4 rounded-2xl shadow-sm flex items-center justify-between border border-gray-100 dark:border-gray-800"
          >
            <div className="flex-1 mr-4">
              <h4 className="font-bold text-gray-900 dark:text-white">{candidate.name}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 italic">
                {candidate.prompt}
              </p>
              <div className="flex mt-2 gap-1">
                {candidate.tags.map(t => (
                  <span key={t} className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-500 px-2 py-0.5 rounded-full font-bold">{t}</span>
                ))}
              </div>
            </div>
            <button 
              onClick={() => onImport(candidate.id)}
              className="bg-blue-500 text-white px-4 py-2 rounded-full text-xs font-bold active:scale-90 transition-transform"
            >
              IMPORT
            </button>
          </div>
        ))}

        {candidates.length === 0 && (searchTerm.length > 0) && (
          <div className="text-center py-12 text-gray-400">
            <i className="fa-solid fa-face-frown text-4xl mb-3 block opacity-20"></i>
            <p className="text-sm uppercase tracking-widest font-black text-[10px]">No assistants found matching "{searchTerm}"</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportView;
