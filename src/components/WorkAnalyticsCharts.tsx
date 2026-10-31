import { useEffect, useState, useMemo } from 'react';
import { dataAPI } from '../lib/api';
import { Clock, Calendar, TrendingUp, ChevronLeft, ChevronRight, RefreshCw, BarChart3, CheckCircle2 } from 'lucide-react';

interface DayStat {
  date: string;
  dayNumber: number;
  dayOfWeek: string;
  hours: number;
  in_time: string | null;
  out_time: string | null;
  status: string;
  is_worked: boolean;
  is_weekend: boolean;
  is_today: boolean;
  is_future: boolean;
}

interface MonthStat {
  month: string;
  monthName: string;
  monthNumber: number;
  daysWorked: number;
  totalHours: number;
  presentDays: number;
  lateDays: number;
  leaveDays: number;
  absentDays: number;
  isCurrentMonth: boolean;
  isFutureMonth: boolean;
}

interface AnalyticsData {
  user: {
    id: string;
    full_name: string;
    employee_id: string;
    email: string;
  };
  daily_chart: {
    month: string;
    year: number;
    month_number: number;
    days_in_month: number;
    total_hours: number;
    total_days_worked: number;
    avg_hours_per_day: number;
    present_days: number;
    late_days: number;
    partial_days: number;
    leave_days: number;
    absent_days: number;
    days: DayStat[];
  };
  monthly_chart: {
    year: number;
    total_days_worked: number;
    total_hours: number;
    avg_days_per_month: number;
    months: MonthStat[];
  };
}

interface Props {
  userId?: string | null;
  title?: string;
}

