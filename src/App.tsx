import React, { useState, useEffect } from 'react';
import { Calendar, Download, Plus, Trash2, Settings, ChevronLeft, ChevronRight, Moon, Sun, Briefcase, Check, RotateCcw, Edit3, X } from 'lucide-react';

// --- Types ---

type ShiftType = 'morning' | 'day' | 'night' | 'off' | 'custom';

interface ShiftConfig {
  id: ShiftType;
  label: string;
  color: string;
  textColor: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  iconName: 'Sun' | 'Briefcase' | 'Moon' | 'Check' | 'Edit3';
}

interface ShiftEvent {
  id: string;
  dateStr: string; // YYYY-MM-DD
  type: ShiftType;
  startTime?: string;
  endTime?: string;
  customLabel?: string; // For custom shifts
}

// --- Defaults ---

const DEFAULT_SHIFT_TYPES: ShiftConfig[] = [
  { id: 'morning', label: 'Morning', color: 'bg-amber-100', textColor: 'text-amber-700', startTime: '06:00', endTime: '14:00', iconName: 'Sun' },
  { id: 'day', label: 'Day', color: 'bg-blue-100', textColor: 'text-blue-700', startTime: '09:00', endTime: '17:00', iconName: 'Briefcase' },
  { id: 'night', label: 'Night', color: 'bg-indigo-100', textColor: 'text-indigo-700', startTime: '22:00', endTime: '06:00', iconName: 'Moon' },
  { id: 'off', label: 'Off', color: 'bg-slate-100', textColor: 'text-slate-500', startTime: '', endTime: '', iconName: 'Check' },
];

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// --- Helper Functions ---

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

