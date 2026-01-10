import { useState, useEffect, useMemo } from 'react';
import { Calendar, Download, Plus, Trash2, Settings, ChevronLeft, ChevronRight, Moon, Sun, Briefcase, Check, RotateCcw, Edit3, DollarSign, Clock, AlertCircle } from 'lucide-react';
import { shiftDB, type ShiftEvent, type ShiftConfig, type PaySettings } from './db';

// --- Types ---

type ShiftType = 'morning' | 'day' | 'night' | 'off' | 'custom';

// --- Defaults ---

const DEFAULT_SHIFT_TYPES: ShiftConfig[] = [
  { id: 'morning', label: 'Morning', color: 'bg-amber-100', textColor: 'text-amber-700', darkColor: 'bg-amber-900/50', darkTextColor: 'text-amber-200', startTime: '06:00', endTime: '14:00', iconName: 'Sun' },
  { id: 'day', label: 'Day', color: 'bg-blue-100', textColor: 'text-blue-700', darkColor: 'bg-blue-900/50', darkTextColor: 'text-blue-200', startTime: '09:00', endTime: '17:00', iconName: 'Briefcase' },
  { id: 'night', label: 'Night', color: 'bg-indigo-100', textColor: 'text-indigo-700', darkColor: 'bg-indigo-900/50', darkTextColor: 'text-indigo-200', startTime: '22:00', endTime: '06:00', iconName: 'Moon' },
  { id: 'off', label: 'Off', color: 'bg-slate-100', textColor: 'text-slate-500', darkColor: 'bg-slate-800', darkTextColor: 'text-slate-400', startTime: '', endTime: '', iconName: 'Check' },
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

let idCounter = 0;
const generateId = () => {
  return `shift_${Date.now()}_${++idCounter}`;
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
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customForm, setCustomForm] = useState({ label: 'Custom Shift', start: '09:00', end: '17:00' });

  // Derived State
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  // --- Dark Mode ---
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (e) {
      console.error('Failed to save theme:', e);
    }
  }, [isDarkMode]);

  // --- Persistence ---

  useEffect(() => {
    const loadData = async () => {
      try {
        setError(null);
        await shiftDB.init();

        const savedShifts = await shiftDB.getAllShifts();
        if (Object.keys(savedShifts).length > 0) {
          setShifts(savedShifts);
        }

        const savedConfigs = await shiftDB.getConfigs();
        if (savedConfigs.length > 0) {
          setShiftConfigs(savedConfigs);
        }

        const savedPay = await shiftDB.getPaySettings();
        if (savedPay) {
          setPaySettings(savedPay);
        }
      } catch (e) {
        const errorMessage = `Failed to load data: ${e}`;
        console.error(errorMessage);
        setError(errorMessage);
      } finally {
        setIsLoaded(true);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    if (isLoaded && Object.keys(shifts).length > 0) {
      shiftDB.putShifts(shifts).catch((e) => {
        console.error('Failed to save shifts:', e);
        setError(`Failed to save shifts: ${e}`);
      });
    }
  }, [shifts, isLoaded]);

  useEffect(() => {
    if (isLoaded && shiftConfigs.length > 0) {
      shiftDB.putConfigs(shiftConfigs).catch((e) => {
        console.error('Failed to save configs:', e);
        setError(`Failed to save configs: ${e}`);
      });
    }
  }, [shiftConfigs, isLoaded]);

  useEffect(() => {
    if (isLoaded && paySettings) {
      shiftDB.putPaySettings(paySettings).catch((e) => {
        console.error('Failed to save pay settings:', e);
        setError(`Failed to save pay settings: ${e}`);
      });
    }
  }, [paySettings, isLoaded]);

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

  const addShift = async (type: ShiftType) => {
    if (!selectedDate) return;
    
    if (type === 'off') {
      try {
        await shiftDB.deleteShift(selectedDate);
        const newShifts = { ...shifts };
        delete newShifts[selectedDate];
        setShifts(newShifts);
      } catch (e) {
        console.error('Failed to delete shift:', e);
        setError(`Failed to delete shift: ${e}`);
      }
      setShowAddModal(false);
      return;
    }

    const config = shiftConfigs.find(t => t.id === type);
    const newShift: ShiftEvent = {
      id: generateId(),
      dateStr: selectedDate,
      type,
      startTime: config?.startTime,
      endTime: config?.endTime,
    };

    try {
      await shiftDB.putShift(newShift);
      setShifts({ ...shifts, [selectedDate]: newShift });
    } catch (e) {
      console.error('Failed to save shift:', e);
      setError(`Failed to save shift: ${e}`);
    }
    setShowAddModal(false);
  };

  const addCustomShift = async () => {
    if (!selectedDate) return;
    const newShift: ShiftEvent = {
      id: generateId(),
      dateStr: selectedDate,
      type: 'custom',
      startTime: customForm.start,
      endTime: customForm.end,
      customLabel: customForm.label
    };
    try {
      await shiftDB.putShift(newShift);
      setShifts({ ...shifts, [selectedDate]: newShift });
    } catch (e) {
      console.error('Failed to save custom shift:', e);
      setError(`Failed to save custom shift: ${e}`);
    }
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

  const generateICS = async () => {
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
      // eslint-disable-next-line prefer-const
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

    // Try multiple approaches for iOS
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (isIOS) {
      // Approach 1: Create hidden anchor and dispatch click event
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = 'myshifts.ics';
      link.style.display = 'none';
      document.body.appendChild(link);

      const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true
      });
      link.dispatchEvent(clickEvent);

      setTimeout(() => {
        document.body.removeChild(link);
        alert(`Exported ${exportCount} shift${exportCount === 1 ? '' : 's'} to calendar!`);
      }, 100);
    } else {
      // Non-iOS: Use data URI approach
      const encodedData = encodeURIComponent(icsContent);
      const dataUri = `data:text/calendar;charset=utf-8,${encodedData}`;
      window.location.href = dataUri;
      
      setTimeout(() => {
        alert(`Exported ${exportCount} shift${exportCount === 1 ? '' : 's'} to calendar!`);
      }, 100);
    }
  };

  const exportData = async () => {
    try {
      const jsonData = await shiftDB.exportData();
      
      // Use data URI to bypass service worker
      const encodedData = encodeURIComponent(jsonData);
      const dataUri = `data:application/json;charset=utf-8,${encodedData}`;
      
      // Open as data URI - browser should handle this
      window.location.href = dataUri;
      
      setTimeout(() => {
        alert('Backup exported successfully!');
      }, 100);
    } catch (e) {
      console.error('Failed to export data:', e);
      setError(`Failed to export data: ${e}`);
    }
  };

  // --- Renders ---

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-slate-100 overflow-hidden">
      
      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 px-4 py-3 pt-12 flex justify-between items-center sticky top-0 z-10">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">ShiftSync</h1>
        <button 
          onClick={generateICS}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium text-sm flex items-center gap-2 shadow-sm shadow-blue-200 active:scale-95 transition-all"
        >
          <Calendar size={16} />
          Add to Calendar
        </button>
      </header>

      {/* Error Notification */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-3 flex items-start gap-2">
          <AlertCircle size={16} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-800 dark:text-red-200 text-sm font-medium">Storage Error</p>
            <p className="text-red-600 dark:text-red-300 text-xs">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200 flex-shrink-0"
          >
            <Plus size={16} className="rotate-45" />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-20">
        
        {view === 'calendar' && (
          <div className="p-4">
            <div className="flex justify-between items-center mb-6">
              <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 dark:text-slate-400">
                <ChevronLeft size={24} />
              </button>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                {MONTH_NAMES[month]} {year}
              </h2>
              <button onClick={handleNextMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 dark:text-slate-400">
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
                let displayTextColor = 'text-gray-700';
                let displayIcon = <Briefcase size={16} />;

                if (shift) {
                  if (shift.type === 'custom') {
                    displayColor = isDarkMode ? 'bg-purple-900/50' : 'bg-purple-100';
                    displayTextColor = isDarkMode ? 'text-purple-200' : 'text-purple-700';
                    displayIcon = <Edit3 size={16} />;
                  } else {
                    const config = shiftConfigs.find(t => t.id === shift.type);
                    if (config) {
                      displayColor = isDarkMode ? config.darkColor : config.color;
                      displayTextColor = isDarkMode ? config.darkTextColor : config.textColor;
                      displayIcon = getIcon(config.iconName);
                    }
                  }
                }

                return (
                  <div 
                    key={day} 
                    onClick={() => handleDayClick(day)}
                    className={`h-24 md:h-32 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-1 flex flex-col items-center justify-between cursor-pointer active:scale-95 transition-transform shadow-sm relative overflow-hidden ${isToday ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900' : ''}`}
                  >
                    <span className={`text-sm font-medium ${isToday ? 'text-blue-600' : 'text-slate-700 dark:text-slate-300'}`}>{day}</span>
                    {shift && (
                      <div className="w-full flex-1 flex flex-col items-center justify-center gap-1 mt-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${displayColor}`}>
                           <span className={displayTextColor}>{displayIcon}</span>
                        </div>
                        <span className={`text-[10px] font-bold uppercase leading-none truncate w-full text-center px-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
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
             <h2 className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-200">Upcoming Shifts</h2>
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
                    color = isDarkMode ? "bg-purple-900/50" : "bg-purple-100";
                    textColor = isDarkMode ? "text-purple-200" : "text-purple-700";
                    icon = <Edit3 size={16} />;
                  } else {
                    const config = shiftConfigs.find(t => t.id === shift.type);
                    if (config) {
                      label = config.label;
                      color = isDarkMode ? config.darkColor : config.color;
                      textColor = isDarkMode ? config.darkTextColor : config.textColor;
                      icon = getIcon(config.iconName);
                    }
                  }

                  return (
                    <div key={shift.id} className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${color}`}>
                        <span className={textColor}>{icon}</span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-white">{label}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{date} • {shift.startTime} - {shift.endTime}</p>
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
               <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 dark:text-slate-400"><ChevronLeft/></button>
               <h2 className="text-xl font-bold text-slate-900 dark:text-white">{MONTH_NAMES[month]} {year}</h2>
               <button onClick={handleNextMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 dark:text-slate-400"><ChevronRight/></button>
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

              <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
                 <div className="flex items-center gap-2 text-slate-400 mb-2">
                   <Clock size={16} /> <span className="text-xs font-bold uppercase">Total Hours</span>
                 </div>
                 <div className="text-2xl font-bold text-slate-800 dark:text-white">{monthlyStats.totalHours.toFixed(1)}</div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
                 <div className="flex items-center gap-2 text-slate-400 mb-2">
                   <Calendar size={16} /> <span className="text-xs font-bold uppercase">Shifts</span>
                 </div>
                 <div className="text-2xl font-bold text-slate-800 dark:text-white">{monthlyStats.count}</div>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl text-sm text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-700">
               Estimates based on settings. Includes Base Pay, Night Differential (${paySettings.nightDiff}/hr), and Weekend Incentive ($ {paySettings.weekendDiff}/hr).
            </div>
          </div>
        )}

        {view === 'settings' && (
          <div className="p-4 space-y-8">
            
            {/* Appearance Section */}
            <section>
               <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                 {isDarkMode ? <Moon size={20} className="text-blue-600"/> : <Sun size={20} className="text-amber-600"/>} Appearance
               </h2>
               <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-4">
                 <button 
                   onClick={() => setIsDarkMode(!isDarkMode)}
                   className="w-full flex items-center justify-between"
                 >
                   <span className="font-medium text-slate-700 dark:text-slate-300">Dark Mode</span>
                   <div className="w-12 h-7 bg-slate-200 dark:bg-blue-600 rounded-full relative transition-colors">
                     <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${isDarkMode ? 'right-1' : 'left-1'}`}></div>
                   </div>
                 </button>
               </div>
            </section>

            {/* Data Section */}
            <section>
               <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                 <Download size={20} className="text-green-600"/> Data
               </h2>
               <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-4 space-y-3">
                 <button 
                   onClick={exportData}
                   className="w-full py-3 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                 >
                   <Download size={16} /> Export Backup
                 </button>
               </div>
            </section>
            
            {/* Rates Section */}
            <section>
               <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                 <DollarSign size={20} className="text-green-600"/> Pay Rates
               </h2>
               <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
                 <div className="p-4 border-b border-slate-50 dark:border-slate-700 flex justify-between items-center">
                   <span className="font-medium text-slate-700 dark:text-slate-300">Base Hourly Rate</span>
                   <div className="flex items-center gap-1">
                     <span className="text-slate-400 dark:text-slate-500">$</span>
                     <input type="number" value={paySettings.hourlyRate} onChange={(e) => updatePaySetting('hourlyRate', e.target.value)} className="w-16 text-right font-bold text-slate-900 dark:text-white bg-transparent focus:outline-none focus:border-b border-blue-500" />
                   </div>
                 </div>
                 <div className="p-4 border-b border-slate-50 dark:border-slate-700 flex justify-between items-center">
                   <span className="font-medium text-slate-700 dark:text-slate-300">Night Differential</span>
                   <div className="flex items-center gap-1">
                     <span className="text-slate-400 dark:text-slate-500">+$</span>
                     <input type="number" value={paySettings.nightDiff} onChange={(e) => updatePaySetting('nightDiff', e.target.value)} className="w-16 text-right font-bold text-slate-900 dark:text-white bg-transparent focus:outline-none focus:border-b border-blue-500" />
                   </div>
                 </div>
                 <div className="p-4 flex justify-between items-center">
                   <span className="font-medium text-slate-700 dark:text-slate-300">Weekend Incentive</span>
                   <div className="flex items-center gap-1">
                     <span className="text-slate-400 dark:text-slate-500">+$</span>
                     <input type="number" value={paySettings.weekendDiff} onChange={(e) => updatePaySetting('weekendDiff', e.target.value)} className="w-16 text-right font-bold text-slate-900 dark:text-white bg-transparent focus:outline-none focus:border-b border-blue-500" />
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
                        <input type="time" value={paySettings.nightStart} onChange={(e) => updatePayTimeString('nightStart', e.target.value)} className="w-full p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white" />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-slate-400 mb-1 block">End</label>
                        <input type="time" value={paySettings.nightEnd} onChange={(e) => updatePayTimeString('nightEnd', e.target.value)} className="w-full p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white" />
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
                            className={`w-9 h-9 rounded-full text-xs font-bold transition-all ${paySettings.weekendDays.includes(index) ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
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
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                <Clock size={20} className="text-blue-600"/> Shift Defaults
              </h2>
              <div className="space-y-4">
                {shiftConfigs.filter(s => s.id !== 'off').map(config => (
                  <div key={config.id} className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDarkMode ? config.darkColor : config.color}`}>
                        <span className={isDarkMode ? config.darkTextColor : config.textColor}>{getIcon(config.iconName)}</span>
                      </div>
                      <input 
                        type="text" 
                        value={config.label}
                        onChange={(e) => updateConfig(config.id, 'label', e.target.value)}
                        className="font-semibold text-slate-900 dark:text-white bg-transparent border-b border-dashed border-slate-300 dark:border-slate-600 focus:border-blue-500 focus:outline-none w-full"
                      />
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <input 
                          type="time" 
                          value={config.startTime}
                          onChange={(e) => updateConfig(config.id, 'startTime', e.target.value)}
                          className="w-full p-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white text-sm focus:outline-none"
                        />
                      </div>
                      <span className="text-slate-300 dark:text-slate-600">-</span>
                      <div className="flex-1">
                        <input 
                          type="time" 
                          value={config.endTime}
                          onChange={(e) => updateConfig(config.id, 'endTime', e.target.value)}
                          className="w-full p-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white text-sm focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <button 
              onClick={resetConfigs}
              className="w-full py-4 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              <RotateCcw size={16} /> Reset All Settings
            </button>
          </div>
        )}

      </main>

      {/* Tab Bar */}
      <nav className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-lg border-t border-slate-200 dark:border-slate-700 safe-area-bottom">
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
          <div className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-200">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                 <div>
                   <h3 className="text-xl font-bold text-slate-900 dark:text-white">{isCustomMode ? 'Custom Shift' : 'Add Shift'}</h3>
                   <p className="text-sm text-slate-500 dark:text-slate-400">{selectedDate}</p>
                 </div>
                 <button onClick={() => setShowAddModal(false)} className="bg-slate-100 dark:bg-slate-700 p-2 rounded-full text-slate-500 dark:text-slate-400">
                   <Plus className="rotate-45" size={20} />
                 </button>
              </div>

              {isCustomMode ? (
                <div className="space-y-4 mb-4">
                  <div>
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Shift Name</label>
                    <input type="text" value={customForm.label} onChange={(e) => setCustomForm({...customForm, label: e.target.value})} className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Start</label>
                      <input type="time" value={customForm.start} onChange={(e) => setCustomForm({...customForm, start: e.target.value})} className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">End</label>
                      <input type="time" value={customForm.end} onChange={(e) => setCustomForm({...customForm, end: e.target.value})} className="w-full mt-1 p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setIsCustomMode(false)} className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-medium">Cancel</button>
                    <button onClick={addCustomShift} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium shadow-lg shadow-blue-200">Save Shift</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {shiftConfigs.map((type) => {
                      const buttonColor = type.id === 'off' 
                        ? 'bg-slate-50 dark:bg-slate-700 text-slate-500' 
                        : (isDarkMode ? type.darkColor : type.color);
                      const iconColor = isDarkMode ? type.darkTextColor : type.textColor;
                      
                      return (
                        <button 
                          key={type.id} 
                          onClick={() => addShift(type.id)} 
                          className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${type.id === 'off' ? 'border-slate-100 dark:border-slate-600' : 'border-transparent'} ${buttonColor}`}
                        >
                          <span className={`mb-2 ${iconColor}`}>{getIcon(type.iconName)}</span>
                          <span className={`font-semibold text-sm ${iconColor}`}>{type.label}</span>
                          {type.startTime && <span className="text-xs opacity-70 mt-1">{type.startTime}-{type.endTime}</span>}
                        </button>
                      );
                    })}
                    <button onClick={() => setIsCustomMode(true)} className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-slate-100 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-500 hover:border-blue-200 hover:text-blue-600 transition-colors">
                        <span className="mb-2"><Edit3 size={16} /></span>
                        <span className="font-semibold text-sm">Custom</span>
                        <span className="text-xs opacity-70 mt-1">Set times</span>
                    </button>
                  </div>
                  <button onClick={() => addShift('off')} className="w-full py-3 rounded-xl text-red-500 font-medium text-sm flex items-center justify-center gap-2 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
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
