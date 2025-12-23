import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Download, Plus, Trash2, Settings, ChevronLeft, ChevronRight, Moon, Sun, Briefcase, Check, RotateCcw, Edit3, DollarSign, Clock } from 'lucide-react';

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
  customLabel?: string;
}

interface PaySettings {
  hourlyRate: number;
  nightDiff: number;    // Extra $ per hour
  weekendDiff: number;  // Extra $ per hour
  nightStart: string;   // HH:mm (e.g., 22:00)
  nightEnd: string;     // HH:mm (e.g., 06:00)
  weekendDays: number[]; // Array of day indices (0=Sun, 1=Mon, etc.)
}

// --- Defaults ---

const DEFAULT_SHIFT_TYPES: ShiftConfig[] = [
  { id: 'morning', label: 'Morning', color: 'bg-amber-100', textColor: 'text-amber-700', startTime: '06:00', endTime: '14:00', iconName: 'Sun' },
  { id: 'day', label: 'Day', color: 'bg-blue-100', textColor: 'text-blue-700', startTime: '09:00', endTime: '17:00', iconName: 'Briefcase' },
  { id: 'night', label: 'Night', color: 'bg-indigo-100', textColor: 'text-indigo-700', startTime: '22:00', endTime: '06:00', iconName: 'Moon' },
  { id: 'off', label: 'Off', color: 'bg-slate-100', textColor: 'text-slate-500', startTime: '', endTime: '', iconName: 'Check' },
];

const DEFAULT_PAY_SETTINGS: PaySettings = {
  hourlyRate: 25.00,
  nightDiff: 2.00,
  weekendDiff: 1.50,
  nightStart: '22:00',
  nightEnd: '06:00',
  weekendDays: [0, 6] // Default Sun, Sat
};

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

// --- Pay Calculation Logic ---

const parseTime = (timeStr: string) => {
  const [h, m] = timeStr.split(':').map(Number);
  return h + m / 60;
};

const calculateShiftPay = (shift: ShiftEvent, paySettings: PaySettings) => {
  if (shift.type === 'off') return { total: 0, hours: 0, nightHours: 0 };
  
  const start = parseTime(shift.startTime || '09:00');
  let end = parseTime(shift.endTime || '17:00');
  
  // Handle overnight shift crossing midnight
  if (end < start) end += 24;
  
  const totalHours = end - start;
  
  // --- Night Diff Calculation ---
  let nightHours = 0;
  
  // Define Night Window relative to a 24h clock, potentially crossing midnight
  const ns = parseTime(paySettings.nightStart);
  let ne = parseTime(paySettings.nightEnd);
  if (ne < ns) ne += 24; // e.g. 22:00 to 06:00 becomes 22.0 to 30.0
  
  // We check overlap against 3 possible windows to handle all edge cases:
  // 1. Previous Night (e.g., 22:00 yesterday to 06:00 today) -> [-2, 6]
  // 2. Current Night (e.g., 22:00 today to 06:00 tomorrow) -> [22, 30]
  // 3. Next Night (e.g. 46 to 54) - unlikely for single shift but safe to include
  
  const windows = [
      { start: ns - 24, end: ne - 24 },
      { start: ns, end: ne },
      { start: ns + 24, end: ne + 24 }
  ];

  windows.forEach(win => {
      // Find intersection: max of starts, min of ends
      const overlapStart = Math.max(start, win.start);
      const overlapEnd = Math.min(end, win.end);
      
      if (overlapEnd > overlapStart) {
          nightHours += (overlapEnd - overlapStart);
      }
  });

  // Cap night hours at total hours (just in case of weird math, though unlikely)
  nightHours = Math.min(nightHours, totalHours);

  let pay = totalHours * paySettings.hourlyRate;
  pay += nightHours * paySettings.nightDiff;

  // --- Weekend Diff Calculation ---
  const date = new Date(shift.dateStr);
  // Note: Date strings are YYYY-MM-DD. creating 'new Date()' uses UTC or local depending on browser,
  // but for .getDay() we want to ensure we are talking about the specific calendar day selected.
  // We add 'T12:00:00' to ensure we don't hit timezone edge cases rolling back a day.
  const checkDate = new Date(`${shift.dateStr}T12:00:00`);
  const dayIndex = checkDate.getDay(); 
  
  if (paySettings.weekendDays.includes(dayIndex)) {
    pay += totalHours * paySettings.weekendDiff;
  }

  return { total: pay, hours: totalHours, nightHours };
};

// --- Main App Component ---