const formatDateStr = (year: number, month: number, day: number) => {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Map icon names to components
const getIcon = (name: string, size: number = 16) => {
  switch (name) {
    case 'Sun': return <Sun size={size} />;
    case 'Briefcase': return <Briefcase size={size} />;
    case 'Moon': return <Moon size={size} />;
    case 'Check': return <Check size={size} />;
    case 'Edit3': return <Edit3 size={size} />;
    default: return <Briefcase size={size} />;
  }
};

// --- Main App Component ---

export default function App() {
  // State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [shifts, setShifts] = useState<Record<string, ShiftEvent>>({});
  const [shiftConfigs, setShiftConfigs] = useState<ShiftConfig[]>(DEFAULT_SHIFT_TYPES);
  const [view, setView] = useState<'calendar' | 'list' | 'settings'>('calendar');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Custom Shift State
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customForm, setCustomForm] = useState({ label: 'Custom Shift', start: '09:00', end: '17:00' });

  // Derived State
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  // --- Persistence ---

  useEffect(() => {
    try {
      const savedShifts = localStorage.getItem('shift-data');
      if (savedShifts) setShifts(JSON.parse(savedShifts));

      const savedConfigs = localStorage.getItem('shift-configs');
      if (savedConfigs) setShiftConfigs(JSON.parse(savedConfigs));
    } catch (e) {
      console.error("Failed to load data", e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isLoaded) localStorage.setItem('shift-data', JSON.stringify(shifts));
  }, [shifts, isLoaded]);

  useEffect(() => {
    if (isLoaded) localStorage.setItem('shift-configs', JSON.stringify(shiftConfigs));
  }, [shiftConfigs, isLoaded]);

  // --- Handlers ---

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const handleDayClick = (day: number) => {
    const dateStr = formatDateStr(year, month, day);
    setSelectedDate(dateStr);
    setIsCustomMode(false); // Reset custom mode
    setShowAddModal(true);
  };

  const addShift = (type: ShiftType) => {
    if (!selectedDate) return;
    
    // Clear Shift
    if (type === 'off') {
      const newShifts = { ...shifts };
      delete newShifts[selectedDate];
      setShifts(newShifts);
      setShowAddModal(false);
      return;
    }

    // Standard Shift
    const config = shiftConfigs.find(t => t.id === type);
    const newShift: ShiftEvent = {
      id: Math.random().toString(36).substr(2, 9),
      dateStr: selectedDate,
      type,
      startTime: config?.startTime,
      endTime: config?.endTime,
    };

    setShifts({ ...shifts, [selectedDate]: newShift });
    setShowAddModal(false);
  };

  const addCustomShift = () => {
    if (!selectedDate) return;

    const newShift: ShiftEvent = {
      id: Math.random().toString(36).substr(2, 9),
      dateStr: selectedDate,
      type: 'custom',
      startTime: customForm.start,
      endTime: customForm.end,
      customLabel: customForm.label
    };

    setShifts({ ...shifts, [selectedDate]: newShift });
    setShowAddModal(false);
    setIsCustomMode(false);
  };

  const updateConfig = (id: ShiftType, field: keyof ShiftConfig, value: string) => {
    setShiftConfigs(prev => prev.map(config => 
      config.id === id ? { ...config, [field]: value } : config
    ));
  };

  const resetConfigs = () => {
    if (confirm('Reset shift settings to default?')) {
        setShiftConfigs(DEFAULT_SHIFT_TYPES);
    }
  };

  const deletePastShifts = () => {
    if (!confirm('This will permanently delete all shifts before today from the app. Are you sure?')) return;
    
    const today = getTodayStr();
    const newShifts = { ...shifts };
    
    Object.keys(newShifts).forEach(date => {
      if (date < today) delete newShifts[date];
    });

    setShifts(newShifts);
  };

  const generateICS = () => {
    const today = getTodayStr();
    
    let icsContent = 
`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ShiftSync//iOS Scheduler//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
`;

    let exportCount = 0;

    Object.values(shifts).forEach(shift => {
      // Feature: Skip past shifts for export to prevent duplicates/clutter
      if (shift.dateStr < today) return;

      let label = "Shift";
      
      if (shift.type === 'custom') {
        label = shift.customLabel || "Custom Shift";
      } else {
        const config = shiftConfigs.find(t => t.id === shift.type);
        if (config) label = config.label;
      }

      // Parse date
      const [y, m, d] = shift.dateStr.split('-').map(Number);
      
      // Parse times
      const [startH, startM] = (shift.startTime || '09:00').split(':').map(Number);
      const [endH, endM] = (shift.endTime || '17:00').split(':').map(Number);

      // Create Date objects
      const startDate = new Date(y, m - 1, d, startH, startM);
      let endDate = new Date(y, m - 1, d, endH, endM);
      
      // Handle overnight shifts
      if (endDate < startDate) {
        endDate.setDate(endDate.getDate() + 1);
      }

      const formatICSDate = (date: Date) => {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      };

      icsContent += 
`BEGIN:VEVENT
UID:${shift.id}@shiftsync.app
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(startDate)}
DTEND:${formatICSDate(endDate)}
SUMMARY:${label}
DESCRIPTION:Scheduled via ShiftSync
END:VEVENT
`;
      exportCount++;
    });

    icsContent += `END:VCALENDAR`;

    if (exportCount === 0) {
      alert("No future shifts to export!");
      return;
    }

    // Trigger Download
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'myshifts.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Renders ---

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-3 pt-12 flex justify-between items-center sticky top-0 z-10">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">ShiftSync</h1>
        <button 
          onClick={generateICS}
          className="text-blue-600 font-medium text-sm flex items-center gap-1 active:opacity-50"
        >
          Export <Download size={16} />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-20">
        
        {view === 'calendar' && (
          <div className="p-4">
            {/* Month Navigator */}
            <div className="flex justify-between items-center mb-6">
              <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
                <ChevronLeft size={24} />
              </button>
              <h2 className="text-lg font-semibold text-slate-800">
                {MONTH_NAMES[month]} {year}
              </h2>
              <button onClick={handleNextMonth} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
                <ChevronRight size={24} />
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAYS_OF_WEEK.map(d => (
                <div key={d} className="text-center text-xs font-medium text-slate-400 uppercase tracking-wider py-2">
                  {d}
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 gap-1 auto-rows-fr">
              {/* Empty slots for start of month */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="h-24 md:h-32 bg-transparent" />
              ))}

              {/* Days */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = formatDateStr(year, month, day);
                const shift = shifts[dateStr];
                const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
                
                // Determine display properties based on shift type
                let displayColor = 'bg-gray-100';
                let displayIcon = <Briefcase size={16} />;
                let displayLabel = "";

                if (shift) {
                  if (shift.type === 'custom') {
                    displayColor = 'bg-purple-100 text-purple-700';
                    displayIcon = <Edit3 size={16} />;
                    displayLabel = shift.customLabel || "Custom";
                  } else {
                    const config = shiftConfigs.find(t => t.id === shift.type);
                    if (config) {
                      displayColor = config.color;
                      displayIcon = getIcon(config.iconName);
                      displayLabel = config.label;
                    }
                  }
                }

                return (
                  <div 
                    key={day} 
                    onClick={() => handleDayClick(day)}
                    className={`h-24 md:h-32 bg-white rounded-xl border border-slate-100 p-1 flex flex-col items-center justify-between cursor-pointer active:scale-95 transition-transform shadow-sm relative overflow-hidden ${isToday ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                  >
                    <span className={`text-sm font-medium ${isToday ? 'text-blue-600' : 'text-slate-700'}`}>{day}</span>
                    
                    {shift && (
                      <div className="w-full flex-1 flex flex-col items-center justify-center gap-1 mt-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${displayColor}`}>
                           {displayIcon}
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase leading-none truncate w-full text-center px-1">
                          {shift.startTime}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === 'list' && (
           <div className="p-4 space-y-3">
             <h2 className="text-lg font-semibold mb-4 text-slate-800">Upcoming Shifts</h2>
             {Object.entries(shifts)
               .sort((a, b) => a[0].localeCompare(b[0]))
               .filter(([date]) => date >= getTodayStr()) // Only show future in list
               .map(([date, shift]) => {
                 let label = "Shift";
                 let color = "bg-gray-100";
                 let textColor = "text-gray-700";
                 let icon = <Briefcase size={16} />;

                 if (shift.type === 'custom') {
                   label = shift.customLabel || "Custom Shift";
                   color = "bg-purple-100";
                   textColor = "text-purple-700";
                   icon = <Edit3 size={16} />;
                 } else {
                   const config = shiftConfigs.find(t => t.id === shift.type);
                   if (config) {
                     label = config.label;
                     color = config.color;
                     textColor = config.textColor;
                     icon = getIcon(config.iconName);
                   }
                 }

                 return (
                   <div key={shift.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                     <div className={`w-12 h-12 rounded-full flex items-center justify-center ${color}`}>
                       <span className={textColor}>{icon}</span>
                     </div>
                     <div>
                       <h3 className="font-semibold text-slate-900">{label}</h3>
                       <p className="text-sm text-slate-500">{date} • {shift.startTime} - {shift.endTime}</p>
                     </div>
                   </div>
                 );
               })}
             {Object.keys(shifts).filter(d => d >= getTodayStr()).length === 0 && (
               <div className="text-center py-10 text-slate-400">
                 No upcoming shifts scheduled.
               </div>
             )}
           </div>
        )}

        {view === 'settings' && (
          <div className="p-4 space-y-6">
            <h2 className="text-lg font-semibold text-slate-800">Default Shift Settings</h2>
            <div className="space-y-4">
              {shiftConfigs.filter(s => s.id !== 'off').map(config => (
                <div key={config.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${config.color}`}>
                       <span className={config.textColor}>{getIcon(config.iconName)}</span>
                    </div>
                    {/* Editable Label */}
                    <input 
                      type="text" 
                      value={config.label}
                      onChange={(e) => updateConfig(config.id, 'label', e.target.value)}
                      className="font-semibold text-slate-900 bg-transparent border-b border-dashed border-slate-300 focus:border-blue-500 focus:outline-none w-full"
                    />
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Start</label>
                      <input 
                        type="time" 
                        value={config.startTime}
                        onChange={(e) => updateConfig(config.id, 'startTime', e.target.value)}
                        className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">End</label>
                      <input 
                        type="time" 
                        value={config.endTime}
                        onChange={(e) => updateConfig(config.id, 'endTime', e.target.value)}
                        className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="pt-4 space-y-3">
              <button 
                onClick={deletePastShifts}
                className="w-full py-3 rounded-xl border border-red-200 text-red-600 font-medium text-sm flex items-center justify-center gap-2 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={16} /> Delete Old Shifts
              </button>

              <button 
                onClick={resetConfigs}
                className="w-full py-3 rounded-xl bg-slate-100 text-slate-600 font-medium text-sm flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors"
              >
                <RotateCcw size={16} /> Reset Defaults
              </button>
            </div>
          </div>
        )}

      </main>

      {/* Tab Bar */}
      <nav className="bg-white/90 backdrop-blur-lg border-t border-slate-200 safe-area-bottom">
        <div className="flex justify-around items-center p-2 pb-4">
          <button 
            onClick={() => setView('calendar')}
            className={`flex flex-col items-center p-2 rounded-lg transition-colors ${view === 'calendar' ? 'text-blue-600' : 'text-slate-400'}`}
          >
            <Calendar size={24} strokeWidth={view === 'calendar' ? 2.5 : 2} />
            <span className="text-[10px] font-medium mt-1">Calendar</span>
          </button>
          
          <button 
            onClick={() => setView('list')}
            className={`flex flex-col items-center p-2 rounded-lg transition-colors ${view === 'list' ? 'text-blue-600' : 'text-slate-400'}`}
          >
            <Briefcase size={24} strokeWidth={view === 'list' ? 2.5 : 2} />
            <span className="text-[10px] font-medium mt-1">Shifts</span>
          </button>

          <button 
            onClick={() => setView('settings')}
            className={`flex flex-col items-center p-2 rounded-lg transition-colors ${view === 'settings' ? 'text-blue-600' : 'text-slate-400'}`}
          >
            <Settings size={24} strokeWidth={view === 'settings' ? 2.5 : 2} />
            <span className="text-[10px] font-medium mt-1">Settings</span>
          </button>
        </div>
      </nav>

      {/* Add Shift Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-200">
            <div className="p-6">
              
              {/* Modal Header */}
              <div className="flex justify-between items-center mb-6">
                 <div>
                   <h3 className="text-xl font-bold text-slate-900">{isCustomMode ? 'Custom Shift' : 'Add Shift'}</h3>
                   <p className="text-sm text-slate-500">{selectedDate}</p>
                 </div>
                 <button onClick={() => setShowAddModal(false)} className="bg-slate-100 p-2 rounded-full text-slate-500">
                   <Plus className="rotate-45" size={20} />
                 </button>
              </div>

              {/* Custom Mode Form */}
              {isCustomMode ? (
                <div className="space-y-4 mb-4">
                  <div>
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Shift Name</label>
                    <input 
                      type="text" 
                      value={customForm.label}
                      onChange={(e) => setCustomForm({...customForm, label: e.target.value})}
                      className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Start</label>
                      <input 
                        type="time" 
                        value={customForm.start}
                        onChange={(e) => setCustomForm({...customForm, start: e.target.value})}
                        className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">End</label>
                      <input 
                        type="time" 
                        value={customForm.end}
                        onChange={(e) => setCustomForm({...customForm, end: e.target.value})}
                        className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setIsCustomMode(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-medium">Cancel</button>
                    <button onClick={addCustomShift} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium shadow-lg shadow-blue-200">Save Shift</button>
                  </div>
                </div>
              ) : (
                /* Standard Mode Grid */
                <>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {shiftConfigs.map((type) => (
                      <button
                        key={type.id}
                        onClick={() => addShift(type.id)}
                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${type.id === 'off' ? 'border-slate-100 bg-slate-50 text-slate-500' : 'border-transparent ' + type.color}`}
                      >
                        <span className={`mb-2 ${type.textColor}`}>{getIcon(type.iconName)}</span>
                        <span className={`font-semibold text-sm ${type.textColor}`}>{type.label}</span>
                        {type.startTime && <span className="text-xs opacity-70 mt-1">{type.startTime}-{type.endTime}</span>}
                      </button>
                    ))}
                    
                    {/* Custom Button */}
                    <button
                        onClick={() => setIsCustomMode(true)}
                        className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-slate-100 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-600 transition-colors"
                      >
                        <span className="mb-2"><Edit3 size={16} /></span>
                        <span className="font-semibold text-sm">Custom</span>
                        <span className="text-xs opacity-70 mt-1">Set times</span>
                    </button>
                  </div>
                  
                  <button 
                    onClick={() => addShift('off')}
                    className="w-full py-3 rounded-xl text-red-500 font-medium text-sm flex items-center justify-center gap-2 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={16} /> Clear Shift
                  </button>
                </>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
