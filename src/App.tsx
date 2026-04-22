/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  ChevronLeft,
  Wind,
  Moon,
  Sun,
  LayoutGrid,
  Calendar as CalendarIcon,
  Info,
  Compass,
  Star,
  Sparkles,
  Plus,
  Eye,
  Bird,
  Trash2,
  Brain,
  RefreshCw,
  MoonStar,
  Clock,
  AlertTriangle,
  AlertCircle,
  Tornado,
  CloudLightning,
  CloudRain,
  Snowflake,
  Cloud,
  CloudSnow,
} from "lucide-react";
import { generateWeatherInsight } from "./services/geminiService";
import { getMoonData, fetchMoonData, MoonData } from "./services/moonService";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  differenceInDays,
} from "date-fns";
import { ru } from "date-fns/locale";
import {
  TOGOOLS,
  AMALS,
  MUCHOL_YEARS,
  WIND_DIRECTIONS,
  NATURE_SIGNS,
  Togool,
} from "./data/traditionalData.ts";

// Constants for calculation
const REFERENCE_TOGOOL_ID = 11;
const REFERENCE_DATE = new Date(2026, 2, 21); // March 21, 2026

const GET_MUCHOL = (year: number) => {
  const len = MUCHOL_YEARS.length;
  const index = (year - 1900 + 1) % len;
  return MUCHOL_YEARS[index >= 0 ? index : index + len];
};

const getTogoolForDate = (date: Date): Togool => {
  // Use approximate month to find the expected Togool for this period
  // In the Sarygulov method, each month is named after its characteristic Togool ID
  const monthNames = [
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь",
  ];
  const monthName = monthNames[date.getMonth()];

  // Find the Togool that belongs to this month
  const togool =
    TOGOOLS.find((t) => t.approximateMonth === monthName) || TOGOOLS[0];
  return togool;
};

const isTogoolDay = (date: Date): boolean => {
  const togool = getTogoolForDate(date);
  const moon = getMoonData(date);
  // A Togool Day is when the lunar day (age) matches the Month's Togool ID
  return moon.lunarDay === togool.id;
};

const getAmalForDate = (date: Date) => {
  const month = date.getMonth();
  const day = date.getDate();

  // 1. Беш тогоол (March-April) - ~March 20 to April 20
  if ((month === 2 && day >= 20) || (month === 3 && day <= 20)) return AMALS[0];

  // 2. Үркөрүнүн батышы (May 10-15)
  if (month === 4 && day >= 10 && day <= 15) return AMALS[1];

  // 3. Кийик качты (June)
  if (month === 5) return AMALS[2];

  // 4. Кырк чилде (Summer: June 25 - Aug 5)
  if ((month === 5 && day >= 25) || month === 6 || (month === 7 && day <= 5))
    return AMALS[4];

  // 5. Кырк чилде (Winter: Dec 22 - Jan 31)
  if ((month === 11 && day >= 22) || month === 0) return AMALS[3];

  return null;
};

const WeatherIcon = ({ 
  rain, 
  snow, 
  wind, 
  size = 14, 
  className = "" 
}: { 
  rain: number, 
  snow: number, 
  wind: number, 
  size?: number, 
  className?: string 
}) => {
  if (snow > 40) return <CloudSnow size={size} className={`text-blue-200 ${className}`} />;
  if (rain > 70) return <CloudLightning size={size} className={`text-accent ${className}`} />;
  if (rain > 30) return <CloudRain size={size} className={`text-blue-400 ${className}`} />;
  if (wind > 50) return <Wind size={size} className={`text-text-dim ${className}`} />;
  if (rain > 10) return <Cloud size={size} className={`text-text-dim/60 ${className}`} />;
  return <Sun size={size} className={`text-accent ${className}`} />;
};

interface HourlyPoint {
  hour: number;
  label: string;
  traditionalName: string;
  tempOffset: number;
  activityLevel: number;
}

const TRADITIONAL_HOURS: HourlyPoint[] = [
  { hour: 0, label: "00:00", traditionalName: "Түн ортосу", tempOffset: -2, activityLevel: 10 },
  { hour: 2, label: "02:00", traditionalName: "Ороо", tempOffset: -4, activityLevel: 5 },
  { hour: 4, label: "04:00", traditionalName: "Саар", tempOffset: -5, activityLevel: 8 },
  { hour: 6, label: "06:00", traditionalName: "Таң", tempOffset: -3, activityLevel: 25 },
  { hour: 8, label: "08:00", traditionalName: "Күн чыгыш", tempOffset: 0, activityLevel: 35 },
  { hour: 10, label: "10:00", traditionalName: "Шашке", tempOffset: 3, activityLevel: 50 },
  { hour: 12, label: "12:00", traditionalName: "Чак түш", tempOffset: 6, activityLevel: 80 },
  { hour: 14, label: "14:00", traditionalName: "Сартан", tempOffset: 8, activityLevel: 95 },
  { hour: 16, label: "16:00", traditionalName: "Намаздыгер", tempOffset: 6, activityLevel: 70 },
  { hour: 18, label: "18:00", traditionalName: "Күүгүм", tempOffset: 3, activityLevel: 45 },
  { hour: 20, label: "20:00", traditionalName: "Куптан", tempOffset: 1, activityLevel: 30 },
  { hour: 22, label: "22:00", traditionalName: "Түн", tempOffset: -1, activityLevel: 15 },
];

/**
 * Sarygulov Forecasting Engine
 * 1. Year (Muchol) - Base climate
 * 2. Month (Togool Wind Code) - Monthly trend
 * 3. Day (Amal / Indicators) - Daily precision
 */
const predictWeather = (
  date: Date,
  observations: Record<string, string[]>,
  togool: Togool,
  muchol: { name: string; nature: string },
) => {
  let rainProb = 20;
  let windProb = 10;
  let snowProb = 0;
  const isWinter = ["winter", "autumn"].includes(togool.season);

  // Year Base
  if (muchol.nature.includes("Влажный") || muchol.nature.includes("Дождливый"))
    rainProb += 30;
  if (muchol.nature.includes("Суровый") || muchol.nature.includes("Холодный"))
    snowProb += 40;
  if (muchol.nature.includes("Ветреный")) windProb += 40;

  // Monthly Cycle: Find the observation on the day of the last Togool alignment
  const obsDates = Object.keys(observations).sort().reverse();
  const lastTogoolKey = obsDates.find((d) => {
    const obsDate = new Date(d);
    const diff = differenceInDays(date, obsDate);
    // Prognosis holds for 1 lunar month, and we prioritize observations on Togool days
    return diff >= 0 && diff <= 30 && isTogoolDay(obsDate);
  });

  let trend = "Стабильный";
  if (lastTogoolKey) {
    const lastTogoolDate = new Date(lastTogoolKey);
    const observerAmal = getAmalForDate(lastTogoolDate);
    const obs = observations[lastTogoolKey];

    if (obs.includes("wind_w")) {
      trend = "Дождливая программа";
      rainProb += 50;
    }
    if (obs.includes("wind_n")) {
      trend = "Холодная программа";
      snowProb += 50;
    }
    if (obs.includes("wind_s")) {
      trend = "Сухая программа";
      rainProb -= 40;
    }

    // Dynamic Amal impact during Togool observation
    if (observerAmal) {
      trend += ` (${observerAmal.name})`;
      if (observerAmal.name === "Беш тогоол") {
        rainProb += 20;
        windProb += 30;
      }
      if (observerAmal.name.includes("Үркөр")) {
        // If Pleiades set in rain (detected via wind code), summer is wet
        if (obs.includes("wind_w")) rainProb += 30;
      }
    }
  }

  // Daily Adjustment (Amals & Signs)
  const currentAmalDaily = getAmalForDate(date);
  if (currentAmalDaily) {
    if (currentAmalDaily.name === "Беш тогоол") {
      rainProb += 20;
      windProb += 20;
    }
    if (currentAmalDaily.name === "Кырк чилде (Зимняя)") {
      snowProb += 30;
    }
    if (
      currentAmalDaily.name === "Кийик качты" ||
      currentAmalDaily.name.includes("Летняя")
    ) {
      rainProb -= 20; // Periods of intense heat/dryness
    }
  }

  const currentObs = observations[format(date, "yyyy-MM-dd")] || [];
  currentObs.forEach((id) => {
    if (id === "sheep_crowd") windProb += 50;
    if (id === "moon_up") snowProb += 60;
    if (id === "wind_w") rainProb += 40;
  });

  // Confidence Level Calculation
  let confidence = 20;
  let reason = "Базовая точность";
  if (lastTogoolKey) {
    confidence += 40;
    reason = "Подтверждено циклом Тогоол";
  }
  if (currentObs.length > 0) {
    confidence += Math.min(30, currentObs.length * 15);
    reason += " + Приметы";

    // Amal Matching Validation: Robust check against confirming signs
    if (currentAmalDaily && currentAmalDaily.confirmingSigns) {
      const isMatchedByAmal = currentAmalDaily.confirmingSigns.some((id) =>
        currentObs.includes(id),
      );
      if (isMatchedByAmal) {
        confidence += 15;
        reason += " (Amal Confirmed)";
      }
    }
  }

  return {
    rain: Math.min(100, Math.max(0, rainProb)),
    wind: Math.min(100, Math.max(0, windProb)),
    snow: Math.min(100, Math.max(0, isWinter ? snowProb : 0)),
    confidence: Math.min(95, confidence),
    confidenceReason: reason,
    trend,
    summary: `${togool.description}. ${trend} месяца.`,
  };
};