export default function App() {
  // State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  
  const [shifts, setShifts] = useState<Record<string, ShiftEvent>>({});
  const [shiftConfigs, setShiftConfigs] = useState<ShiftConfig[]>(DEFAULT_SHIFT_TYPES);
  const [paySettings, setPaySettings] = useState<PaySettings>(DEFAULT_PAY_SETTINGS);
  
  const [view, setView] = useState<'calendar' | 'list' | 'earnings' | 'settings'>('calendar');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  
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

      const savedPay = localStorage.getItem('pay-settings');
      if (savedPay) setPaySettings(JSON.parse(savedPay));
    } catch (e) {
      console.error("Failed to load data", e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isLoaded) {
        localStorage.setItem('shift-data', JSON.stringify(shifts));
        localStorage.setItem('shift-configs', JSON.stringify(shiftConfigs));
        localStorage.setItem('pay-settings', JSON.stringify(paySettings));
    }
  }, [shifts, shiftConfigs, paySettings, isLoaded]);

  // --- Earnings Calculation Memo ---
  const monthlyStats = useMemo(() => {
    let grandTotal = 0;
    let totalHours = 0;
    
    // Filter shifts for currently selected month/year
    const relevantShifts = Object.values(shifts).filter(s => {
       const [y, m] = s.dateStr.split('-').map(Number);
       return y === year && (m - 1) === month;
    });

    relevantShifts.forEach(shift => {
       const { total, hours } = calculateShiftPay(shift, paySettings);
       grandTotal += total;
       totalHours += hours;
    });

    return { grandTotal, totalHours, count: relevantShifts.length };
  }, [shifts, paySettings, year, month]);

  // --- Handlers ---

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const handleDayClick = (day: number) => {
    const dateStr = formatDateStr(year, month, day);
    setSelectedDate(dateStr);
    setIsCustomMode(false);
    setShowAddModal(true);
  };

  const addShift = (type: ShiftType) => {
    if (!selectedDate) return;
    
    if (type === 'off') {
      const newShifts = { ...shifts };
      delete newShifts[selectedDate];
      setShifts(newShifts);
      setShowAddModal(false);
      return;
    }

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
  
  const updatePaySetting = (field: keyof PaySettings, value: string) => {
    setPaySettings(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
  };

  const updatePayTimeString = (field: keyof PaySettings, value: string) => {
    setPaySettings(prev => ({ ...prev, [field]: value }));
  };

  const toggleWeekendDay = (dayIndex: number) => {
    setPaySettings(prev => {
        const current = prev.weekendDays || [];
        if (current.includes(dayIndex)) {
            return { ...prev, weekendDays: current.filter(d => d !== dayIndex) };
        } else {
            return { ...prev, weekendDays: [...current, dayIndex] };
        }
    });
  };

  const resetConfigs = () => {
    if (confirm('Reset shift times to default?')) {
        setShiftConfigs(DEFAULT_SHIFT_TYPES);
    }
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
      // SMART EXPORT: Only future shifts to avoid duplicates
      if (shift.dateStr < today) return;

      let label = "Shift";
      if (shift.type === 'custom') {
        label = shift.customLabel || "Custom Shift";
      } else {
        const config = shiftConfigs.find(t => t.id === shift.type);
        if (config) label = config.label;
      }

      const [y, m, d] = shift.dateStr.split('-').map(Number);
      const [startH, startM] = (shift.startTime || '09:00').split(':').map(Number);
      const [endH, endM] = (shift.endTime || '17:00').split(':').map(Number);
      const startDate = new Date(y, m - 1, d, startH, startM);
      let endDate = new Date(y, m - 1, d, endH, endM);
      if (endDate < startDate) endDate.setDate(endDate.getDate() + 1);

      const formatICSDate = (date: Date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

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
      alert("No future shifts found to export.");
      return;
    }

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

            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAYS_OF_WEEK.map(d => (
                <div key={d} className="text-center text-xs font-medium text-slate-400 uppercase tracking-wider py-2">
                  {d}
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 gap-1 auto-rows-fr">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="h-24 md:h-32 bg-transparent" />
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = formatDateStr(year, month, day);
                const shift = shifts[dateStr];
                const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
                
                let displayColor = 'bg-gray-100';
                let displayIcon = <Briefcase size={16} />;

                if (shift) {
                  if (shift.type === 'custom') {
                    displayColor = 'bg-purple-100 text-purple-700';
                    displayIcon = <Edit3 size={16} />;
                  } else {
                    const config = shiftConfigs.find(t => t.id === shift.type);
                    if (config) {
                      displayColor = config.color;
                      displayIcon = getIcon(config.iconName);
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
               .filter(([date]) => date >= getTodayStr())
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

        {view === 'earnings' && (
          <div className="p-4 space-y-6">
            <div className="flex justify-between items-center">
               <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><ChevronLeft/></button>
               <h2 className="text-xl font-bold text-slate-900">{MONTH_NAMES[month]} {year}</h2>
               <button onClick={handleNextMonth} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><ChevronRight/></button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-200 col-span-2">
                <div className="flex items-center gap-2 opacity-80 mb-1">
                  <DollarSign size={18} />
                  <span className="text-sm font-medium">Estimated Pay</span>
                </div>
                <div className="text-3xl font-bold">
                  ${monthlyStats.grandTotal.toFixed(2)}
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                 <div className="flex items-center gap-2 text-slate-400 mb-2">
                   <Clock size={16} /> <span className="text-xs font-bold uppercase">Total Hours</span>
                 </div>
                 <div className="text-2xl font-bold text-slate-800">{monthlyStats.totalHours.toFixed(1)}</div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                 <div className="flex items-center gap-2 text-slate-400 mb-2">
                   <Calendar size={16} /> <span className="text-xs font-bold uppercase">Shifts</span>
                 </div>
                 <div className="text-2xl font-bold text-slate-800">{monthlyStats.count}</div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-500 border border-slate-100">
               Estimates based on settings. Includes Base Pay, Night Differential (${paySettings.nightDiff}/hr), and Weekend Incentive ($ {paySettings.weekendDiff}/hr).
            </div>
          </div>
        )}

        {view === 'settings' && (
          <div className="p-4 space-y-8">
            
            {/* Rates Section */}
            <section>
               <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                 <DollarSign size={20} className="text-green-600"/> Pay Rates
               </h2>
               <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                 <div className="p-4 border-b border-slate-50 flex justify-between items-center">
                   <span className="font-medium text-slate-700">Base Hourly Rate</span>
                   <div className="flex items-center gap-1">
                     <span className="text-slate-400">$</span>
                     <input type="number" value={paySettings.hourlyRate} onChange={(e) => updatePaySetting('hourlyRate', e.target.value)} className="w-16 text-right font-bold text-slate-900 bg-transparent focus:outline-none focus:border-b border-blue-500" />
                   </div>
                 </div>
                 <div className="p-4 border-b border-slate-50 flex justify-between items-center">
                   <span className="font-medium text-slate-700">Night Differential</span>
                   <div className="flex items-center gap-1">
                     <span className="text-slate-400">+$</span>
                     <input type="number" value={paySettings.nightDiff} onChange={(e) => updatePaySetting('nightDiff', e.target.value)} className="w-16 text-right font-bold text-slate-900 bg-transparent focus:outline-none focus:border-b border-blue-500" />
                   </div>
                 </div>
                 <div className="p-4 flex justify-between items-center">
                   <span className="font-medium text-slate-700">Weekend Incentive</span>
                   <div className="flex items-center gap-1">
                     <span className="text-slate-400">+$</span>
                     <input type="number" value={paySettings.weekendDiff} onChange={(e) => updatePaySetting('weekendDiff', e.target.value)} className="w-16 text-right font-bold text-slate-900 bg-transparent focus:outline-none focus:border-b border-blue-500" />
                   </div>
                 </div>
               </div>
               
               {/* Differential Settings */}
               <div className="mt-6 space-y-4">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Night Differential Hours</h3>
                    <div className="flex gap-3 text-sm">
                      <div className="flex-1">
                        <label className="text-xs text-slate-400 mb-1 block">Start</label>
                        <input type="time" value={paySettings.nightStart} onChange={(e) => updatePayTimeString('nightStart', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg" />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-slate-400 mb-1 block">End</label>
                        <input type="time" value={paySettings.nightEnd} onChange={(e) => updatePayTimeString('nightEnd', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Weekend Applies On</h3>
                    <div className="flex gap-1 justify-between">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                          <button 
                            key={day} 
                            onClick={() => toggleWeekendDay(index)}
                            className={`w-9 h-9 rounded-full text-xs font-bold transition-all ${paySettings.weekendDays.includes(index) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                          >
                            {day[0]}
                          </button>
                      ))}
                    </div>
                  </div>
               </div>
            </section>

            {/* Shift Config Section */}
            <section>
              <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Clock size={20} className="text-blue-600"/> Shift Defaults
              </h2>
              <div className="space-y-4">
                {shiftConfigs.filter(s => s.id !== 'off').map(config => (
                  <div key={config.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${config.color}`}>
                        <span className={config.textColor}>{getIcon(config.iconName)}</span>
                      </div>
                      <input 
                        type="text" 
                        value={config.label}
                        onChange={(e) => updateConfig(config.id, 'label', e.target.value)}
                        className="font-semibold text-slate-900 bg-transparent border-b border-dashed border-slate-300 focus:border-blue-500 focus:outline-none w-full"
                      />
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <input 
                          type="time" 
                          value={config.startTime}
                          onChange={(e) => updateConfig(config.id, 'startTime', e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none"
                        />
                      </div>
                      <span className="text-slate-300">-</span>
                      <div className="flex-1">
                        <input 
                          type="time" 
                          value={config.endTime}
                          onChange={(e) => updateConfig(config.id, 'endTime', e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <button 
              onClick={resetConfigs}
              className="w-full py-4 rounded-xl bg-slate-100 text-slate-500 font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors"
            >
              <RotateCcw size={16} /> Reset All Settings
            </button>
          </div>
        )}

      </main>

      {/* Tab Bar */}
      <nav className="bg-white/90 backdrop-blur-lg border-t border-slate-200 safe-area-bottom">
        <div className="flex justify-around items-center p-2 pb-4">
          <button onClick={() => setView('calendar')} className={`flex flex-col items-center p-2 rounded-lg transition-colors ${view === 'calendar' ? 'text-blue-600' : 'text-slate-400'}`}>
            <Calendar size={24} strokeWidth={view === 'calendar' ? 2.5 : 2} />
            <span className="text-[10px] font-medium mt-1">Calendar</span>
          </button>
          
          <button onClick={() => setView('list')} className={`flex flex-col items-center p-2 rounded-lg transition-colors ${view === 'list' ? 'text-blue-600' : 'text-slate-400'}`}>
            <Briefcase size={24} strokeWidth={view === 'list' ? 2.5 : 2} />
            <span className="text-[10px] font-medium mt-1">Shifts</span>
          </button>

          <button onClick={() => setView('earnings')} className={`flex flex-col items-center p-2 rounded-lg transition-colors ${view === 'earnings' ? 'text-blue-600' : 'text-slate-400'}`}>
            <DollarSign size={24} strokeWidth={view === 'earnings' ? 2.5 : 2} />
            <span className="text-[10px] font-medium mt-1">Pay</span>
          </button>

          <button onClick={() => setView('settings')} className={`flex flex-col items-center p-2 rounded-lg transition-colors ${view === 'settings' ? 'text-blue-600' : 'text-slate-400'}`}>
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
              <div className="flex justify-between items-center mb-6">
                 <div>
                   <h3 className="text-xl font-bold text-slate-900">{isCustomMode ? 'Custom Shift' : 'Add Shift'}</h3>
                   <p className="text-sm text-slate-500">{selectedDate}</p>
                 </div>
                 <button onClick={() => setShowAddModal(false)} className="bg-slate-100 p-2 rounded-full text-slate-500">
                   <Plus className="rotate-45" size={20} />
                 </button>
              </div>

              {isCustomMode ? (
                <div className="space-y-4 mb-4">
                  <div>
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Shift Name</label>
                    <input type="text" value={customForm.label} onChange={(e) => setCustomForm({...customForm, label: e.target.value})} className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Start</label>
                      <input type="time" value={customForm.start} onChange={(e) => setCustomForm({...customForm, start: e.target.value})} className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">End</label>
                      <input type="time" value={customForm.end} onChange={(e) => setCustomForm({...customForm, end: e.target.value})} className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setIsCustomMode(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-medium">Cancel</button>
                    <button onClick={addCustomShift} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium shadow-lg shadow-blue-200">Save Shift</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {shiftConfigs.map((type) => (
                      <button key={type.id} onClick={() => addShift(type.id)} className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${type.id === 'off' ? 'border-slate-100 bg-slate-50 text-slate-500' : 'border-transparent ' + type.color}`}>
                        <span className={`mb-2 ${type.textColor}`}>{getIcon(type.iconName)}</span>
                        <span className={`font-semibold text-sm ${type.textColor}`}>{type.label}</span>
                        {type.startTime && <span className="text-xs opacity-70 mt-1">{type.startTime}-{type.endTime}</span>}
                      </button>
                    ))}
                    <button onClick={() => setIsCustomMode(true)} className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-slate-100 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-600 transition-colors">
                        <span className="mb-2"><Edit3 size={16} /></span>
                        <span className="font-semibold text-sm">Custom</span>
                        <span className="text-xs opacity-70 mt-1">Set times</span>
                    </button>
                  </div>
                  <button onClick={() => addShift('off')} className="w-full py-3 rounded-xl text-red-500 font-medium text-sm flex items-center justify-center gap-2 hover:bg-red-50 transition-colors">
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
