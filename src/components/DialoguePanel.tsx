import React, { useState, useEffect } from 'react';
import { DialogueResult } from '../types';

interface DialoguePanelProps {
  result: DialogueResult | null;
  isLoading: boolean;
  onClose: () => void;
  type: 'treaty' | 'status' | 'nexus';
  isInsideWorkspace?: boolean;
}

const DialoguePanel: React.FC<DialoguePanelProps> = ({ result, isLoading, onClose, type, isInsideWorkspace }) => {
  const [progress, setProgress] = useState(0);

  // Simulated progress logic for better UX feedback during single-promise API calls
  useEffect(() => {
    let interval: any;
    if (isLoading) {
      setProgress(0);
      interval = setInterval(() => {
        setProgress(prev => {
          // Rapid start, then slows down as it nears completion
          if (prev < 30) return prev + Math.random() * 8;
          if (prev < 70) return prev + Math.random() * 3;
          if (prev < 96) return prev + 0.5;
          return prev;
        });
      }, 150);
    } else {
      setProgress(100);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  if (!isLoading && !result) return null;

  const containerClasses = isInsideWorkspace
    ? "absolute inset-y-0 right-0 w-full md:w-[480px] bg-white border-l border-[#5b5b5b] z-[50] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-right duration-300"
    : "fixed inset-y-0 right-0 w-full lg:w-[480px] bg-white border-l border-[#5b5b5b] z-[1000] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-right duration-300";

  return (
    <div className={containerClasses}>
      {/* Dossier Header */}
      <div className="p-6 border-b border-[#5b5b5b] flex justify-between items-center bg-white shrink-0">
        <div className="flex flex-col gap-1">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.3em] font-typewriter leading-tight">
            {type === 'treaty' ? 'Dossier_Legal' : 'Nexus_Research'}
          </h2>
          <div className="text-[8px] opacity-40 font-technical uppercase tracking-widest">
            {type === 'treaty' ? 'Archive_Found' : 'Scholarly_Dialogue'}
          </div>
        </div>
        <button
          onClick={onClose}
          className="btn-dotted px-4 py-2 text-[9px] font-bold font-typewriter uppercase hover:bg-[#5b5b5b] hover:text-white transition-colors"
        >
          [Back_To_Board]
        </button>
      </div>

      {/* Simple Red Progress Bar */}
      {isLoading && (
        <div className="shrink-0 bg-white border-b border-[#5b5b5b]/10">
          <div className="px-6 py-2 flex items-center justify-between">
            <span className="text-[7px] font-technical uppercase tracking-widest opacity-40">Retrieval_Sequence</span>
            <span className="text-[7px] font-technical text-red-600 font-bold">{Math.floor(progress)}%</span>
          </div>
          <div className="h-[1px] w-full bg-[#f0f0f0] relative">
            <div
              className="absolute inset-y-0 left-0 bg-red-600 transition-all duration-300 ease-out shadow-[0_0_8px_rgba(220,38,38,0.3)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 lg:p-8 custom-scroll bg-white">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 py-12 opacity-30">
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="w-1 h-1 bg-red-600 animate-pulse" style={{ animationDelay: `${i * 0.1}s` }}></div>
              ))}
            </div>
            <span className="text-[8px] font-typewriter uppercase tracking-[0.4em]">Archiving_Context...</span>
            <div className="text-[7px] font-technical uppercase opacity-50 text-center max-w-[200px] leading-relaxed">
              Extracting legal clauses from international repositories
            </div>
          </div>
        ) : result && (result.sources.length > 0 || (result.groundingUrls && result.groundingUrls.length > 0)) ? (
          <div className="space-y-10">
            {result.sources.map((s, i) => (
              <div key={i} className="group pb-8 border-b border-[#5b5b5b]/10 last:border-0">
                <div className="flex flex-col gap-4 mb-6">
                  <div className="flex justify-between items-start gap-4">
                    <h3 className="text-[11px] font-bold uppercase font-typewriter leading-tight">
                      {s.title}
                    </h3>
                    <span className="text-[7px] font-technical opacity-20">REF_{String(i + 1).padStart(2, '0')}</span>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2 border-l-2 border-[#5b5b5b] pl-4">
                      <span className="text-[7px] font-technical opacity-40 uppercase tracking-widest">Nexus_Fragment</span>
                      <div className="text-[10px] font-typewriter leading-relaxed bg-[#f9f9f9] p-3 italic border border-[#5b5b5b]/5">
                        "{s.reference || "FRAGMENT_MISSING"}"
                      </div>
                    </div>
                  </div>
                </div>

                <a
                  href={s.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-dotted px-4 py-2 text-[8px] font-bold uppercase font-typewriter tracking-widest w-full text-center hover:bg-gray-50"
                >
                  View_Primary_Source
                  <i className="fas fa-external-link-alt text-[7px] ml-2"></i>
                </a>
              </div>
            ))}

            {/* Display Grounding URLs section for compliance with Google Search grounding rules */}
            {result.groundingUrls && result.groundingUrls.length > 0 && (
              <div className="pt-6 border-t-2 border-dotted border-[#5b5b5b]/20 bg-[#fafafa] p-4">
                <h4 className="text-[8px] font-bold uppercase font-typewriter mb-3 opacity-60 tracking-[0.2em]">Verified_Search_Grounding</h4>
                <div className="space-y-2">
                  {result.groundingUrls.map((g, idx) => (
                    <a
                      key={idx}
                      href={g.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 text-[9px] font-typewriter text-[#5b5b5b] hover:text-blue-700 hover:underline transition-colors"
                    >
                      <i className="fas fa-link text-[7px] opacity-30"></i>
                      <span className="truncate">{g.title || g.uri}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center opacity-20 gap-3">
            <i className="fas fa-search text-lg"></i>
            <span className="text-[9px] font-typewriter uppercase tracking-widest text-center">No matching archival records found.</span>
          </div>
        )}
      </div>

      {/* Panel Footer Decorative */}
      <div className="h-6 border-t border-[#5b5b5b] bg-gray-50 flex items-center px-6 shrink-0">
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="w-1 h-1 bg-[#5b5b5b]/10"></div>)}
        </div>
        <span className="ml-auto text-[6px] font-technical opacity-20 uppercase tracking-widest">End_of_File</span>
      </div>
    </div>
  );
};

export default DialoguePanel;