interface StatCardProps {
  title: string;
  value: string | number;
  unit?: string;
  className?: string;
  children?: React.ReactNode;
}

const StatCard: React.FC<StatCardProps & { small?: boolean }> = ({
  title,
  value,
  unit,
  className = "",
  children,
  small = false,
}) => {
  return (
    <div className={`stat-card ${className}`}>
      <span className="cell-text-dim block mb-2">{title}</span>
      <div className="flex items-baseline gap-1">
        <div
          className={`${small ? "text-lg" : "text-2xl"} font-serif italic text-brand-900 leading-none`}
        >
          {value}
        </div>
        {unit && (
          <span className="text-[11px] text-text-dim uppercase font-bold tracking-wider">
            {unit}
          </span>
        )}
      </div>
      {children}
    </div>
  );
};

const RealTimeClock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const moon = getMoonData(time);

  return (
    <div className="bg-brand-900 p-4 rounded-2xl border border-accent/20 shadow-lg mb-8 relative overflow-hidden group">
      <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform">
        <Clock size={80} className="text-white" />
      </div>
      <div className="relative z-10">
        <div className="flex items-end justify-between mb-2">
          <div className="text-3xl font-mono font-bold text-accent tracking-tighter leading-none">
            {format(time, "HH:mm:ss")}
          </div>
          <div className="text-[10px] text-white/40 font-bold uppercase tracking-widest text-right">
            {format(time, "dd MMM yyyy", { locale: ru })}
          </div>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-white/60 font-bold uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <MoonStar size={12} className="text-accent animate-pulse" />
            <span>{moon.lunarDay} л.д.</span>
          </div>
          <div className="w-1 h-1 bg-white/20 rounded-full" />
          <div className="flex items-center gap-1.5">
            <Moon size={12} />
            <span>{moon.name}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [slideDirection, setSlideDirection] = useState(0);
  const [activeTab, setActiveTab] = useState<"calendar" | "method">("calendar");
  const [isAddingObservation, setIsAddingObservation] = useState(false);
  const [customObservation, setCustomObservation] = useState("");
  const [isSidebarLeftOpen, setIsSidebarLeftOpen] = useState(false);
  const [isSidebarRightOpen, setIsSidebarRightOpen] = useState(false);
  const [observations, setObservations] = useState<Record<string, string[]>>(
    () => {
      try {
        const saved = localStorage.getItem("sarygulov_observations");
        return saved ? JSON.parse(saved) : {};
      } catch {
        return {};
      }
    },
  );

  const saveObservation = (signId: string, custom?: string) => {
    const dateKey = format(selectedDate, "yyyy-MM-dd");
    const updated = { ...observations };
    if (!updated[dateKey]) updated[dateKey] = [];

    if (custom) {
      updated[dateKey] = [...updated[dateKey], `custom:${custom}`];
      setCustomObservation("");
    } else if (!updated[dateKey].includes(signId)) {
      updated[dateKey] = [...updated[dateKey], signId];
    }

    setObservations(updated);
    localStorage.setItem("sarygulov_observations", JSON.stringify(updated));
    setIsAddingObservation(false);
  };

  const removeObservation = (signId: string) => {
    const dateKey = format(selectedDate, "yyyy-MM-dd");
    const updated = { ...observations };
    if (updated[dateKey]) {
      updated[dateKey] = updated[dateKey].filter((id) => id !== signId);
      if (updated[dateKey].length === 0) delete updated[dateKey];
    }
    setObservations(updated);
    localStorage.setItem("sarygulov_observations", JSON.stringify(updated));
  };

  const [weatherData, setWeatherData] = useState<any>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [forecastData, setForecastData] = useState<any>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [moonData, setMoonData] = useState<MoonData | null>(null);
  const [moonLoading, setMoonLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  React.useEffect(() => {
    const fetchWeather = async (lat?: number, lon?: number) => {
      setWeatherLoading(true);
      setForecastLoading(true);
      setWeatherError(null);
      try {
        const coords = lat && lon ? `?lat=${lat}&lon=${lon}` : "";
        const [weatherRes, forecastRes] = await Promise.all([
          fetch(`/api/weather${coords}`),
          fetch(`/api/weather/forecast${coords}`),
        ]);

        const [wData, fData] = await Promise.all([
          weatherRes.json(),
          forecastRes.json(),
        ]);

        if (wData.error) throw new Error(wData.error);
        if (fData.error) throw new Error(fData.error);

        setWeatherData(wData);
        setForecastData(fData);
      } catch (err: any) {
        console.error("Weather fetch failed:", err);
        setWeatherError(err.message || "Ошибка загрузки погоды");
      } finally {
        setWeatherLoading(false);
        setForecastLoading(false);
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => fetchWeather(), // Fallback to default
      );
    } else {
      fetchWeather();
    }
  }, []);

  // Sync Moon Data when date changes
  useEffect(() => {
    const loadMoon = async () => {
      setMoonLoading(true);
      const data = await fetchMoonData(selectedDate);
      setMoonData(data);
      setMoonLoading(false);
    };
    loadMoon();
  }, [selectedDate]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });
  const muchol = GET_MUCHOL(currentDate.getFullYear());

  const handlePrevMonth = () => {
    setSlideDirection(-1);
    setCurrentDate(subMonths(currentDate, 1));
  };
  const handleNextMonth = () => {
    setSlideDirection(1);
    setCurrentDate(addMonths(currentDate, 1));
  };

  const currentMuchol = useMemo(
    () => GET_MUCHOL(selectedDate.getFullYear()),
    [selectedDate],
  );
  const selectedTogool = useMemo(
    () => getTogoolForDate(selectedDate),
    [selectedDate],
  );
  const selectedAmal = useMemo(
    () => getAmalForDate(selectedDate),
    [selectedDate],
  );

  const prediction = useMemo(
    () => predictWeather(selectedDate, observations, selectedTogool, currentMuchol),
    [selectedDate, observations, selectedTogool, currentMuchol]
  );

  const weatherAlert = useMemo(() => {
    if (!weatherData) return null;
    const { windSpeed, conditionId, temp, city } = weatherData;
    
    let alert = null;
    if (conditionId === 781) alert = { id: `tornado-${city}`, level: 'critical', message: 'ТОРНАДО! Срочно ищите укрытие.', icon: Tornado };
    else if (conditionId === 771) alert = { id: `squall-${city}`, level: 'severe', message: 'Шквальный ветер! Ограничьте пребывание на улице.', icon: Wind };
    else if (windSpeed > 20) alert = { id: `wind-extreme-${city}`, level: 'severe', message: `Ураганный ветер (${windSpeed} м/с)! Опасайтесь падающих деревьев.`, icon: Wind };
    else if (conditionId >= 200 && conditionId < 300) alert = { id: `storm-${city}`, level: 'warning', message: 'Гроза и молнии. Будьте осторожны.', icon: CloudLightning };
    else if (conditionId === 602 || conditionId === 622) alert = { id: `snow-heavy-${city}`, level: 'warning', message: 'Сильный снегопад. Возможны заносы на дорогах.', icon: Snowflake };
    else if (conditionId === 502 || conditionId === 503 || conditionId === 504) alert = { id: `rain-heavy-${city}`, level: 'warning', message: 'Сильный ливень. Риск подтоплений.', icon: CloudRain };
    else if (temp < -25) alert = { id: `cold-extreme-${city}`, level: 'warning', message: `Экстремальный мороз (${temp}°C)! Высокий риск обморожения.`, icon: AlertTriangle };
    else if (temp > 38) alert = { id: `heat-extreme-${city}`, level: 'warning', message: `Аномальная жара (${temp}°C)! Пейте больше воды.`, icon: AlertTriangle };
    
    if (alert && dismissedAlerts.includes(alert.id)) return null;
    return alert;
  }, [weatherData, dismissedAlerts]);

  // AI Insight Generation Effect
  useEffect(() => {
    const getAiSummary = async () => {
      if (!weatherData) return;

      setIsAiLoading(true);
      try {
        const currentAmal = getAmalForDate(selectedDate);
        const activeObservations =
          observations[format(selectedDate, "yyyy-MM-dd")] || [];
        const observationTexts = activeObservations
          .map((id) => NATURE_SIGNS.find((s) => s.id === id)?.prediction)
          .filter(Boolean) as string[];

        const insight = await generateWeatherInsight({
          date: format(selectedDate, "PPP", { locale: ru }),
          muchol: GET_MUCHOL(selectedDate.getFullYear()).name,
          togool: getTogoolForDate(selectedDate).name,
          amal: currentAmal ? currentAmal.name : null,
          prediction,
          liveWeather: weatherData
            ? {
                temp: weatherData.temp,
                humidity: weatherData.humidity,
                pressure: weatherData.pressure,
                city: weatherData.city,
              }
            : null,
          observations: observationTexts,
        });
        setAiInsight(insight);
      } catch (err) {
        console.error("AI Insight failed:", err);
      } finally {
        setIsAiLoading(false);
      }
    };

    getAiSummary();
  }, [selectedDate, weatherData, observations, prediction]);

  return (
    <div className="min-h-screen bg-brand-100 flex flex-col items-center justify-center font-sans md:p-4 lg:p-10">
      <div className="w-full max-w-[1400px] h-screen md:h-[90vh] bg-white border-t md:border border-border shadow-2xl md:rounded-3xl overflow-hidden flex flex-col md:flex-row relative">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-6 py-4 bg-white border-b border-border z-40 sticky top-0">
          <button 
            onClick={() => setIsSidebarLeftOpen(true)}
            className="p-2 text-brand-900"
          >
            <LayoutGrid size={20} />
          </button>
          <div className="text-sm font-black uppercase tracking-widest text-brand-900">
            {format(currentDate, "MMMM", { locale: ru })}
          </div>
          <button 
            onClick={() => setIsSidebarRightOpen(true)}
            className="p-2 text-brand-900"
          >
            <Clock size={20} />
          </button>
        </header>

        {/* Sidebar Left: Summary & Traditional Context */}
        <aside className={`
          fixed inset-y-0 left-0 z-50 w-[85%] max-w-[320px] bg-white border-r border-border shadow-2xl transform transition-transform duration-300 md:relative md:translate-x-0 md:z-auto md:w-[320px] md:shadow-none
          ${isSidebarLeftOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          <div className="h-full flex flex-col sidebar-panel">
            <div className="md:hidden flex justify-end p-4">
              <button onClick={() => setIsSidebarLeftOpen(false)} className="text-text-dim">
                <ChevronLeft size={24} />
              </button>
            </div>
            <div className="mb-10">
            <div className="flex items-center gap-2 mb-2">
              <Compass size={16} className="text-accent" />
              <span className="cell-text-dim">Контекст Цикла</span>
            </div>
            <h1 className="text-4xl font-serif font-black text-brand-900 leading-none mb-4">
              {muchol.name}
            </h1>
            <p className="text-sm text-text-dim leading-relaxed">
              Текущий год в цикле Мучол. {muchol.nature}. Период характеризуется{" "}
              {muchol.nature.toLowerCase()}.
            </p>
          </div>

          <div className="space-y-6">
            <StatCard
              title="Ожидаемый Тогоол"
              value={`${selectedTogool.id}-тогоол`}
            >
              <p className="text-[12px] text-text-dim leading-snug">
                «{selectedTogool.description}»
              </p>
            </StatCard>

            {selectedAmal && (
              <StatCard
                title="Текущий Амал"
                value={selectedAmal.name}
                className="border-accent/20 bg-accent/5"
              >
                <div className="text-accent cell-text-dim flex items-center gap-1 mt-1">
                  <Sparkles size={10} /> Активен
                </div>
                <p className="text-[12px] text-text-dim leading-snug mt-2">
                  {selectedAmal.sign}
                </p>
              </StatCard>
            )}

            <div className="p-4 border border-dashed border-border rounded-xl">
              <div className="text-[11px] uppercase tracking-widest font-bold text-brand-900 mb-2 flex items-center gap-2">
                <Info size={12} />
                Метод Сарыгулова
              </div>
              <p className="text-[11px] text-text-dim text-balance">
                Прогноз строится на взаимодействии Луны и скопления Плеяды.
                Точность зависит от чистоты неба в моменты «Тогоола».
              </p>
            </div>
          </div>

          <div className="mt-auto pt-8 border-t border-border">
            <div className="text-[11px] text-text-dim/50 uppercase tracking-widest font-bold">
              Архив Sarygulov Method
            </div>
          </div>
        </div>
      </aside>

        {/* Main Content Area: Calendar Grid */}
        <main className="flex-1 flex flex-col bg-white overflow-hidden">
          {/* Internal Header Navigation */}
          <header className="px-4 md:px-8 py-4 md:py-6 border-b border-border flex flex-col sm:flex-row items-center justify-between bg-white z-10 gap-4">
            <div className="flex items-center gap-8">
              <nav className="flex gap-4">
                <button
                  onClick={() => setActiveTab("calendar")}
                  className={`nav-item ${activeTab === "calendar" ? "active" : ""}`}
                >
                  Календарь
                </button>
                <button
                  onClick={() => setActiveTab("method")}
                  className={`nav-item ${activeTab === "method" ? "active" : ""}`}
                >
                  Мануал
                </button>
              </nav>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 md:gap-4">
                <button
                  onClick={handlePrevMonth}
                  className="p-1.5 md:p-2 hover:bg-brand-100 rounded-full transition-colors"
                >
                  <ChevronLeft size={18} className="md:w-5 md:h-5" />
                </button>
                <div className="text-sm md:text-lg font-serif font-bold text-brand-900 min-w-[100px] sm:min-w-[140px] text-center">
                  {format(currentDate, "LLLL yyyy", { locale: ru })}
                </div>
                <button
                  onClick={handleNextMonth}
                  className="p-1.5 md:p-2 hover:bg-brand-100 rounded-full transition-colors"
                >
                  <ChevronRight size={18} className="md:w-5 md:h-5" />
                </button>
              </div>
            </div>
          </header>

          {/* View Container */}
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence
              mode="popLayout"
              initial={false}
              custom={slideDirection}
            >
              {activeTab === "calendar" ? (
                <motion.div
                  key={`calendar-${format(currentDate, "yyyy-MM")}`}
                  custom={slideDirection}
                  variants={{
                    initial: (direction: number) => ({
                      x: direction > 0 ? 100 : -100,
                      opacity: 0,
                      scale: 0.95,
                    }),
                    animate: {
                      x: 0,
                      opacity: 1,
                      scale: 1,
                      transition: {
                        type: "spring",
                        stiffness: 260,
                        damping: 26,
                        mass: 0.8,
                      },
                    },
                    exit: (direction: number) => ({
                      x: direction > 0 ? -100 : 100,
                      opacity: 0,
                      scale: 0.95,
                      transition: {
                        type: "spring",
                        stiffness: 260,
                        damping: 26,
                        mass: 0.8,
                      },
                    }),
                  }}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="p-8"
                >
                  {/* Days of week */}
                  <div className="grid grid-cols-7 mb-4 px-4">
                    {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
                      <div
                        key={d}
                        className="text-[10px] uppercase tracking-widest font-black text-text-dim text-center"
                      >
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* The Grid */}
                  <div className="calendar-grid rounded-2xl overflow-hidden border-r border-b">
                    {calendarDays.map((date, i) => {
                      const togool = getTogoolForDate(date);
                      const amal = getAmalForDate(date);
                      const moon = getMoonData(date);
                      const isTogool = isTogoolDay(date);
                      const isToday = isSameDay(date, new Date());
                      const isCurrentMonth = isSameMonth(date, monthStart);
                      const isSelected = isSameDay(date, selectedDate);
                      const dateKey = format(date, "yyyy-MM-dd");
                      const dayObservations = observations[dateKey] || [];
                      const dayMuchol = GET_MUCHOL(date.getFullYear());
                      const dayTogool = getTogoolForDate(date);
                      const dayPrediction = predictWeather(date, observations, dayTogool, dayMuchol);

                      return (
                        <div
                          key={date.toString()}
                          onClick={() => {
                            setSelectedDate(date);
                            if (window.innerWidth < 768) {
                              setIsSidebarRightOpen(true);
                            }
                          }}
                          className={`calendar-cell ${!isCurrentMonth ? "inactive" : ""} ${isToday ? "today" : ""} ${isSelected && !isToday ? "ring-2 ring-inset ring-accent" : ""}`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span
                              className={`text-xl font-serif ${isToday ? "text-white" : "text-brand-900"}`}
                            >
                              {format(date, "d")}
                            </span>
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex gap-1">
                                {dayObservations.length > 0 && isCurrentMonth && (
                                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                )}
                                {isTogool && isCurrentMonth && (
                                  <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(255,165,0,0.8)]"
                                  />
                                )}
                              </div>
                              {isCurrentMonth && (
                                <WeatherIcon 
                                  rain={dayPrediction.rain} 
                                  snow={dayPrediction.snow} 
                                  wind={dayPrediction.wind}
                                  size={12}
                                  className={isToday ? "text-white/80" : ""}
                                />
                              )}
                            </div>
                          </div>

                          {isCurrentMonth && (
                            <div className="space-y-1">
                              <div
                                className={`cell-text-dim flex items-center gap-1 ${isTogool ? "text-accent font-black" : ""}`}
                              >
                                <MoonStar
                                  size={10}
                                  className={isTogool ? "animate-pulse" : ""}
                                />
                                {moon.lunarDay} д.л.
                              </div>
                              {togool.id && (
                                <div className="text-[9px] text-text-dim/80 opacity-60">
                                  {togool.id} тогоол
                                </div>
                              )}
                              {amal && (
                                <div className="text-[9px] font-bold text-accent uppercase leading-tight truncate">
                                  {amal.name}
                                </div>
                              )}
                            </div>
                          )}

                          {isToday && (
                            <div className="absolute bottom-2 right-2 opacity-20">
                              <Star size={40} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="method-view"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="p-12 max-w-4xl mx-auto"
                >
                  <MethodologyView
                    observations={observations}
                    onAdd={(id) => saveObservation(id)}
                    onRemove={(id) => removeObservation(id)}
                    selectedDate={selectedDate}
                    onDateChange={setSelectedDate}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* Sidebar Right: Daily Details */}
        <aside className={`
          fixed inset-y-0 right-0 z-50 w-[85%] max-w-[420px] bg-brand-50/95 backdrop-blur-xl border-l border-border shadow-2xl transform transition-transform duration-300 md:relative md:translate-x-0 md:z-auto md:w-[420px] md:shadow-none
          ${isSidebarRightOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
        `}>
          <div className="h-full flex flex-col p-6 md:p-8 overflow-y-auto">
            <div className="md:hidden flex justify-start mb-6 pt-2">
              <button 
                onClick={() => setIsSidebarRightOpen(false)} 
                className="text-text-dim flex items-center gap-2 text-xs font-bold uppercase tracking-widest bg-white/50 px-4 py-2 rounded-xl border border-border/40"
              >
                <ChevronRight size={18} className="rotate-180" /> Назад
              </button>
            </div>
            <RealTimeClock />

          <AnimatePresence>
            {weatherAlert && (
              <motion.div
                initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                animate={{ height: 'auto', opacity: 1, marginBottom: 24 }}
                exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                className="overflow-hidden"
              >
                <div 
                  className={`p-4 rounded-2xl border flex flex-col gap-3 relative ${
                    weatherAlert.level === 'critical' ? 'bg-red-600 border-red-700 text-white' :
                    weatherAlert.level === 'severe' ? 'bg-orange-500 border-orange-600 text-white' :
                    'bg-amber-50 border-amber-200 text-amber-900 shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-xl ${
                      weatherAlert.level === 'warning' ? 'bg-amber-100 text-amber-600' : 'bg-white/20 text-white'
                    }`}>
                      <weatherAlert.icon size={20} />
                    </div>
                    <div className="flex-1 pr-6">
                      <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${
                        weatherAlert.level === 'warning' ? 'text-amber-600' : 'text-white/60'
                      }`}>
                        Оповещение МЧС (Live)
                      </div>
                      <p className="text-[11px] font-bold leading-snug">
                        {weatherAlert.message}
                      </p>
                    </div>
                    <button 
                      onClick={() => setDismissedAlerts([...dismissedAlerts, weatherAlert.id])}
                      className={`absolute top-3 right-3 p-1 rounded-full transition-colors ${
                        weatherAlert.level === 'warning' ? 'hover:bg-amber-100 text-amber-400' : 'hover:bg-white/10 text-white/50'
                      }`}
                    >
                      <Plus className="rotate-45" size={14} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mb-8">
            <span className="cell-text-dim block mb-4">Детали Дня</span>
            <div className="text-4xl font-serif text-brand-900 font-bold mb-1">
              {format(selectedDate, "d MMMM", { locale: ru })}
            </div>
            <div className="text-sm text-text-dim italic">
              {format(selectedDate, "EEEE", { locale: ru })}
            </div>

            {/* Scientific Day Summary if available */}
            {(() => {
              const dateStr = format(selectedDate, "yyyy-MM-dd");
              const dayData = forecastData?.list?.filter((i: any) =>
                i.dt_txt.startsWith(dateStr),
              );
              if (dayData && dayData.length > 0) {
                const maxTemp = Math.max(...dayData.map((d: any) => d.main.temp));
                const minTemp = Math.min(...dayData.map((d: any) => d.main.temp));
                const avgPop =
                  dayData.reduce((acc: number, d: any) => acc + d.pop, 0) /
                  dayData.length;
                const maxWind = Math.max(
                  ...dayData.map((d: any) => d.wind.speed),
                );

                return (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 p-4 bg-blue-50/50 border border-blue-100 rounded-2xl flex items-center justify-between shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center border border-blue-50/50">
                        <img
                          src={`https://openweathermap.org/img/wn/${dayData[Math.floor(dayData.length / 2)].weather[0].icon}@2x.png`}
                          alt="Daily"
                          className="w-10 h-10"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div>
                        <div className="text-[10px] font-black text-blue-600 uppercase tracking-wider mb-0.5">
                          Метео-сводка
                        </div>
                        <div className="text-sm font-bold text-brand-900">
                          {Math.round(minTemp)}°… {Math.round(maxTemp)}°
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-4 text-[10px] font-bold text-text-dim border-l border-blue-200 pl-4 uppercase tracking-tighter">
                      <div className="flex flex-col items-center">
                        <CloudRain size={12} className="mb-1 text-blue-400" />
                        {Math.round(avgPop * 100)}%
                      </div>
                      <div className="flex flex-col items-center">
                        <Wind size={12} className="mb-1 text-slate-400" />
                        {Math.round(maxWind)}м/с
                      </div>
                    </div>
                  </motion.div>
                );
              }
              return null;
            })()}
          </div>

          <div className="space-y-8 flex-1">
            <section>
              <h4 className="cell-text-dim mb-4 flex items-center gap-2 text-blue-500">
                <Wind size={14} /> Реальные данные (Live)
              </h4>
              <div className="stat-card border-l-4 border-l-blue-400 bg-blue-50/30">
                {weatherLoading ? (
                  <div className="flex items-center justify-center p-4 animate-pulse">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" />
                  </div>
                ) : weatherData ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-serif italic text-brand-900 leading-none">
                            {Math.round(weatherData.temp)}
                          </span>
                          <span className="text-sm text-text-dim">°C</span>
                        </div>
                        <div className="text-[10px] text-text-dim uppercase font-bold tracking-wider mt-1">
                          {weatherData.city}
                        </div>
                      </div>
                      {weatherData.icon && (
                        <img
                          src={`https://openweathermap.org/img/wn/${weatherData.icon}@2x.png`}
                          alt="Weather Icon"
                          className="w-12 h-12 -mt-2"
                          referrerPolicy="no-referrer"
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <StatCard
                        small
                        title="Влажность"
                        value={weatherData.humidity}
                        unit="%"
                        className="bg-white/60 p-3"
                      />
                      <StatCard
                        small
                        title="Давление"
                        value={weatherData.pressure}
                        unit="hPa"
                        className="bg-white/60 p-3"
                      />
                    </div>
                  </div>
                ) : weatherError ? (
                  <div className="text-[10px] text-red-500 italic p-2 bg-red-50 rounded-lg border border-red-100 leading-tight">
                    {weatherError}
                  </div>
                ) : (
                  <div className="text-[10px] text-text-dim italic text-center py-2">
                    Данные погоды недоступны.
                  </div>
                )}
              </div>
            </section>

            {/* Moon Phase Section (API Integrated) */}
            <section>
              <h4 className="cell-text-dim mb-4 flex items-center gap-2 text-brand-900">
                <Moon size={14} /> Наблюдение за Луной
              </h4>
              <div className="stat-card bg-white border-l-4 border-l-brand-900 shadow-sm relative overflow-hidden">
                {moonLoading && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-20">
                    <RefreshCw
                      size={20}
                      className="text-brand-900 animate-spin"
                    />
                  </div>
                )}

                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-brand-900 rounded-full flex items-center justify-center text-accent ring-4 ring-brand-100 relative">
                    <Moon
                      size={24}
                      className={
                        moonData?.illumination && moonData.illumination > 0.9
                          ? "animate-pulse"
                          : ""
                      }
                    />
                    {moonData && moonData.illumination > 0.05 && (
                      <div
                        className="absolute inset-0 rounded-full border-2 border-accent/30"
                        style={{ opacity: moonData.illumination }}
                      />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-brand-900 uppercase tracking-widest leading-none mb-1">
                      {moonData?.name || getMoonData(selectedDate).name}
                    </div>
                    <div className="text-[10px] text-text-dim font-medium italic">
                      {moonData?.lunarDay || getMoonData(selectedDate).lunarDay}
                      -й лунный день
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                  <div>
                    <div className="text-[10px] font-bold text-text-dim uppercase tracking-wider mb-1">
                      Освещенность
                    </div>
                    <div className="text-sm font-serif font-black text-brand-900">
                      {moonData
                        ? Math.round(moonData.illumination * 100)
                        : Math.round(
                            getMoonData(selectedDate).illumination * 100,
                          )}
                      %
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-text-dim uppercase tracking-wider mb-1">
                      Статус Тогоол
                    </div>
                    <div
                      className={`text-sm font-serif font-black ${isTogoolDay(selectedDate) ? "text-accent" : "text-brand-900"}`}
                    >
                      {isTogoolDay(selectedDate)
                        ? "ВСТРЕЧА СЕГОДНЯ"
                        : "Ожидание"}
                    </div>
                  </div>
                </div>

                <HourlyForecast
                  prediction={prediction}
                  weatherData={weatherData}
                  forecastData={forecastData}
                  selectedDate={selectedDate}
                />

                <div className="mt-4 text-[9px] text-text-dim leading-relaxed bg-brand-100/30 p-2 rounded-lg border border-brand-200/50">
                  {isTogoolDay(selectedDate)
                    ? "Критическая точка цикла. Направление ветра сегодня определит прогноз на весь следующий лунный месяц."
                    : "Лунный день не соответствует текущему Тогоолу. Наблюдайте за изменениями облачности."}
                </div>
              </div>
            </section>

            <section>
              <h4 className="cell-text-dim mb-4 flex items-center gap-2">
                <Wind size={14} /> Ветровой Код
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {WIND_DIRECTIONS.map((w) => (
                  <div
                    key={w.id}
                    className="p-3 bg-white border border-border rounded-lg text-center group relative cursor-help"
                  >
                    <div className="text-[10px] font-bold">{w.id}</div>
                    <div className="text-[9px] text-text-dim truncate">
                      {w.name.split(" ")[0]}
                    </div>

                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2.5 bg-brand-900 text-white text-[10px] rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 z-50 shadow-2xl scale-95 group-hover:scale-100 origin-bottom ring-1 ring-white/10">
                      <div className="font-black uppercase tracking-widest text-[#c5a059] mb-1">
                        {w.name}
                      </div>
                      <div className="leading-relaxed opacity-90">
                        {w.impact}
                      </div>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-x-[6px] border-x-transparent border-t-[6px] border-t-brand-900" />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-text-dim italic">
                При наблюдении «Тогоола» ветер определяет характер всего лунного
                месяца.
              </p>
            </section>

            <section>
              <h4 className="cell-text-dim mb-4 flex items-center gap-2 text-blue-600">
                <Bird size={14} /> Наблюдения
              </h4>

              <div className="space-y-2">
                {(observations[format(selectedDate, "yyyy-MM-dd")] || []).map(
                  (obsId) => {
                    const isCustom = obsId.startsWith("custom:");
                    const sign = !isCustom
                      ? NATURE_SIGNS.find((s) => s.id === obsId)
                      : null;
                    const text = isCustom
                      ? obsId.replace("custom:", "")
                      : sign?.name;

                    if (!text && !isCustom) return null;

                    return (
                      <div
                        key={obsId}
                        className="flex items-start justify-between p-3 bg-white border border-border rounded-xl group transition-all hover:border-blue-200 shadow-sm"
                      >
                        <div className="flex-1">
                          <div className="text-[11px] text-brand-900 font-bold leading-tight">
                            {text}
                          </div>
                          {isCustom && (
                            <div className="text-[9px] text-blue-500 uppercase font-black tracking-tighter mt-0.5">
                              Личное наблюдение
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => removeObservation(obsId)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-red-300 hover:text-red-500 transition-all shrink-0 ml-2"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  },
                )}

                {(!observations[format(selectedDate, "yyyy-MM-dd")] ||
                  observations[format(selectedDate, "yyyy-MM-dd")].length ===
                    0) &&
                  !isAddingObservation && (
                    <p className="text-[11px] text-text-dim italic">
                      Наблюдений пока нет.
                    </p>
                  )}

                {isAddingObservation && (
                  <div className="p-4 bg-brand-900 rounded-2xl relative overflow-hidden ring-1 ring-white/10 shadow-lg">
                    <div className="text-[10px] text-accent uppercase font-black mb-3 tracking-widest">
                      Новое наблюдение
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <div className="text-[8px] text-white/40 uppercase font-bold">
                          Своя заметка
                        </div>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={customObservation}
                            onChange={(e) =>
                              setCustomObservation(e.target.value)
                            }
                            placeholder="Опишите примету..."
                            className="flex-1 bg-white/5 border border-white/10 rounded-lg p-2 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-accent/50"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && customObservation.trim()) {
                                saveObservation("", customObservation.trim());
                              }
                            }}
                          />
                          <button
                            disabled={!customObservation.trim()}
                            onClick={() =>
                              saveObservation("", customObservation.trim())
                            }
                            className="p-2 bg-accent text-brand-900 rounded-lg disabled:opacity-30 disabled:grayscale transition-all"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="h-px bg-white/5" />

                      <div className="space-y-1.5">
                        <div className="text-[8px] text-white/40 uppercase font-bold">
                          Выбрать из каталога
                        </div>
                        <div className="grid gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                          {NATURE_SIGNS.map((sign) => (
                            <button
                              key={sign.id}
                              onClick={() => saveObservation(sign.id)}
                              className="w-full text-left p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-[10px] text-white border border-white/10 flex items-center justify-between group"
                            >
                              <span>{sign.name}</span>
                              <Plus
                                size={10}
                                className="text-accent opacity-0 group-hover:opacity-100 transition-opacity"
                              />
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => setIsAddingObservation(false)}
                        className="w-full text-center p-2 text-[9px] text-white/30 hover:text-white uppercase font-bold tracking-widest pt-2"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section>
              <h4 className="cell-text-dim mb-4 flex items-center gap-2 text-accent">
                <LayoutGrid size={14} /> Прогноз по Эсепчи
              </h4>
              <div className="space-y-4">
                <div className="stat-card bg-brand-900 border-none shadow-xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:rotate-12 transition-transform">
                    {prediction.rain > 50 ? (
                      <Wind size={80} className="text-white" />
                    ) : (
                      <Sun size={80} className="text-white" />
                    )}
                  </div>

                  <div className="relative z-10 text-white">
                    <div className="text-[10px] uppercase font-black tracking-[0.2em] text-accent mb-2">
                      {prediction.trend}
                    </div>
                    <div className="text-xl font-serif italic leading-tight mb-4">
                      «{prediction.summary}»
                    </div>

                    <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-4 mb-4">
                      <div>
                        <div className="text-[9px] text-white/40 uppercase mb-1">
                          Дождь
                        </div>
                        <div className="text-lg font-bold">
                          {prediction.rain}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-white/40 uppercase mb-1">
                          Снег
                        </div>
                        <div className="text-lg font-bold">
                          {prediction.snow}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-white/40 uppercase mb-1">
                          Ветер
                        </div>
                        <div className="text-lg font-bold">
                          {prediction.wind}%
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-end">
                        <div className="space-y-0.5">
                          <div className="text-[8px] uppercase font-black text-white/30 tracking-[0.2em]">
                            Достоверность
                          </div>
                          <div className="text-[10px] font-medium text-accent/80 italic">
                            {prediction.confidenceReason}
                          </div>
                        </div>
                        <div className="text-xl font-mono text-accent font-bold">
                          {prediction.confidence}%
                        </div>
                      </div>

                      {/* Segmented Progress Bar */}
                      <div className="flex gap-1 h-1.5">
                        {Array.from({ length: 10 }).map((_, i) => (
                          <div
                            key={i}
                            className={`flex-1 rounded-sm transition-all duration-700 ${
                              i < Math.floor(prediction.confidence / 10)
                                ? "bg-accent shadow-[0_0_8px_#c5a059]"
                                : "bg-white/5"
                            }`}
                            style={{ transitionDelay: `${i * 50}ms` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="stat-card bg-white border-l-4 border-l-accent shadow-sm">
                  <div className="text-[9px] font-bold text-accent uppercase mb-1 tracking-wider">
                    Источник: Цикл Тогоол
                  </div>
                  <div className="text-sm font-medium text-brand-900 mb-2 leading-tight">
                    {selectedTogool.description}
                  </div>
                  <div className="text-[11px] text-text-dim">
                    Тип года {GET_MUCHOL(selectedDate.getFullYear()).name}{" "}
                    корректирует влажность.
                  </div>
                </div>

                {/* AI Weather Insight - Gemini Synthesis */}
                <div className="stat-card bg-brand-900 border-none shadow-lg relative overflow-hidden ring-1 ring-accent/20">
                  <div className="absolute -right-6 -top-6 text-white/5 rotate-12 scale-150">
                    <Brain size={120} />
                  </div>

                  <div className="relative z-10">
                    <div className="flex justify-between items-center mb-1 text-[10px] font-bold text-accent uppercase tracking-[0.2em]">
                      <div className="flex items-center gap-2 relative">
                        <Sparkles
                          size={12}
                          className={`${
                            isAiLoading
                              ? "animate-pulse text-accent"
                              : aiInsight
                                ? "text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.6)]"
                                : "text-accent"
                          } transition-all duration-500`}
                        />
                        ИИ-Мудрость
                        {aiInsight && !isAiLoading && (
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_10px_#22c55e] ml-1"
                          />
                        )}
                      </div>
                      {isAiLoading && (
                        <RefreshCw size={10} className="animate-spin" />
                      )}
                    </div>

                    <div className="min-h-[60px] flex flex-col justify-center">
                      {isAiLoading ? (
                        <div className="space-y-2 py-2">
                          <div className="h-1.5 w-full bg-white/10 rounded animate-pulse" />
                          <div className="h-1.5 w-[85%] bg-white/10 rounded animate-pulse" />
                        </div>
                      ) : (
                        <p className="text-[11px] text-white/90 leading-relaxed font-serif italic py-1">
                          {aiInsight ||
                            "Выберите дату для получения синергетического прогноза."}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 pt-2 border-t border-white/10 flex items-center justify-between">
                      <div className="text-[8px] text-white/30 font-bold uppercase tracking-widest">
                        GEMINI V3 Synth
                      </div>
                      <button
                        onClick={() => setAiInsight(null)}
                        className="text-[9px] text-accent hover:text-white transition-colors underline decoration-accent/30 underline-offset-2"
                      >
                        Обновить
                      </button>
                    </div>
                  </div>
                </div>

                {/* Refined Forecast based on observations */}
                {(observations[format(selectedDate, "yyyy-MM-dd")] || []).map(
                  (obsId) => {
                    const isCustom = obsId.startsWith("custom:");
                    const sign = !isCustom
                      ? NATURE_SIGNS.find((s) => s.id === obsId)
                      : null;

                    if (!sign && !isCustom) return null;

                    return (
                      <div
                        key={obsId}
                        className="stat-card bg-blue-50/50 border-l-4 border-l-blue-400 shadow-sm animate-in fade-in slide-in-from-left-2 duration-300"
                      >
                        <div className="text-[9px] font-bold text-blue-600 uppercase mb-1 flex items-center gap-1 tracking-wider">
                          <Bird size={10} /> Источник:{" "}
                          {isCustom ? "Личная заметка" : "Наблюдение"}
                        </div>
                        <div className="text-sm font-medium text-brand-900 leading-tight italic">
                          «
                          {isCustom
                            ? obsId.replace("custom:", "")
                            : sign?.prediction}
                          »
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </section>
          </div>

          <button
            onClick={() => setIsAddingObservation(true)}
            className="w-full py-4 bg-brand-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-brand-800 transition-colors mt-8"
          >
            <Plus size={18} />
            Записать Наблюдение
          </button>
        </div>
      </aside>

        {/* Overlays for Mobile */}
        <AnimatePresence>
          {(isSidebarLeftOpen || isSidebarRightOpen) && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsSidebarLeftOpen(false);
                setIsSidebarRightOpen(false);
              }}
              className="md:hidden fixed inset-0 bg-brand-900/40 backdrop-blur-sm z-40"
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function HourlyForecast({ 
  prediction, 
  weatherData,
  forecastData,
  selectedDate,
}: { 
  prediction: any, 
  weatherData: any,
  forecastData: any,
  selectedDate: Date,
}) {
  const baseTemp = weatherData?.temp || 20;

  // Filter forecast data for the selected date
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  const dailyForecast = useMemo(() => {
    if (!forecastData?.list) return [];
    return forecastData.list.filter((item: any) => 
      item.dt_txt.startsWith(selectedDateStr)
    );
  }, [forecastData, selectedDateStr]);

  const [activeView, setActiveView] = useState<"traditional" | "scientific">("traditional");

  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex bg-brand-100/50 p-1 rounded-xl gap-1">
          <button 
            onClick={() => setActiveView("traditional")}
            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${activeView === 'traditional' ? 'bg-white text-brand-900 shadow-sm' : 'text-text-dim hover:text-brand-900'}`}
          >
            Традиционный
          </button>
          <button 
            onClick={() => setActiveView("scientific")}
            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${activeView === 'scientific' ? 'bg-white text-brand-900 shadow-sm' : 'text-text-dim hover:text-brand-900'}`}
          >
            Научный
          </button>
        </div>
        <h4 className="cell-text-dim flex items-center gap-2">
          <Clock size={14} /> {activeView === 'traditional' ? 'Метод Сарыгулова' : 'Метео-Прогноз'}
        </h4>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4 pt-2 -mx-2 px-2 no-scrollbar">
        {activeView === "traditional" ? (
          TRADITIONAL_HOURS.map((point) => {
            const currentTemp = Math.round(baseTemp + point.tempOffset);
            const moisture = Math.min(100, Math.round(prediction.rain * (point.activityLevel / 100) * 1.5));
            
            return (
              <div 
                key={point.hour}
                className="flex-shrink-0 w-28 p-4 bg-white border border-border rounded-[2rem] flex flex-col items-center gap-3 shadow-md hover:border-accent/60 hover:shadow-xl transition-all duration-500 group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-1 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Clock size={40} />
                </div>

                <div className="text-[10px] font-black text-brand-900/40 group-hover:text-accent transition-colors tracking-[0.2em] relative z-10">
                  {point.label}
                </div>

                <div className="p-3 bg-brand-50 rounded-2xl group-hover:scale-110 transition-transform duration-500 relative z-10">
                  <WeatherIcon 
                    rain={moisture / 1.5} 
                    snow={prediction.snow > 0 ? moisture / 1.5 : 0} 
                    wind={prediction.wind * (point.activityLevel / 100)}
                    size={24}
                  />
                </div>
                
                <div className="flex flex-col items-center relative z-10">
                  <div className="text-2xl font-bold text-brand-900 tracking-tighter">
                    {currentTemp > 0 ? `+${currentTemp}` : currentTemp}°
                  </div>
                  <div className="text-[9px] text-text-dim text-center uppercase font-black leading-tight mt-1 opacity-50 tracking-wider">
                    {point.traditionalName}
                  </div>
                </div>

                <div className="w-full mt-2 space-y-1.5 relative z-10">
                  <div className="h-1.5 w-full bg-brand-100 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${moisture}%` }}
                      transition={{ duration: 1, delay: point.hour * 0.05 }}
                      className={`h-full ${moisture > 60 ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-accent shadow-[0_0_8px_rgba(255,165,0,0.5)]'}`}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[8px] font-black uppercase text-brand-900/40 tracking-tighter">
                    <span>Влага</span>
                    <span className={moisture > 70 ? 'text-blue-500' : ''}>{moisture}%</span>
                  </div>
                </div>
              </div>
            );
          })
        ) : dailyForecast.length > 0 ? (
          dailyForecast.map((item: any, idx: number) => (
            <div 
              key={idx}
              className="flex-shrink-0 w-32 p-4 bg-white border border-border rounded-[2rem] flex flex-col items-center gap-3 shadow-md hover:border-blue-400/60 hover:shadow-xl transition-all duration-500 group"
            >
              <div className="text-[10px] font-black text-brand-900/40 group-hover:text-blue-500 transition-colors tracking-[0.2em]">
                {format(new Date(item.dt * 1000), "HH:00")}
              </div>

              <div className="p-3 bg-blue-50 rounded-2xl group-hover:scale-110 transition-transform duration-500">
                <img 
                  src={`https://openweathermap.org/img/wn/${item.weather[0].icon}@2x.png`}
                  alt={item.weather[0].description}
                  className="w-8 h-8"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="flex flex-col items-center">
                <div className="text-2xl font-bold text-brand-900 tracking-tighter">
                  {Math.round(item.main.temp) > 0 ? `+${Math.round(item.main.temp)}` : Math.round(item.main.temp)}°
                </div>
                <div className="text-[8px] text-text-dim text-center uppercase font-black leading-tight mt-1 opacity-50 truncate w-full px-2">
                  {item.weather[0].description}
                </div>
              </div>

              <div className="w-full mt-2 grid grid-cols-2 gap-2 text-[8px] font-black uppercase text-brand-900/40 tracking-tighter border-t border-brand-100 pt-2">
                <div className="flex flex-col items-center">
                  <CloudRain size={11} className="mb-0.5 text-blue-500" />
                  <span className="text-blue-600">{Math.round(item.pop * 100)}%</span>
                  <span className="opacity-40">Вероят.</span>
                </div>
                <div className="flex flex-col items-center">
                  <Wind size={11} className="mb-0.5 text-brand-700" />
                  <span className="text-brand-900">{Math.round(item.wind.speed)}м/с</span>
                  <span className="opacity-40">Ветер</span>
                </div>
              </div>

              <div className="text-[7px] text-text-dim/60 font-medium uppercase mt-1">
                Ощущ. {Math.round(item.main.feels_like)}° • {item.main.humidity}% влаж.
              </div>
            </div>
          ))
        ) : (
          <div className="w-full py-8 text-center text-text-dim text-[11px] italic opacity-60">
            Нет детализированных данных для этой даты. Пожалуйста, выберите ближайшие 5 дней.
          </div>
        )}
      </div>
      
      <p className="text-[9px] text-text-dim italic leading-relaxed opacity-70">
        {activeView === 'traditional' 
          ? "* Метод Сарыгулова учитывает точки бифуркации «Чак» (полдень) и «Ороо» (полночь)."
          : "* Научный прогноз на основе метеорологических станций (точность выше на ближайшие 48 часов)."}
      </p>
    </div>
  );
}

function MethodologyView({
  observations,
  onAdd,
  onRemove,
  selectedDate,
  onDateChange,
}: {
  observations: Record<string, string[]>;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  selectedDate: Date;
  onDateChange: (d: Date) => void;
}) {
  const [activeHistory, setActiveHistory] = useState<string | null>(null);

  const flatObservations = useMemo(() => {
    return Object.entries(observations)
      .flatMap(([date, ids]) =>
        ids.map((id) => {
          const isCustom = id.startsWith("custom:");
          return {
            date,
            id,
            sign: isCustom
              ? { id: id, name: id.replace("custom:", ""), category: "Личное" }
              : NATURE_SIGNS.find((s) => s.id === id),
            isCustom,
          };
        }),
      )
      .filter((o) => o.sign)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [observations]);

  const [customText, setCustomText] = useState("");

  return (
    <div className="space-y-16 pb-20">
      <div className="space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="px-3 py-1 bg-accent/10 text-accent text-[10px] uppercase font-black tracking-widest rounded-full">
            Methodology v2.1
          </div>
        </div>
        <h2 className="text-4xl font-serif font-black text-brand-900 italic">
          Алгоритм Эсепчи
        </h2>
        <p className="text-lg text-text-dim leading-relaxed max-w-2xl">
          Синтез астрономии Птолемея и кочевой мудрости. Мы используем «Ветровой
          Код» Тогоола как базис и «Амалдар» как корректирующие коэффициенты.
        </p>
      </div>

      {/* Observation Input Interface */}
      <section className="bg-white border border-border/60 rounded-2xl md:rounded-3xl p-5 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row gap-8 md:gap-10">
          <div className="flex-1 space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg text-white">
                <Plus size={20} />
              </div>
              <div>
                <h3 className="text-xl font-serif font-black text-brand-900">
                  Дневник Наблюдений
                </h3>
                <p className="text-xs text-text-dim">
                  Ввод полевых данных для уточнения прогноза
                </p>
              </div>
            </div>

            <div className="grid gap-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase text-brand-900/40 block tracking-widest">
                  Своё наблюдение
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder="Напр: Ласточки летают очень низко..."
                    className="flex-1 p-3 bg-brand-100/50 border border-border rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customText.trim()) {
                        onAdd(`custom:${customText.trim()}`);
                        setCustomText("");
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      onAdd(`custom:${customText.trim()}`);
                      setCustomText("");
                    }}
                    disabled={!customText.trim()}
                    className="px-6 bg-brand-900 text-white rounded-xl font-bold hover:bg-brand-800 disabled:opacity-30 transition-all shadow-md shadow-brand-900/10"
                  >
                    Добавить
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-brand-900/40 mb-2 block tracking-widest">
                  Целевая дата
                </label>
                <input
                  type="date"
                  value={format(selectedDate, "yyyy-MM-dd")}
                  onChange={(e) => onDateChange(new Date(e.target.value))}
                  className="w-full p-3 bg-brand-100/50 border border-border rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-brand-900/40 mb-2 block tracking-widest">
                  Выберите Примету (Sign)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {NATURE_SIGNS.map((sign) => {
                    const isAdded = observations[
                      format(selectedDate, "yyyy-MM-dd")
                    ]?.includes(sign.id);
                    return (
                      <button
                        key={sign.id}
                        onClick={() =>
                          isAdded ? onRemove(sign.id) : onAdd(sign.id)
                        }
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all text-left ${
                          isAdded
                            ? "bg-brand-900 border-brand-900 text-white"
                            : "bg-white border-border hover:border-accent text-brand-900"
                        }`}
                      >
                        <span className="text-[11px] font-medium leading-tight">
                          {sign.name}
                        </span>
                        {isAdded ? (
                          <Trash2 size={12} className="opacity-50" />
                        ) : (
                          <Plus size={12} className="text-accent" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="md:w-[300px] border-t md:border-t-0 md:border-l border-border pt-8 md:pt-0 md:pl-10 space-y-6">
            <div>
              <h4 className="text-[11px] uppercase tracking-[0.2em] font-black text-blue-600 mb-4">
                Влияние на точность
              </h4>
              <div className="space-y-4">
                <div className="p-4 bg-blue-100/30 rounded-xl border border-blue-100">
                  <div className="text-[10px] font-black uppercase text-blue-700 mb-1">
                    Текущий бонус уточнения
                  </div>
                  <div className="text-3xl font-serif font-black text-blue-900 leading-tight">
                    +
                    {Math.min(
                      45,
                      (observations[format(selectedDate, "yyyy-MM-dd")]
                        ?.length || 0) * 15,
                    )}
                    %
                  </div>
                  <p className="text-[9px] text-blue-600 mt-1 uppercase font-bold tracking-tighter">
                    На основе ваших наблюдений
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-2xl font-serif italic text-brand-900">
                    +15%
                  </div>
                  <div className="text-[11px] text-text-dim leading-snug">
                    За каждое соответствие приметы текущему циклу Амал.
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-2xl font-serif italic text-brand-900">
                    +40%
                  </div>
                  <div className="text-[11px] text-text-dim leading-snug">
                    При наличии Ветрового Кода в день Тогоола.
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-border">
              <h4 className="text-[11px] uppercase tracking-[0.2em] font-black text-brand-800 mb-4">
                История Логов
              </h4>
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                {flatObservations.length === 0 ? (
                  <p className="text-[11px] text-text-dim italic">
                    Данных пока нет...
                  </p>
                ) : (
                  flatObservations.map((obs, i) => (
                    <div
                      key={i}
                      className="p-2 bg-brand-100/50 rounded-lg border border-border/40"
                    >
                      <div className="flex justify-between text-[9px] font-bold text-accent mb-1">
                        <span>{obs.date}</span>
                      </div>
                      <p className="text-[10px] text-brand-900 leading-tight">
                        {obs.sign?.name}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Visual Alignment Diagram: Astronomical Software Style */}
      <div className="p-0 bg-[#05070a] rounded-2xl md:rounded-3xl relative overflow-hidden h-[300px] md:h-[450px] shadow-2xl border border-white/10 group">
        {/* Sky Background with Starfield */}
        <div className="absolute inset-0 opacity-40">
          {Array.from({ length: 150 }).map((_, i) => (
            <div
              key={i}
              className="absolute bg-white rounded-full animate-pulse"
              style={{
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
                width: `${Math.random() * 2}px`,
                height: `${Math.random() * 2}px`,
                animationDelay: `${Math.random() * 5}s`,
                opacity: Math.random(),
              }}
            />
          ))}
        </div>

        <svg viewBox="0 0 800 450" className="w-full h-full relative z-10">
          <defs>
            <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="starGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#8beaff" stopOpacity="1" />
              <stop offset="100%" stopColor="#8beaff" stopOpacity="0" />
            </radialGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Celestial Coordinate System */}
          <g className="opacity-10" stroke="white" strokeWidth="0.5">
            {/* Alt-Az Grid */}
            {Array.from({ length: 5 }).map((_, i) => (
              <circle
                key={i}
                cx="400"
                cy="225"
                r={(i + 1) * 60}
                fill="none"
                strokeDasharray="2 4"
              />
            ))}
            {Array.from({ length: 12 }).map((_, i) => (
              <line
                key={i}
                x1="400"
                y1="225"
                x2={400 + 400 * Math.cos((i * Math.PI) / 6)}
                y2={225 + 400 * Math.sin((i * Math.PI) / 6)}
                strokeDasharray="1 10"
              />
            ))}
          </g>

          {/* Ecliptic Path (The path the moon follows) */}
          <path
            id="ecliptic"
            d="M -50 400 Q 400 -50 850 400"
            fill="none"
            stroke="#c5a059"
            strokeWidth="1"
            strokeDasharray="5 5"
            className="opacity-40"
          />
          <text className="fill-accent/40 text-[9px] uppercase tracking-[0.3em] font-bold">
            <textPath href="#ecliptic" startOffset="10%">
              Ecliptic (Жол)
            </textPath>
          </text>

          {/* Pleiades (Urker) Cluster - Fixed Position M45 Representation */}
          <g transform="translate(480, 140) scale(1.1)" filter="url(#glow)">
            {[
              { x: 20, y: 15, r: 3, name: "Alcyone" },
              { x: 0, y: 45, r: 2.2, name: "Atlas" },
              { x: 18, y: 65, r: 2.8, name: "Electra" },
              { x: 45, y: 35, r: 1.8, name: "Maia" },
              { x: 65, y: 55, r: 1.5, name: "Merope" },
              { x: 75, y: 20, r: 2.0, name: "Taygeta" },
              { x: 55, y: -10, r: 1.5, name: "Pleione" },
              { x: -20, y: 30, r: 1.2, name: "Asterope" },
              { x: 10, y: -5, r: 1.3, name: "Celaeno" },
            ].map((star, i) => (
              <g key={i}>
                <circle
                  cx={star.x}
                  cy={star.y}
                  r={star.r * 6}
                  fill="url(#starGlow)"
                  className="opacity-30"
                />
                <circle cx={star.x} cy={star.y} r={star.r} fill="#fff" />
                <text
                  x={star.x + 8}
                  y={star.y + 4}
                  className="fill-cyan-200/50 text-[7px] font-sans uppercase tracking-[0.1em] pointer-events-none"
                >
                  {star.name}
                </text>
              </g>
            ))}
          </g>

          {/* Lunar Orbit Logic & Moving Moon */}
          <motion.g
            animate={{
              offsetDistance: ["0%", "100%"],
            }}
            transition={{
              duration: 25,
              repeat: Infinity,
              ease: "linear",
            }}
            style={{ offsetPath: "path('M -50 400 Q 400 -50 850 400')" }}
          >
            <circle r="50" fill="url(#moonGlow)" filter="url(#glow)" />
            <g transform="scale(1.2)">
              <circle r="12" fill="white" />
              <circle r="12" fill="#05070a" cx="8" />
            </g>
            <text
              y="40"
              textAnchor="middle"
              className="fill-white/80 text-[10px] uppercase tracking-[0.2em] font-black"
            >
              Луна (Ай)
            </text>
          </motion.g>

          {/* Technical HUD Elements */}
          <g transform="translate(40, 40)">
            <rect
              width="140"
              height="70"
              fill="black"
              fillOpacity="0.6"
              className="stroke-white/20"
            />
            <line
              x1="10"
              y1="20"
              x2="130"
              y2="20"
              stroke="cyan"
              strokeWidth="2"
              className="opacity-40"
            />
            <text
              x="15"
              y="40"
              className="fill-cyan-400 text-[10px] font-mono uppercase tracking-tight"
            >
              Focus: M45 Cluster
            </text>
            <text
              x="15"
              y="55"
              className="fill-white/60 text-[9px] font-mono italic"
            >
              Alt: +62° 11' 24"
            </text>
            <text x="15" y="65" className="fill-white/60 text-[9px] font-mono">
              Epoch: J2000.0
            </text>
          </g>

          <g transform="translate(620, 360)">
            <text
              textAnchor="end"
              className="fill-accent text-[11px] font-bold uppercase tracking-[0.2em]"
            >
              Celestial Sync
            </text>
            <text
              y="15"
              textAnchor="end"
              className="fill-white/30 text-[9px] uppercase tracking-[0.4em]"
            >
              Observation Mode
            </text>
          </g>
        </svg>

        {/* Legend Overlay */}
        <div className="absolute top-6 right-8 text-right space-y-3">
          <div className="flex items-center justify-end gap-3">
            <span className="text-[10px] text-white/50 uppercase font-black tracking-widest bg-white/5 px-2 py-1 rounded">
              M45
            </span>
            <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_12px_#34eaff]" />
          </div>
          <div className="flex items-center justify-end gap-3 text-[10px] text-white/40 italic">
            "Үркүр / Плеяды"
          </div>
        </div>
      </div>

      <div className="pt-8 border-t border-border">
        <div className="flex flex-col lg:flex-row gap-10">
          <div className="flex-1 space-y-6">
            <h3 className="text-2xl font-serif font-bold text-brand-900 flex items-center gap-3">
              <Wind className="text-accent" /> Ветровой Код (Ключ Месяца)
            </h3>
            <p className="text-[14px] text-text-dim leading-relaxed">
              <strong>Ветровой Код</strong> — это фундаментальное понятие в
              методологии Дастана Сарыгулова. Согласно традиционным знаниям
              Эсепчи, в момент <strong>Тогоола</strong> (астрономического
              сближения Луны и созвездия Плеяды) Земля проходит через
              критическую энергетическую точку, которая «программирует»
              состояние атмосферы на следующие 27-28 дней.
            </p>
            <div className="bg-brand-100/50 p-5 rounded-2xl border-l-4 border-accent">
              <p className="text-sm font-medium text-brand-900 italic">
                «Состояние атмосферы (ветер) в момент Тогоола является матрицей
                для всего лунного месяца.»
              </p>
            </div>
            <div className="space-y-4">
              <h4 className="text-[11px] uppercase tracking-[0.2em] font-black text-brand-800">
                Как это работает:
              </h4>
              <ul className="space-y-3">
                {[
                  {
                    q: "Когда определять?",
                    a: "В ночь Тогоола. В календаре эти дни отмечены золотой точкой.",
                  },
                  {
                    q: "На что смотреть?",
                    a: "На направление и силу ветра в полночь, а также на чистоту неба вокруг созвездия Плеяды (Уркер).",
                  },
                  {
                    q: "Как фиксировать?",
                    a: "Используйте кнопку '+' в правой панели, чтобы добавить 'Ветровой код' в день Тогоола.",
                  },
                ].map((item, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="text-accent font-bold">•</span>
                    <span className="text-text-dim">
                      <strong className="text-brand-900">{item.q}</strong>{" "}
                      {item.a}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="lg:w-[400px] flex flex-col gap-4">
            <h4 className="text-[11px] uppercase tracking-[0.2em] font-black text-brand-800">
              Матрица Прогнозов
            </h4>
            <div className="grid gap-2">
              {[
                {
                  dir: "Западный (Батыш)",
                  pattern: "Влажная матрица",
                  desc: "Приносит облака и стабильные осадки на весь месяц.",
                  color: "blue",
                },
                {
                  dir: "Северный (Түндүк)",
                  pattern: "Холодная матрица",
                  desc: "Месяц будет экстремально холодным, ниже нормы.",
                  color: "cyan",
                },
                {
                  dir: "Южный (Түштүк)",
                  pattern: "Засушливый код",
                  desc: "Ожидайте отсутствие осадков и суховеи.",
                  color: "orange",
                },
                {
                  dir: "Безветрие (Тынч)",
                  pattern: "Ясная матрица",
                  desc: "Месяц пройдет под знаком высокого давления и солнца.",
                  color: "amber",
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className={`p-4 rounded-xl border border-${item.color}-100 bg-${item.color}-50/30 flex flex-col gap-1`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-brand-900">
                      {item.dir}
                    </span>
                    <span
                      className={`text-[10px] font-black uppercase text-${item.color}-600`}
                    >
                      {item.pattern}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-dim leading-snug">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:gap-8 pt-8 border-t border-border">
        {[
          {
            title: "Мучол (12 лет) — Гравитация Юпитера",
            text: "Первичный слой. Каждый год в 12-летнем цикле имеет свой 'характер'. Например, год Мыши всегда более влажный, а год Собаки — холодный. Это база, которая определяет 'фон' осадков на весь год вперед.",
          },
          {
            title: "Тогоол — Ветровой Код (Ключ)",
            text: "Самый важный секрет Эсепчи. В день встречи Луны и Плеяд (раз в 27 дней) природа 'программирует' погоду на весь лунный месяц. Ветер в этот момент — это КОД. Если ветер Западный — жди дождливый месяц. Если небо чистое — месяц будет ясным. Прогноз на месяц вперед строится именно на этом событии.",
          },
          {
            title: "Амал — Оперативная правка",
            text: "Краткосрочный прогноз (сегодня/завтра). Если 'программа' месяца говорит 'будет сухо', но Амал (примета) сигнализирует о буре — значит, будет резкий, но короткий всплеск. Амалы — это датчики текущего состояния.",
          },
          {
            title: "Как узнать: Дождь, Снег или Ветер?",
            text: "Смотрите на индикаторы в правой панели. Они рассчитываются по формуле: [База Мучол] + [Ветровой код последнего Тогоола] + [Текущие приметы]. Если вероятность осадков выше 50% — значит, 'код' месяца влажный.",
          },
        ].map((item, idx) => (
          <div
            key={idx}
            className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start"
          >
            <span className="text-3xl sm:text-4xl font-serif italic text-accent opacity-30">
              0{idx + 1}
            </span>
            <div>
              <h3 className="text-lg sm:text-xl font-serif font-bold text-brand-900 mb-2">
                {item.title}
              </h3>
              <p className="text-[13px] sm:text-sm text-text-dim leading-relaxed">
                {item.text}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Amals Section */}
      <div className="pt-12 border-t border-border">
        <div className="flex items-center gap-4 mb-8">
          <Sparkles className="text-accent" size={24} />
          <h3 className="text-2xl font-serif font-bold text-brand-900">
            Амалдар: Сезонные Метки
          </h3>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {AMALS.map((amal, idx) => (
            <div
              key={idx}
              className="p-6 bg-brand-100/50 rounded-2xl border border-transparent hover:border-accent/20 transition-all group relative"
            >
              <div className="flex justify-between items-start mb-3">
                <button
                  onClick={() =>
                    setActiveHistory(
                      activeHistory === amal.name ? null : amal.name,
                    )
                  }
                  className="flex items-center gap-2 group/title"
                >
                  <span className="text-lg font-serif font-bold text-brand-900 group-hover/title:text-accent transition-colors text-left leading-tight">
                    {amal.name}
                  </span>
                  {(amal.history || amal.implications) && (
                    <ChevronRight
                      size={16}
                      className={`text-accent transition-transform duration-300 ${activeHistory === amal.name ? "rotate-90" : ""}`}
                    />
                  )}
                </button>
                <span className="cell-text-dim px-2 py-1 bg-white rounded-md text-[9px] shrink-0">
                  {amal.period}
                </span>
              </div>
              <p className="text-[13px] text-text-dim leading-relaxed mb-4">
                {amal.description}
              </p>

              <AnimatePresence>
                {activeHistory === amal.name && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-4 mb-6">
                      {amal.history && (
                        <div className="p-3 bg-white/60 border-l-2 border-accent rounded-r-lg">
                          <div className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1 flex items-center gap-1">
                            <Star size={10} strokeWidth={3} /> Наследие
                          </div>
                          <p className="text-[11px] text-brand-900 leading-relaxed italic">
                            {amal.history}
                          </p>
                        </div>
                      )}

                      {amal.implications && (
                        <div className="p-3 bg-blue-50/60 border-l-2 border-blue-400 rounded-r-lg">
                          <div className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1 flex items-center gap-1">
                            <Info size={10} strokeWidth={3} /> Практическое
                            Значение
                          </div>
                          <p className="text-[11px] text-brand-900 leading-relaxed">
                            {amal.implications}
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center gap-2 text-[11px] font-bold text-brand-900/60 uppercase tracking-wider">
                <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                Знак: {amal.sign}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