export function WorkAnalyticsCharts({ userId, title = 'Work & Attendance Analytics' }: Props) {
  const now = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedYear, setSelectedYear] = useState<number>(() => now.getFullYear());
  const [activeTab, setActiveTab] = useState<'both' | 'daily' | 'monthly'>('both');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [hoveredDay, setHoveredDay] = useState<DayStat | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<MonthStat | null>(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await dataAPI.getAttendanceAnalytics({
        month: selectedMonth,
        year: selectedYear,
        user_id: userId || undefined,
      });
      setData(res);
    } catch (err: any) {
      console.error('Failed to load attendance analytics', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear, userId]);

  // Navigate months
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    setSelectedMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const next = new Date(y, m, 1);
    setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };

  // Navigate years
  const handlePrevYear = () => {
    setSelectedYear((prev) => prev - 1);
  };

  const handleNextYear = () => {
    setSelectedYear((prev) => prev + 1);
  };

  const monthLabel = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  // Maximum scale for daily chart (at least 12 hours)
  const maxDailyHours = useMemo(() => {
    if (!data?.daily_chart.days) return 12;
    const max = Math.max(...data.daily_chart.days.map((d) => d.hours), 0);
    return Math.max(12, Math.ceil(max));
  }, [data?.daily_chart.days]);

  // Maximum scale for monthly chart (at least 26 days)
  const maxMonthlyDays = useMemo(() => {
    if (!data?.monthly_chart.months) return 26;
    const max = Math.max(...data.monthly_chart.months.map((m) => m.daysWorked), 0);
    return Math.max(26, Math.ceil(max));
  }, [data?.monthly_chart.months]);

  const formatTime = (iso: string | null) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return '—';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden space-y-6 p-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-700">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{title}</h2>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Total hours worked per day (per month chart) & total days worked per month (per year chart)
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Buttons */}
          <div className="bg-gray-100 dark:bg-gray-700/60 p-1 rounded-xl flex items-center text-xs font-semibold">
            <button
              onClick={() => setActiveTab('both')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'both'
                  ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
              }`}
            >
              Both Charts
            </button>
            <button
              onClick={() => setActiveTab('daily')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'daily'
                  ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
              }`}
            >
              Daily Hours
            </button>
            <button
              onClick={() => setActiveTab('monthly')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'monthly'
                  ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
              }`}
            >
              Monthly Days
            </button>
          </div>

          <button
            onClick={fetchAnalytics}
            className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-500 dark:text-gray-400 transition-colors shadow-sm"
            title="Refresh analytics data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-xs text-gray-400">Loading work & attendance records...</p>
        </div>
      ) : !data ? (
        <div className="py-12 text-center text-sm text-gray-500">No attendance records found.</div>
      ) : (
        <div className="space-y-8">
          {/* ============================================================== */}
          {/* CHART 1: TOTAL HOURS WORKED PER DAY (PER MONTH CHART)           */}
          {/* ============================================================== */}
          {(activeTab === 'both' || activeTab === 'daily') && (
            <div className="p-5 rounded-2xl bg-gradient-to-br from-gray-50 to-blue-50/20 dark:from-gray-800/80 dark:to-gray-900/40 border border-gray-200 dark:border-gray-700/80 space-y-5">
              {/* Chart Header & Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      Total Hours Worked Per Day
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Daily breakdown for <b className="text-gray-800 dark:text-gray-200">{monthLabel}</b>
                  </p>
                </div>

                {/* Month Navigator */}
                <div className="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                  <button
                    onClick={handlePrevMonth}
                    className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                    title="Previous Month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-bold text-xs text-gray-800 dark:text-gray-200 min-w-[120px] text-center">
                    {monthLabel}
                  </span>
                  <button
                    onClick={handleNextMonth}
                    className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                    title="Next Month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Monthly KPI Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-white dark:bg-gray-800 rounded-xl border border-blue-100 dark:border-gray-700 shadow-sm">
                  <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 mb-1">
                    <Clock className="w-4 h-4" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">Total Hours</span>
                  </div>
                  <p className="text-2xl font-black text-gray-900 dark:text-gray-100">
                    {data.daily_chart.total_hours} <span className="text-xs font-normal text-gray-400">hrs</span>
                  </p>
                </div>

                <div className="p-3.5 bg-white dark:bg-gray-800 rounded-xl border border-green-100 dark:border-gray-700 shadow-sm">
                  <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 mb-1">
                    <Calendar className="w-4 h-4" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">Days Worked</span>
                  </div>
                  <p className="text-2xl font-black text-gray-900 dark:text-gray-100">
                    {data.daily_chart.total_days_worked} <span className="text-xs font-normal text-gray-400">days</span>
                  </p>
                </div>

                <div className="p-3.5 bg-white dark:bg-gray-800 rounded-xl border border-indigo-100 dark:border-gray-700 shadow-sm">
                  <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 mb-1">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">Avg Daily Hours</span>
                  </div>
                  <p className="text-2xl font-black text-gray-900 dark:text-gray-100">
                    {data.daily_chart.avg_hours_per_day} <span className="text-xs font-normal text-gray-400">hrs/day</span>
                  </p>
                </div>

                <div className="p-3.5 bg-white dark:bg-gray-800 rounded-xl border border-purple-100 dark:border-gray-700 shadow-sm">
                  <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 mb-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">Status Breakdown</span>
                  </div>
                  <div className="text-xs font-bold text-gray-700 dark:text-gray-200 mt-1 space-y-0.5">
                    <div>
                      <span className="text-green-600 dark:text-green-400 font-extrabold">{data.daily_chart.present_days}</span> Present
                      {data.daily_chart.late_days > 0 && (
                        <span> · <span className="text-orange-500 font-extrabold">{data.daily_chart.late_days}</span> Late</span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {data.daily_chart.leave_days} Leave · {data.daily_chart.absent_days} Absent
                    </div>
                  </div>
                </div>
              </div>

              {/* Interactive Daily Bar Chart Container */}
              <div className="bg-white dark:bg-gray-800/90 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm relative">
                {/* 10-Hour Full Day Reference line */}
                <div
                  className="absolute left-10 right-4 border-b border-dashed border-blue-400 dark:border-blue-600 pointer-events-none z-10 flex items-center justify-end"
                  style={{ bottom: `${(10 / maxDailyHours) * 160 + 40}px` }}
                >
                  <span className="bg-blue-50 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs -translate-y-2">
                    10h Full Day Goal
                  </span>
                </div>

                {/* Bars Area */}
                <div className="h-44 flex items-end gap-1 sm:gap-1.5 pt-6 pb-2 px-2 overflow-x-auto custom-scrollbar">
                  {data.daily_chart.days.map((day) => {
                    const heightPercent = maxDailyHours > 0 ? (day.hours / maxDailyHours) * 100 : 0;
                    const isHovered = hoveredDay?.date === day.date;

                    // Color determination (Full day is 10 hours)
                    let barColor = 'bg-blue-600 hover:bg-blue-700';
                    if (day.hours >= 10) {
                      barColor = 'bg-gradient-to-t from-blue-600 to-indigo-500';
                    } else if (day.hours > 0 && day.hours < 10) {
                      barColor = 'bg-gradient-to-t from-orange-400 to-amber-500';
                    } else if (day.status === 'leave') {
                      barColor = 'bg-purple-400';
                    } else if (day.is_weekend) {
                      barColor = 'bg-gray-200 dark:bg-gray-700';
                    } else {
                      barColor = 'bg-gray-100 dark:bg-gray-700/50';
                    }

                    return (
                      <div
                        key={day.date}
                        className="flex-1 min-w-[18px] sm:min-w-[22px] flex flex-col items-center h-full justify-end group cursor-pointer relative"
                        onMouseEnter={() => setHoveredDay(day)}
                        onMouseLeave={() => setHoveredDay(null)}
                      >
                        {/* Tooltip on Hover */}
                        {isHovered && (
                          <div className="absolute bottom-full mb-2 z-30 p-2.5 bg-gray-900 text-white rounded-lg text-[11px] shadow-xl pointer-events-none whitespace-nowrap min-w-[130px] border border-gray-700">
                            <p className="font-bold text-gray-200">{day.date} ({day.dayOfWeek})</p>
                            <p className="text-blue-400 font-extrabold text-xs mt-0.5">
                              {day.hours > 0 ? `${day.hours} Hours Worked` : 'No hours logged'}
                            </p>
                            <div className="text-[10px] text-gray-300 mt-1 border-t border-gray-700 pt-1 space-y-0.5">
                              <p>IN: {formatTime(day.in_time)}</p>
                              <p>OUT: {formatTime(day.out_time)}</p>
                              <p className="uppercase text-[9px] font-bold text-gray-400">Status: {day.status}</p>
                            </div>
                          </div>
                        )}

                        {/* Top hours label if > 0 */}
                        <span className={`text-[9px] font-bold mb-1 transition-opacity ${
                          day.hours > 0 ? 'text-gray-700 dark:text-gray-300' : 'text-transparent'
                        }`}>
                          {day.hours > 0 ? `${day.hours}h` : ''}
                        </span>

                        {/* The Bar */}
                        <div
                          className={`w-full rounded-t-md transition-all duration-300 ${barColor} ${
                            day.is_today ? 'ring-2 ring-blue-500 shadow-md' : ''
                          }`}
                          style={{
                            height: day.hours > 0 ? `${Math.max(8, heightPercent)}%` : '4px',
                          }}
                        />

                        {/* Day Number Label */}
                        <span className={`text-[10px] mt-1.5 font-bold ${
                          day.is_today
                            ? 'text-blue-600 dark:text-blue-400 font-black'
                            : day.is_weekend
                            ? 'text-gray-400 dark:text-gray-500'
                            : 'text-gray-600 dark:text-gray-300'
                        }`}>
                          {day.dayNumber}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-2 border-t border-gray-100 dark:border-gray-700/60 text-[11px] text-gray-500 dark:text-gray-400">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-gradient-to-t from-blue-600 to-indigo-500" />
                      <span>Full Day (≥ 10h)</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-gradient-to-t from-orange-400 to-amber-500" />
                      <span>Partial (&lt; 10h)</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-purple-400" />
                      <span>Leave</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-gray-200 dark:bg-gray-700" />
                      <span>Weekend / Off</span>
                    </span>
                  </div>

                  {hoveredDay && (
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      Day {hoveredDay.dayNumber}: <b>{hoveredDay.hours} hrs</b> ({hoveredDay.status})
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* CHART 2: TOTAL DAYS WORKED PER MONTH (PER YEAR CHART)          */}
          {/* ============================================================== */}
          {(activeTab === 'both' || activeTab === 'monthly') && (
            <div className="p-5 rounded-2xl bg-gradient-to-br from-gray-50 to-emerald-50/20 dark:from-gray-800/80 dark:to-gray-900/40 border border-gray-200 dark:border-gray-700/80 space-y-5">
              {/* Chart Header & Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      Total Days & Hours Worked Per Month
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Yearly attendance overview for <b className="text-gray-800 dark:text-gray-200">{selectedYear}</b>
                  </p>
                </div>

                {/* Year Navigator */}
                <div className="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                  <button
                    onClick={handlePrevYear}
                    className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                    title="Previous Year"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-bold text-xs text-gray-800 dark:text-gray-200 min-w-[70px] text-center">
                    {selectedYear}
                  </span>
                  <button
                    onClick={handleNextYear}
                    className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                    title="Next Year"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Yearly KPI Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-white dark:bg-gray-800 rounded-xl border border-emerald-100 dark:border-gray-700 shadow-sm">
                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-1">
                    <Calendar className="w-4 h-4" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">Total Days Worked in {selectedYear}</span>
                  </div>
                  <p className="text-2xl font-black text-gray-900 dark:text-gray-100">
                    {data.monthly_chart.total_days_worked} <span className="text-xs font-normal text-gray-400">days</span>
                  </p>
                </div>

                <div className="p-3.5 bg-white dark:bg-gray-800 rounded-xl border border-blue-100 dark:border-gray-700 shadow-sm">
                  <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 mb-1">
                    <Clock className="w-4 h-4" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">Total Hours in {selectedYear}</span>
                  </div>
                  <p className="text-2xl font-black text-gray-900 dark:text-gray-100">
                    {data.monthly_chart.total_hours} <span className="text-xs font-normal text-gray-400">hrs</span>
                  </p>
                </div>

                <div className="p-3.5 bg-white dark:bg-gray-800 rounded-xl border border-indigo-100 dark:border-gray-700 shadow-sm">
                  <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 mb-1">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">Avg Monthly Days</span>
                  </div>
                  <p className="text-2xl font-black text-gray-900 dark:text-gray-100">
                    {data.monthly_chart.avg_days_per_month} <span className="text-xs font-normal text-gray-400">days/month</span>
                  </p>
                </div>
              </div>

              {/* Interactive Monthly Bar Chart */}
              <div className="bg-white dark:bg-gray-800/90 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm relative">
                {/* 22-Day Standard benchmark line */}
                <div
                  className="absolute left-10 right-4 border-b border-dashed border-emerald-300 dark:border-emerald-700 pointer-events-none z-10 flex items-center justify-end"
                  style={{ bottom: `${(22 / maxMonthlyDays) * 160 + 40}px` }}
                >
                  <span className="bg-emerald-50 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs -translate-y-2">
                    22 Days Standard
                  </span>
                </div>

                {/* 12 Months Columns */}
                <div className="h-44 flex items-end gap-2 sm:gap-4 pt-6 pb-2 px-2 overflow-x-auto custom-scrollbar">
                  {data.monthly_chart.months.map((m) => {
                    const heightPercent = maxMonthlyDays > 0 ? (m.daysWorked / maxMonthlyDays) * 100 : 0;
                    const isHovered = hoveredMonth?.month === m.month;

                    return (
                      <div
                        key={m.month}
                        className="flex-1 min-w-[36px] sm:min-w-[48px] flex flex-col items-center h-full justify-end group cursor-pointer relative"
                        onMouseEnter={() => setHoveredMonth(m)}
                        onMouseLeave={() => setHoveredMonth(null)}
                      >
                        {/* Tooltip on Hover */}
                        {isHovered && (
                          <div className="absolute bottom-full mb-2 z-30 p-2.5 bg-gray-900 text-white rounded-lg text-[11px] shadow-xl pointer-events-none whitespace-nowrap min-w-[140px] border border-gray-700">
                            <p className="font-bold text-gray-200">{m.monthName} {selectedYear}</p>
                            <p className="text-emerald-400 font-extrabold text-xs mt-0.5">
                              {m.daysWorked} Days Worked ({m.totalHours} hrs)
                            </p>
                            <div className="text-[10px] text-gray-300 mt-1 border-t border-gray-700 pt-1 space-y-0.5">
                              <p>Present: {m.presentDays} days</p>
                              {m.lateDays > 0 && <p>Late: {m.lateDays} days</p>}
                              <p>Leaves: {m.leaveDays} days</p>
                              {m.absentDays > 0 && <p>Absent: {m.absentDays} days</p>}
                            </div>
                          </div>
                        )}

                        {/* Top days label */}
                        <div className="flex flex-col items-center mb-1">
                          <span className={`text-[10px] font-extrabold ${
                            m.daysWorked > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-300 dark:text-gray-600'
                          }`}>
                            {m.daysWorked}d
                          </span>
                          <span className="text-[8px] font-medium text-gray-400 dark:text-gray-500">
                            {m.totalHours > 0 ? `${m.totalHours}h` : ''}
                          </span>
                        </div>

                        {/* The Monthly Bar */}
                        <div
                          className={`w-full rounded-t-lg transition-all duration-300 ${
                            m.daysWorked >= 20
                              ? 'bg-gradient-to-t from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600'
                              : m.daysWorked > 0
                              ? 'bg-gradient-to-t from-teal-500 to-cyan-400 hover:from-teal-600 hover:to-cyan-500'
                              : 'bg-gray-100 dark:bg-gray-700/40'
                          } ${m.isCurrentMonth ? 'ring-2 ring-emerald-500 shadow-md' : ''}`}
                          style={{
                            height: m.daysWorked > 0 ? `${Math.max(10, heightPercent)}%` : '4px',
                          }}
                        />

                        {/* Month Name Label */}
                        <span className={`text-[11px] mt-1.5 font-bold ${
                          m.isCurrentMonth
                            ? 'text-emerald-600 dark:text-emerald-400 font-black'
                            : 'text-gray-600 dark:text-gray-300'
                        }`}>
                          {m.monthName}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-2 border-t border-gray-100 dark:border-gray-700/60 text-[11px] text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-gradient-to-t from-emerald-600 to-teal-500" />
                      <span>Full Month (≥ 20 days)</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-gradient-to-t from-teal-500 to-cyan-400" />
                      <span>Partial Month (&lt; 20 days)</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded ring-2 ring-emerald-500 bg-emerald-600" />
                      <span>Current Month</span>
                    </span>
                  </div>

                  {hoveredMonth && (
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      {hoveredMonth.monthName}: <b>{hoveredMonth.daysWorked} days</b> · <b>{hoveredMonth.totalHours} hrs</b>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

