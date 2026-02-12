import React, { useState, useRef, useEffect } from 'react';
import Constellation from './components/Constellation';
import DialoguePanel from './components/DialoguePanel';
import { HumanRight, CanvasItem, Connection, Scope, DialogueResult, SearchMode } from './types';
import { getScopeAnalysis, getNexusAnalysis, getStatusAnalysis } from './services/gemini';

type AnalysisType = 'treaty' | 'status' | 'nexus';

const App: React.FC = () => {
  const [scope, setScope] = useState<Scope>('International');
  const [subScope, setSubScope] = useState<string>('');
  const [searchMode, setSearchMode] = useState<SearchMode>('Framework');
  const [selectedDisplay, setSelectedDisplay] = useState<string>('');
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeAnalysis, setActiveAnalysis] = useState<DialogueResult | null>(null);
  const [analysisType, setAnalysisType] = useState<AnalysisType>('treaty');
  const [isLoading, setIsLoading] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [activeSubjects, setActiveSubjects] = useState<string[]>([]);

  // States for internal board dragging
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hasMoved, setHasMoved] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Global mouse handlers for smooth board dragging
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingItemId || !canvasRef.current) return;

      setHasMoved(true);
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - dragOffset.x;
      const y = e.clientY - rect.top - dragOffset.y;

      setCanvasItems(prev => prev.map(item =>
        item.id === draggingItemId ? { ...item, x, y } : item
      ));
    };

    const onMouseUp = () => {
      setDraggingItemId(null);
    };

    if (draggingItemId) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [draggingItemId, dragOffset]);

  const handleDragStart = (e: React.DragEvent, right: HumanRight) => {
    e.dataTransfer.setData('right', JSON.stringify(right));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const rightData = e.dataTransfer.getData('right');
    if (!rightData || !canvasRef.current) return;

    const right: HumanRight = JSON.parse(rightData);
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - 65;
    const y = e.clientY - rect.top - 25;

    const newItem: CanvasItem = {
      id: Math.random().toString(36).substring(7),
      rightId: right.id,
      name: right.name,
      summary: right.summary,
      x,
      y
    };

    setCanvasItems(prev => [...prev, newItem]);
    setSelectedDisplay(right.name);
    setActiveSubjects([right.name]);

    const targetType = searchMode === 'Framework' ? 'treaty' : 'status';
    setAnalysisType(targetType);
    setIsLoading(true);

    try {
      const res = searchMode === 'Framework'
        ? await getScopeAnalysis(right.name, scope, subScope)
        : await getStatusAnalysis(right.name, scope, subScope);

      setActiveAnalysis(res);
      setCanvasItems(prev => prev.map(it => it.id === newItem.id ? {
        ...it,
        analysis: JSON.stringify(res),
        analysisType: targetType
      } : it));
    } catch (err) {
      console.error("Retrieval failed", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleItemMouseDown = (e: React.MouseEvent, item: CanvasItem) => {
    if ((e.target as HTMLElement).closest('button')) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    setDraggingItemId(item.id);
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setHasMoved(false);
  };

  const handleItemClick = async (item: CanvasItem) => {
    if (hasMoved) return;

    setSelectedDisplay(item.name);
    setActiveSubjects([item.name]);

    const targetType = searchMode === 'Framework' ? 'treaty' : 'status';

    if (item.analysis && item.analysisType === targetType) {
      setAnalysisType(targetType);
      setActiveAnalysis(JSON.parse(item.analysis));
    } else {
      setAnalysisType(targetType);
      setIsLoading(true);
      setActiveAnalysis(null);
      try {
        const res = searchMode === 'Framework'
          ? await getScopeAnalysis(item.name, scope, subScope)
          : await getStatusAnalysis(item.name, scope, subScope);

        setActiveAnalysis(res);
        setCanvasItems(prev => prev.map(it => it.id === item.id ? {
          ...it,
          analysis: JSON.stringify(res),
          analysisType: targetType
        } : it));
      } catch (err) {
        console.error("Fetch failed", err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleConnectionClick = (conn: Connection) => {
    if (!conn.analysis) return;
    const from = canvasItems.find(i => i.id === conn.fromId);
    const to = canvasItems.find(i => i.id === conn.toId);
    if (!from || !to) return;

    setSelectedDisplay(`${from.name} + ${to.name}`);
    setActiveSubjects([from.name, to.name]);
    setAnalysisType('nexus');
    setActiveAnalysis(JSON.parse(conn.analysis));
  };

  const handleNexusClick = async (item: CanvasItem) => {
    if (connectingFrom) {
      if (connectingFrom === item.id) {
        setConnectingFrom(null);
        return;
      }
      const fromItem = canvasItems.find(i => i.id === connectingFrom);
      if (!fromItem) return;

      const existing = connections.find(c => (c.fromId === connectingFrom && c.toId === item.id) || (c.fromId === item.id && c.toId === connectingFrom));
      if (existing) {
        setConnectingFrom(null);
        handleConnectionClick(existing);
        return;
      }

      const connectionId = Math.random().toString(36).substring(7);
      const newConn: Connection = { id: connectionId, fromId: connectingFrom, toId: item.id };
      setConnections(prev => [...prev, newConn]);
      setConnectingFrom(null);

      setSelectedDisplay(`${fromItem.name} + ${item.name}`);
      setActiveSubjects([fromItem.name, item.name]);
      setAnalysisType('nexus');
      setIsLoading(true);
      setActiveAnalysis(null);

      try {
        const res = await getNexusAnalysis(fromItem.name, item.name, scope, subScope);
        setActiveAnalysis(res);
        setConnections(prev => prev.map(c => c.id === connectionId ? { ...c, analysis: JSON.stringify(res) } : c));
      } catch (err) {
        console.error("Nexus mapping failed", err);
      } finally {
        setIsLoading(false);
      }
    } else {
      setConnectingFrom(item.id);
    }
  };

  const removeItem = (id: string) => {
    setCanvasItems(prev => prev.filter(item => item.id !== id));
    setConnections(prev => prev.filter(conn => conn.fromId !== id && conn.toId !== id));
    if (selectedDisplay && canvasItems.find(it => it.id === id)?.name === selectedDisplay) {
      setSelectedDisplay('');
      setActiveAnalysis(null);
      setActiveSubjects([]);
    }
  };

  const clearCanvas = () => {
    setCanvasItems([]);
    setConnections([]);
    setActiveAnalysis(null);
    setSelectedDisplay('');
    setActiveSubjects([]);
    setConnectingFrom(null);
    setIsLoading(false);
  };

  const handleScopeChange = (newScope: Scope) => {
    setScope(newScope);
    setSubScope('');
  };

  const toggleSearchMode = () => {
    setSearchMode(prev => prev === 'Framework' ? 'Status' : 'Framework');
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-white overflow-hidden select-none text-[#5b5b5b]">
      {/* Updated Disclaimer Bar */}
      <div className="h-6 bg-white border-b border-[#5b5b5b] flex items-center justify-center px-4 shrink-0 z-[100]">
        <span className="text-[7px] font-technical uppercase tracking-[0.3em] text-[#9b2c2c] font-bold text-center">
          THIS IS AN LLM-POWERED SEARCH ENGINE. SOURCE VERIFICATION IS ADVISED. OUTPUTS MAY CONTAIN ERRORS.
        </span>
      </div>

      {/* Global Header */}
      <div className="h-24 lg:h-14 border-b border-[#5b5b5b] flex flex-col lg:flex-row items-center bg-white shrink-0 z-50">
        <div className="w-full lg:w-[450px] border-b lg:border-b-0 lg:border-r border-[#5b5b5b] h-10 lg:h-full flex items-center px-6 shrink-0">
          <span className="text-[10px] font-typewriter font-bold uppercase tracking-[0.4em]">HR_ARCHIVE</span>
        </div>

        <div className="w-full lg:flex-1 h-14 lg:h-full flex items-center px-6 gap-3 lg:gap-6 justify-between overflow-hidden">
          <div className="flex-1 flex justify-center overflow-hidden">
            {selectedDisplay && (
              <span className="text-[9px] font-bold font-typewriter uppercase tracking-widest opacity-60 truncate px-4">
                [{selectedDisplay}]
              </span>
            )}
          </div>

          {/* Mode Toggle Switch */}
          <div className="flex items-center gap-3">
            <span className={`text-[7px] font-technical uppercase tracking-widest transition-opacity whitespace-nowrap ${searchMode === 'Framework' ? 'opacity-100' : 'opacity-30'}`}>Legal_Framework</span>
            <button
              onClick={toggleSearchMode}
              className="w-[36px] h-[18px] border border-[#5b5b5b] relative bg-white transition-colors hover:bg-gray-50 flex-shrink-0"
              aria-label="Toggle Search Mode"
            >
              <div
                className={`absolute top-[3px] bottom-[3px] left-[3px] w-[8px] transition-all duration-300 ease-in-out ${searchMode === 'Framework' ? 'translate-x-0 bg-[#5b5b5b]' : 'translate-x-[22px] bg-[#9b2c2c]'
                  }`}
              />
            </button>
            <span className={`text-[7px] font-technical uppercase tracking-widest transition-opacity whitespace-nowrap ${searchMode === 'Status' ? 'opacity-100 text-[#9b2c2c] font-bold' : 'opacity-30'}`}>Field_Status</span>
          </div>

          <button
            onClick={clearCanvas}
            className="btn-dotted px-3 lg:px-4 py-1 lg:py-1.5 text-[8px] font-bold font-typewriter uppercase tracking-widest whitespace-nowrap"
          >
            Reset_Board
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Sidebar - w-full h-1/2 for vertical split, fixed 450px for horizontal split */}
        <div className="w-full h-1/2 lg:h-full lg:w-[450px] border-b lg:border-b-0 lg:border-r border-[#5b5b5b] flex flex-col overflow-hidden bg-white z-10 shrink-0">
          <Constellation
            onDragStart={handleDragStart}
            scope={scope}
            onScopeChange={handleScopeChange}
            subScope={subScope}
            setSubScope={setSubScope}
          />
        </div>

        {/* Canvas Board */}
        <div
          ref={canvasRef}
          onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDrop}
          className={`flex-1 relative overflow-hidden bg-[#fafafa] transition-colors canvas-grid ${isDraggingOver ? 'bg-gray-100' : ''}`}
        >
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {connections.map((conn) => {
              const from = canvasItems.find(i => i.id === conn.fromId);
              const to = canvasItems.find(i => i.id === conn.toId);
              if (!from || !to) return null;
              return (
                <g key={conn.id} className="pointer-events-auto cursor-pointer" onClick={() => handleConnectionClick(conn)}>
                  <line
                    x1={from.x + 65}
                    y1={from.y + 25}
                    x2={to.x + 65}
                    y2={to.y + 25}
                    stroke="transparent"
                    strokeWidth="20"
                  />
                  <line
                    x1={from.x + 65}
                    y1={from.y + 25}
                    x2={to.x + 65}
                    y2={to.y + 25}
                    className={`nexus-line transition-all ${selectedDisplay === `${from.name} + ${to.name}` ? 'stroke-[#9b2c2c] !opacity-100 !stroke-dasharray-none stroke-[2]' : ''}`}
                  />
                  {conn.analysis && (
                    <circle cx={(from.x + to.x) / 2 + 65} cy={(from.y + to.y) / 2 + 25} r="3" fill={selectedDisplay === `${from.name} + ${to.name}` ? '#9b2c2c' : '#5b5b5b'} opacity="0.5" />
                  )}
                </g>
              );
            })}
          </svg>

          {canvasItems.map((item) => (
            <div
              key={item.id}
              onMouseDown={(e) => handleItemMouseDown(e, item)}
              onClick={() => handleItemClick(item)}
              style={{
                left: item.x,
                top: item.y,
                zIndex: draggingItemId === item.id ? 100 : 10
              }}
              className={`absolute w-[130px] p-3 border border-[#5b5b5b] bg-white shadow-sm transition-shadow select-none ${selectedDisplay === item.name ? 'ring-1 ring-[#5b5b5b] ring-offset-2' : ''
                } ${draggingItemId === item.id ? 'cursor-grabbing scale-105 shadow-xl' : 'cursor-grab hover:shadow-md'}`}
            >
              <button
                onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                className="absolute -top-2 -right-2 w-5 h-5 bg-white border border-[#5b5b5b] flex items-center justify-center text-[9px] hover:bg-[#9b2c2c]/10 hover:text-[#9b2c2c] transition-colors z-20 font-technical font-bold"
                title="Remove Item"
              >
                X
              </button>

              {selectedDisplay === item.name && <div className="absolute inset-[2px] border border-dotted border-[#5b5b5b] pointer-events-none"></div>}
              <div className="text-[9px] font-bold font-typewriter uppercase mb-1 leading-tight pointer-events-none">{item.name}</div>

              {item.analysisType === 'status' && (
                <div className="text-[5px] font-technical uppercase text-[#9b2c2c] tracking-tighter mb-1 font-bold">[Status_Record]</div>
              )}

              <div className="flex justify-between items-center mt-2 pt-2 border-t border-[#5b5b5b]/5 pointer-events-auto">
                <span className="text-[6px] font-technical opacity-40">#{item.rightId.padStart(2, '0')}</span>

                <button
                  onClick={(e) => { e.stopPropagation(); handleNexusClick(item); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  title="Create Nexus"
                  className={`w-6 h-6 rounded-full border border-[#5b5b5b] flex items-center justify-center transition-all ${connectingFrom === item.id
                    ? 'bg-[#9b2c2c] border-[#9b2c2c] text-white animate-pulse shadow-[0_0_10px_rgba(155,44,44,0.3)]'
                    : 'bg-white hover:bg-[#9b2c2c]/10 hover:border-[#9b2c2c] hover:text-[#9b2c2c] text-[#5b5b5b]'
                    }`}
                >
                  <i className={`fas fa-link text-[8px] ${connectingFrom === item.id ? 'scale-110' : ''}`}></i>
                </button>
              </div>
            </div>
          ))}

          {canvasItems.length === 0 && !isDraggingOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-20">
              <div className="text-[10px] font-bold font-typewriter tracking-[0.4em] uppercase text-center">
                Drag rights from repository to board
              </div>
            </div>
          )}

          {connectingFrom && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 border border-[#9b2c2c] bg-white text-[8px] font-typewriter text-[#9b2c2c] uppercase tracking-widest z-20 shadow-md">
              <i className="fas fa-link mr-2"></i> Nexus_Mode: Select Target
            </div>
          )}

          {(activeAnalysis || isLoading) && (
            <DialoguePanel
              result={activeAnalysis}
              isLoading={isLoading}
              onClose={() => setActiveAnalysis(null)}
              type={analysisType}
              isInsideWorkspace
            />
          )}
        </div>
      </div>

      <div className="h-8 border-t border-[#5b5b5b] bg-white flex items-center px-4 justify-between shrink-0 z-[100]">
        <div className="flex items-center gap-4">
          <div className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-[#9b2c2c] animate-pulse' : 'bg-green-500'}`}></div>
          <span className="text-[7px] font-technical uppercase tracking-widest opacity-60">
            {isLoading ? 'EXECUTING_RETRIEVAL' : 'SYSTEM_READY'}
          </span>
          <span className="text-[7px] font-technical uppercase opacity-40 border-l border-[#5b5b5b]/20 pl-4 ml-2 hidden sm:inline">MODE: {searchMode}</span>
          {subScope && (
            <span className="text-[7px] font-technical uppercase opacity-40 border-l border-[#5b5b5b]/20 pl-4 ml-2 hidden sm:inline">ARCHIVE_FILTER: {subScope}</span>
          )}
        </div>
        <div className="text-[7px] font-technical uppercase opacity-30 tracking-[0.1em]">
          Archival Repository Engine // Codex v1.2.0
        </div>
      </div>
    </div>
  );
};

export default App;