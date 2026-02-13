import React, { useState, useMemo, useEffect, useRef } from 'react';
import { HumanRight, Scope } from '../types';
import { INITIAL_RIGHTS, COUNTRIES, REGIONS } from '../constants';
import { getSemanticRights } from '../services/gemini';

interface ConstellationProps {
  onDragStart: (e: React.DragEvent, right: HumanRight) => void;
  scope: Scope;
  onScopeChange: (s: Scope) => void;
  subScope: string;
  setSubScope: (s: string) => void;
}

// Global cache for semantic results to avoid redundant API calls
const SEMANTIC_CACHE: Record<string, string[]> = {};

// Hardcoded mapping for common terms to provide instant feedback
const INSTANT_MAP: Record<string, string[]> = {
  'food': ['25'],
  'eat': ['25'],
  'hungry': ['25'],
  'drink': ['25'],
  'water': ['25'],
  'house': ['25'],
  'home': ['12', '25'],
  'shelter': ['25'],
  'fair': ['7', '10'],
  'justice': ['8', '10'],
  'trial': ['10'],
  'court': ['8', '10'],
  'judge': ['10'],
  'police': ['9', '5'],
  'arrest': ['9'],
  'jail': ['9', '5'],
  'torture': ['5'],
  'pain': ['5'],
  'kill': ['3'],
  'murder': ['3'],
  'death': ['3'],
  'work': ['23'],
  'job': ['23'],
  'money': ['23', '25', '17'],
  'pay': ['23'],
  'school': ['26'],
  'learn': ['26'],
  'teacher': ['26'],
  'privacy': ['12'],
  'data': ['12'],
  'internet': ['12', '19'],
  'speak': ['19'],
  'voice': ['19', '21'],
  'vote': ['21'],
  'government': ['21'],
  'church': ['18'],
  'god': ['18'],
  'pray': ['18'],
  'travel': ['13'],
  'plane': ['13'],
  'border': ['13', '14'],
  'refugee': ['14'],
  'doctor': ['25'],
  'health': ['25'],
  'medicine': ['25'],
  'family': ['16'],
  'marry': ['16'],
  'child': ['16', '26'],
  'safety': ['3'],
  'equal': ['1', '7'],
  'racism': ['2'],
  'sexism': ['2'],
  'discrimination': ['2']
};

const Constellation: React.FC<ConstellationProps> = ({
  onDragStart,
  scope,
  onScopeChange,
  subScope,
  setSubScope
}) => {
  const [openDrawer, setOpenDrawer] = useState<string | null>('Civil');
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(true);
  const [filterSearchTerm, setFilterSearchTerm] = useState('');
  const [rightsSearchTerm, setRightsSearchTerm] = useState('');
  const [semanticIds, setSemanticIds] = useState<string[]>([]);
  const [isSearchingSemantics, setIsSearchingSemantics] = useState(false);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const categories = [
    { key: 'Civil', label: 'CIVIL STATUS', module: '01' },
    { key: 'Political', label: 'POLITICAL ACTION', module: '02' },
    { key: 'Economic', label: 'RESOURCE ALLOCATION', module: '03' },
    { key: 'Social', label: 'SOCIAL FABRIC', module: '04' },
    { key: 'Cultural', label: 'COLLECTIVE IDENTITY', module: '05' },
  ];

  // Semantic retrieval effect with optimized caching and faster debounce - FIXED
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    const term = rightsSearchTerm.trim().toLowerCase();

    if (term.length > 1) {
      // Step 1: Check instant map for high-frequency terms
      const instantMatches = INSTANT_MAP[term] || [];

      // Step 2: Check global session cache - FIXED with safety check
      const cachedResults = SEMANTIC_CACHE[term];
      if (cachedResults && Array.isArray(cachedResults)) {
        setSemanticIds([...new Set([...instantMatches, ...cachedResults])]);
        return;
      }

      // Step 3: If not cached, trigger Gemini with reduced debounce for speed
      setSemanticIds(instantMatches); // Show instant matches first
      setIsSearchingSemantics(true);

      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const ids = await getSemanticRights(term, INITIAL_RIGHTS);
          const validIds = Array.isArray(ids) ? ids : [];
          SEMANTIC_CACHE[term] = validIds;
          setSemanticIds(prev => {
            const prevIds = Array.isArray(prev) ? prev : [];
            return [...new Set([...prevIds, ...validIds])];
          });
        } catch (err) {
          console.error('Semantic search error:', err);
        } finally {
          setIsSearchingSemantics(false);
        }
      }, 350);
    } else {
      setSemanticIds([]);
      setIsSearchingSemantics(false);
    }

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [rightsSearchTerm]);

  // Filter for Countries/Regions
  const filteredSubOptions = useMemo(() => {
    const options = scope === 'Regional' ? REGIONS : scope === 'National' ? COUNTRIES : [];
    if (!filterSearchTerm || scope !== 'National') return options;
    return options.filter(opt => opt.toLowerCase().includes(filterSearchTerm.toLowerCase()));
  }, [scope, filterSearchTerm]);

  // Filter for Rights (Combined Keyword + Semantic + Instant)
  const getFilteredRights = (categoryKey: string) => {
    const rights = INITIAL_RIGHTS.filter(r => r.category === categoryKey);
    if (!rightsSearchTerm) return rights;

    return rights.filter(r => {
      const keywordMatch =
        r.name.toLowerCase().includes(rightsSearchTerm.toLowerCase()) ||
        (r.summary && r.summary.toLowerCase().includes(rightsSearchTerm.toLowerCase()));

      const semanticMatch = semanticIds.includes(r.id);

      return keywordMatch || semanticMatch;
    });
  };

  const handleScopeSelect = (s: Scope) => {
    onScopeChange(s);
    setFilterSearchTerm('');
  };

  return (
    <div className="w-full h-full bg-white flex flex-row overflow-hidden shrink-0">
      {/* Vertical Legend Bar */}
      <div className="w-10 border-r border-[#5b5b5b] bg-[#fafafa] flex flex-col items-center justify-center relative select-none shrink-0 overflow-hidden">
        <div className="absolute top-4 w-[1px] h-12 bg-[#5b5b5b]/10"></div>
        <span className="transform -rotate-90 whitespace-nowrap text-[8px] font-technical font-bold tracking-[0.5em] opacity-40 uppercase">
          RIGHTS INDEX
        </span>
        <div className="absolute bottom-4 flex flex-col gap-1.5">
          <div className="w-1 h-1 bg-[#5b5b5b]/20 rounded-full"></div>
          <div className="w-1 h-1 bg-[#5b5b5b]/20 rounded-full"></div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Retractable Filter Section */}
        <div className="border-b border-[#5b5b5b] bg-white shrink-0">
          <button
            onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
            className="w-full px-4 py-2 flex justify-between items-center hover:bg-gray-50 transition-colors"
          >
            <span className="text-[7px] font-technical uppercase opacity-60 tracking-widest">
              {isFiltersExpanded ? '[ HIDE_SCOPE_FILTERS ]' : '[ SHOW_SCOPE_FILTERS ]'}
            </span>
            <i className={`fas fa-chevron-down text-[8px] transition-transform duration-300 ${isFiltersExpanded ? 'rotate-180' : ''}`}></i>
          </button>

          {isFiltersExpanded && (
            <div className="p-4 pt-0 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex border border-[#5b5b5b] overflow-hidden bg-white">
                {(['International', 'Regional', 'National'] as Scope[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleScopeSelect(s)}
                    className={`flex-1 px-2 py-2 text-[8px] font-bold font-typewriter uppercase border-r border-[#5b5b5b] last:border-r-0 transition-all btn-dotted border-none rounded-none ${scope === s ? 'active' : ''
                      }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Sub-Scope Selector with Search (Restricted to National per request) */}
              {scope !== 'International' && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[7px] font-technical uppercase opacity-40 tracking-widest">
                      Available_In_{scope === 'Regional' ? 'Regions' : 'Nations'}
                    </span>
                  </div>

                  {scope === 'National' && (
                    <div className="relative">
                      <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-[7px] opacity-30"></i>
                      <input
                        type="text"
                        placeholder="SEARCH_LOCATION_ARCHIVE..."
                        value={filterSearchTerm}
                        onChange={(e) => setFilterSearchTerm(e.target.value)}
                        className="w-full pl-7 pr-3 py-1.5 border border-[#5b5b5b]/10 bg-[#f9f9f9] text-[8px] font-typewriter uppercase outline-none focus:border-[#5b5b5b]/30 transition-colors"
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 max-h-[100px] overflow-y-auto custom-scroll p-2 border border-[#5b5b5b]/5 bg-[#fafafa]">
                    {filteredSubOptions.map(opt => (
                      <button
                        key={opt}
                        onClick={() => setSubScope(opt)}
                        className={`btn-dotted px-2 py-1 text-[7px] font-bold font-typewriter uppercase transition-colors ${subScope === opt ? 'active bg-[#5b5b5b] text-white border-[#5b5b5b]' : 'bg-white hover:bg-gray-100'
                          }`}
                      >
                        {opt}
                      </button>
                    ))}
                    {filteredSubOptions.length === 0 && (
                      <span className="text-[7px] font-technical opacity-30 uppercase italic py-2">No matching records</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Categories Header */}
        <div className="px-4 py-3 border-b border-[#5b5b5b] flex flex-col gap-3 bg-gray-50 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-[8px] font-bold font-typewriter tracking-[0.2em] uppercase opacity-60">RIGHTS_REPOSITORIES</h3>
              {subScope && (
                <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-300">
                  <span className="text-[7px] font-technical bg-[#9b2c2c] text-white px-2 py-0.5 uppercase tracking-wider border border-[#7b2121] shadow-sm">
                    {subScope}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              {subScope && (
                <button
                  onClick={() => setSubScope('')}
                  className="text-[7px] font-technical border border-[#5b5b5b] px-2 py-0.5 uppercase hover:bg-[#5b5b5b] hover:text-white transition-all cursor-pointer bg-white"
                >
                  [CLEAR_FILTER]
                </button>
              )}
              {!subScope && <span className="text-[6px] font-technical opacity-30 tracking-[0.2em]">CODEX_MODULES</span>}
            </div>
          </div>

          {/* Rapid Concept Search for Rights */}
          <div className="relative">
            <i className={`fas ${isSearchingSemantics ? 'fa-spinner fa-spin' : 'fa-search'} absolute left-2.5 top-1/2 -translate-y-1/2 text-[7px] opacity-30`}></i>
            <input
              type="text"
              placeholder="QUICK FIND (e.g. 'FOOD', 'FAIRNESS', 'POLICE')..."
              value={rightsSearchTerm}
              onChange={(e) => setRightsSearchTerm(e.target.value)}
              className="w-full pl-7 pr-20 py-2 border border-[#5b5b5b]/10 bg-white text-[8px] font-typewriter uppercase outline-none focus:border-[#5b5b5b]/30 transition-colors"
            />
            
            {/* Show either loading indicator OR clear button */}
            {isSearchingSemantics ? (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[5px] font-technical uppercase opacity-40">
                Concept_Mapping_Engine...
              </div>
            ) : rightsSearchTerm ? (
              <button
                onClick={() => setRightsSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-[8px] opacity-30 hover:opacity-100 hover:text-[#9b2c2c] transition-all"
                title="Clear search"
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scroll bg-white">
          {categories.map((cat) => {
            const filteredRights = getFilteredRights(cat.key);
            if (rightsSearchTerm && filteredRights.length === 0) return null;

            return (
              <div key={cat.key} className="border-b border-[#5b5b5b]/10 last:border-0">
                <button
                  onClick={() => setOpenDrawer(openDrawer === cat.key ? null : cat.key)}
                  className={`w-full text-left px-4 py-4 transition-all relative group flex flex-col gap-1 ${openDrawer === cat.key ? 'bg-gray-50' : 'hover:bg-gray-50'
                    }`}
                >
                  {openDrawer === cat.key && <div className="absolute inset-[2px] border border-dotted border-[#5b5b5b]/20 pointer-events-none"></div>}
                  <div className="flex justify-between items-center w-full relative z-10">
                    <span className="text-[10px] font-bold font-typewriter tracking-tight uppercase">{cat.label}</span>
                    <i className={`fas fa-caret-right text-[8px] transition-transform duration-300 ${openDrawer === cat.key ? 'rotate-90' : 'opacity-20'}`}></i>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-[6px] font-technical opacity-20 uppercase tracking-[0.2em]">Archive_Entry_0{cat.module}</div>
                    {rightsSearchTerm && <div className="text-[6px] font-technical text-[#5b5b5b]/40 uppercase">{filteredRights.length} MATCHES</div>}
                  </div>
                </button>

                {(openDrawer === cat.key || rightsSearchTerm) && (
                  <div className="p-3 space-y-2 bg-[#fcfcfc] animate-in slide-in-from-top-1 duration-150 border-t border-[#5b5b5b]/5">
                    {filteredRights.map(right => {
                      const isSemanticMatch = semanticIds.includes(right.id) && !right.name.toLowerCase().includes(rightsSearchTerm.toLowerCase());
                      return (
                        <div
                          key={right.id}
                          draggable
                          onDragStart={(e) => onDragStart(e, right)}
                          className={`draggable-card p-3 group hover:border-[#5b5b5b] transition-all flex justify-between items-center bg-white border border-[#5b5b5b]/10 ${isSemanticMatch ? 'border-l-4 border-l-[#9b2c2c]' : ''}`}
                        >
                          <div className="flex flex-col gap-1 pr-4">
                            <div className="flex items-center gap-2">
                              <div className="font-bold uppercase tracking-tight font-typewriter text-[9px] leading-tight">
                                {right.name}
                              </div>
                              {isSemanticMatch && (
                                <span className="text-[5px] font-technical bg-[#9b2c2c]/10 text-[#9b2c2c] px-1 py-0.5 border border-[#9b2c2c]/20 uppercase">Semantic_Link</span>
                              )}
                            </div>
                            {rightsSearchTerm && right.summary && (
                              <div className="text-[7px] font-technical opacity-40 leading-tight uppercase line-clamp-1">
                                {right.summary}
                              </div>
                            )}
                          </div>
                          <i className="fas fa-grip-lines text-[8px] opacity-10 group-hover:opacity-40"></i>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          
          {/* IMPROVED NO RESULTS MESSAGE */}
          {rightsSearchTerm && categories.every(cat => getFilteredRights(cat.key).length === 0) && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10 min-h-[300px]">
              <div className="relative">
                <i className={`fas ${isSearchingSemantics ? 'fa-spinner fa-spin text-[#9b2c2c]' : 'fa-search'} text-4xl opacity-20`}></i>
              </div>
              
              {isSearchingSemantics ? (
                <div className="text-center space-y-2">
                  <div className="text-[10px] font-typewriter uppercase tracking-widest opacity-60">
                    Searching Archives...
                  </div>
                  <div className="text-[7px] font-technical uppercase opacity-40">
                    Concept_Mapping_Engine_Active
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-3">
                  <div className="text-[11px] font-bold font-typewriter uppercase tracking-wider opacity-60">
                    No Records Found
                  </div>
                  <div className="text-[8px] font-technical uppercase opacity-40 max-w-[200px]">
                    Archive query "{rightsSearchTerm}" returned zero entries
                  </div>
                  <button
                    onClick={() => setRightsSearchTerm('')}
                    className="mt-4 px-4 py-2 border border-[#5b5b5b] text-[7px] font-technical uppercase hover:bg-[#5b5b5b] hover:text-white transition-all"
                  >
                    [CLEAR_SEARCH]
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[#5b5b5b] bg-gray-50 flex items-center justify-center shrink-0">
          <span className="text-[7px] font-technical opacity-40 uppercase tracking-[0.4em]">DRAG_ENTRY_TO_BOARD</span>
        </div>
      </div>
    </div>
  );
};

export default Constellation;
                <button
                  onClick={() => setSubScope('')}
                  className="text-[7px] font-technical border border-[#5b5b5b] px-2 py-0.5 uppercase hover:bg-[#5b5b5b] hover:text-white transition-all cursor-pointer bg-white"
                >
                  [CLEAR_FILTER]
                </button>
              )}
              {!subScope && <span className="text-[6px] font-technical opacity-30 tracking-[0.2em]">CODEX_MODULES</span>}
            </div>
          </div>

          {/* Rapid Concept Search for Rights */}
          <div className="relative">
            <i className={`fas ${isSearchingSemantics ? 'fa-spinner fa-spin' : 'fa-search'} absolute left-2.5 top-1/2 -translate-y-1/2 text-[7px] opacity-30`}></i>
            <input
              type="text"
              placeholder="QUICK FIND (e.g. 'FOOD', 'FAIRNESS', 'POLICE')..."
              value={rightsSearchTerm}
              onChange={(e) => setRightsSearchTerm(e.target.value)}
              className="w-full pl-7 pr-20 py-2 border border-[#5b5b5b]/10 bg-white text-[8px] font-typewriter uppercase outline-none focus:border-[#5b5b5b]/30 transition-colors"
            />
            
            {/* Show either loading indicator OR clear button */}
            {isSearchingSemantics ? (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[5px] font-technical uppercase opacity-40">
                Concept_Mapping_Engine...
              </div>
            ) : rightsSearchTerm ? (
              <button
                onClick={() => setRightsSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-[8px] opacity-30 hover:opacity-100 hover:text-[#9b2c2c] transition-all"
                title="Clear search"
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scroll bg-white">
          {categories.map((cat) => {
            const filteredRights = getFilteredRights(cat.key);
            if (rightsSearchTerm && filteredRights.length === 0) return null;

            return (
              <div key={cat.key} className="border-b border-[#5b5b5b]/10 last:border-0">
                <button
                  onClick={() => setOpenDrawer(openDrawer === cat.key ? null : cat.key)}
                  className={`w-full text-left px-4 py-4 transition-all relative group flex flex-col gap-1 ${openDrawer === cat.key ? 'bg-gray-50' : 'hover:bg-gray-50'
                    }`}
                >
                  {openDrawer === cat.key && <div className="absolute inset-[2px] border border-dotted border-[#5b5b5b]/20 pointer-events-none"></div>}
                  <div className="flex justify-between items-center w-full relative z-10">
                    <span className="text-[10px] font-bold font-typewriter tracking-tight uppercase">{cat.label}</span>
                    <i className={`fas fa-caret-right text-[8px] transition-transform duration-300 ${openDrawer === cat.key ? 'rotate-90' : 'opacity-20'}`}></i>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-[6px] font-technical opacity-20 uppercase tracking-[0.2em]">Archive_Entry_0{cat.module}</div>
                    {rightsSearchTerm && <div className="text-[6px] font-technical text-[#5b5b5b]/40 uppercase">{filteredRights.length} MATCHES</div>}
                  </div>
                </button>

                {(openDrawer === cat.key || rightsSearchTerm) && (
                  <div className="p-3 space-y-2 bg-[#fcfcfc] animate-in slide-in-from-top-1 duration-150 border-t border-[#5b5b5b]/5">
                    {filteredRights.map(right => {
                      const isSemanticMatch = semanticIds.includes(right.id) && !right.name.toLowerCase().includes(rightsSearchTerm.toLowerCase());
                      return (
                        <div
                          key={right.id}
                          draggable
                          onDragStart={(e) => onDragStart(e, right)}
                          className={`draggable-card p-3 group hover:border-[#5b5b5b] transition-all flex justify-between items-center bg-white border border-[#5b5b5b]/10 ${isSemanticMatch ? 'border-l-4 border-l-[#9b2c2c]' : ''}`}
                        >
                          <div className="flex flex-col gap-1 pr-4">
                            <div className="flex items-center gap-2">
                              <div className="font-bold uppercase tracking-tight font-typewriter text-[9px] leading-tight">
                                {right.name}
                              </div>
                              {isSemanticMatch && (
                                <span className="text-[5px] font-technical bg-[#9b2c2c]/10 text-[#9b2c2c] px-1 py-0.5 border border-[#9b2c2c]/20 uppercase">Semantic_Link</span>
                              )}
                            </div>
                            {rightsSearchTerm && right.summary && (
                              <div className="text-[7px] font-technical opacity-40 leading-tight uppercase line-clamp-1">
                                {right.summary}
                              </div>
                            )}
                          </div>
                          <i className="fas fa-grip-lines text-[8px] opacity-10 group-hover:opacity-40"></i>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          
          {/* IMPROVED NO RESULTS MESSAGE */}
          {rightsSearchTerm && categories.every(cat => getFilteredRights(cat.key).length === 0) && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10 min-h-[300px]">
              <div className="relative">
                <i className={`fas ${isSearchingSemantics ? 'fa-spinner fa-spin text-[#9b2c2c]' : 'fa-search'} text-4xl opacity-20`}></i>
              </div>
              
              {isSearchingSemantics ? (
                <div className="text-center space-y-2">
                  <div className="text-[10px] font-typewriter uppercase tracking-widest opacity-60">
                    Searching Archives...
                  </div>
                  <div className="text-[7px] font-technical uppercase opacity-40">
                    Concept_Mapping_Engine_Active
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-3">
                  <div className="text-[11px] font-bold font-typewriter uppercase tracking-wider opacity-60">
                    No Records Found
                  </div>
                  <div className="text-[8px] font-technical uppercase opacity-40 max-w-[200px]">
                    Archive query "{rightsSearchTerm}" returned zero entries
                  </div>
                  <button
                    onClick={() => setRightsSearchTerm('')}
                    className="mt-4 px-4 py-2 border border-[#5b5b5b] text-[7px] font-technical uppercase hover:bg-[#5b5b5b] hover:text-white transition-all"
                  >
                    [CLEAR_SEARCH]
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[#5b5b5b] bg-gray-50 flex items-center justify-center shrink-0">
          <span className="text-[7px] font-technical opacity-40 uppercase tracking-[0.4em]">DRAG_ENTRY_TO_BOARD</span>
        </div>
      </div>
    </div>
  );
};

export default Constellation;
