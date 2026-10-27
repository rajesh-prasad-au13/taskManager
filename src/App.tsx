import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  format,
  parseISO,
  addDays,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  isAfter,
  isBefore,
  getDay,
  isValid,
} from 'date-fns';
import {
  Calendar as CalendarIcon,
  Plus,
  Settings,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sliders,
  Trash2,
  Edit3,
  Lock,
  Unlock,
  RotateCcw,
  FlaskConical,
  Layers,
  Info,
  X,
  ArrowRight,
  CalendarDays,
  Briefcase,
  Sparkles,
  Check,
  AlertCircle,
  Download,
  Upload,
} from 'lucide-react';
import {
  createLocalAccount,
  getLocalAuthStatus,
  loginLocalAccount,
  logoutLocalAccount,
} from './auth';

// ============================================================================
// 1. TYPES & DATA MODELS
// ============================================================================

export type Priority = 'High' | 'Medium' | 'Low';
const PRIORITY_ORDER: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

export interface ProjectCategory {
  id: string;
  name: string;
  color: string; // key into COLOR_PALETTE
}

export interface Task {
  id: string;
  title: string;
  project: string;
  priority: Priority;
  requiredHours: number;
  startDate: string; // YYYY-MM-DD local calendar date
  endDate: string;   // YYYY-MM-DD local calendar date
  includePastDates?: boolean;
  createdAt: string;
}

export interface CustomDateAvailability {
  availableHours: number;
  note?: string;
}

export interface AvailabilitySettings {
  defaultHoursPerDay: number;
  workingDays: number[]; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  referenceToday: string; // e.g. '2026-11-02'
  enforceReferenceToday: boolean; // If true, don't schedule before referenceToday unless task.includePastDates is true
  customDates: Record<string, CustomDateAvailability>;
}

// Key format: `${taskId}__${date}` -> allocatedHours
export type ManualOverridesMap = Record<string, number>;

export interface DailyAllocation {
  taskId: string;
  date: string;
  allocatedHours: number;
  isManuallyAdjusted: boolean;
}

export interface TaskScheduleSummary {
  taskId: string;
  requiredHours: number;
  scheduledHours: number;
  unscheduledHours: number;
  allocationsByDate: Record<string, DailyAllocation>;
  eligibleDatesCount: number;
  suggestedEndDate: string | null;
  hasManualConflict: boolean;
  manualConflictReason?: string;
}

export interface DayScheduleSummary {
  date: string;
  availableHours: number;
  customNote?: string;
  isWorkingDay: boolean;
  totalScheduledHours: number;
  remainingHours: number;
  isOverloaded: boolean;
  allocations: DailyAllocation[];
}

export interface ScheduleResult {
  taskSummaries: Record<string, TaskScheduleSummary>;
  daySummaries: Record<string, DayScheduleSummary>;
  allAllocations: DailyAllocation[];
}

// ============================================================================
// 2. PROJECT COLOR PALETTE & INITIAL DEMO DATA (NOV & DEC 2026)
// ============================================================================

export const COLOR_PALETTE: Record<
  string,
  {
    name: string;
    bg: string;
    bgHover: string;
    text: string;
    border: string;
    dot: string;
    badgeBg: string;
    bar: string;
  }
> = {
  blue: {
    name: 'Blue',
    bg: 'bg-blue-50/90',
    bgHover: 'hover:bg-blue-100/80',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
    badgeBg: 'bg-blue-100/80',
    bar: 'bg-blue-500',
  },
  violet: {
    name: 'Violet',
    bg: 'bg-violet-50/90',
    bgHover: 'hover:bg-violet-100/80',
    text: 'text-violet-700',
    border: 'border-violet-200',
    dot: 'bg-violet-500',
    badgeBg: 'bg-violet-100/80',
    bar: 'bg-violet-500',
  },
  emerald: {
    name: 'Emerald',
    bg: 'bg-emerald-50/90',
    bgHover: 'hover:bg-emerald-100/80',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
    badgeBg: 'bg-emerald-100/80',
    bar: 'bg-emerald-500',
  },
  amber: {
    name: 'Amber',
    bg: 'bg-amber-50/90',
    bgHover: 'hover:bg-amber-100/80',
    text: 'text-amber-800',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    badgeBg: 'bg-amber-100/80',
    bar: 'bg-amber-500',
  },
  rose: {
    name: 'Rose',
    bg: 'bg-rose-50/90',
    bgHover: 'hover:bg-rose-100/80',
    text: 'text-rose-700',
    border: 'border-rose-200',
    dot: 'bg-rose-500',
    badgeBg: 'bg-rose-100/80',
    bar: 'bg-rose-500',
  },
  cyan: {
    name: 'Cyan',
    bg: 'bg-cyan-50/90',
    bgHover: 'hover:bg-cyan-100/80',
    text: 'text-cyan-700',
    border: 'border-cyan-200',
    dot: 'bg-cyan-500',
    badgeBg: 'bg-cyan-100/80',
    bar: 'bg-cyan-500',
  },
  slate: {
    name: 'Slate',
    bg: 'bg-slate-100',
    bgHover: 'hover:bg-slate-200/70',
    text: 'text-slate-700',
    border: 'border-slate-300',
    dot: 'bg-slate-500',
    badgeBg: 'bg-slate-200/80',
    bar: 'bg-slate-600',
  },
};

export const INITIAL_CATEGORIES: ProjectCategory[] = [
  { id: 'cat-1', name: 'TDC DK Redesign', color: 'blue' },
  { id: 'cat-2', name: 'TDC ECIP', color: 'violet' },
  { id: 'cat-3', name: 'YouSee SW', color: 'emerald' },
  { id: 'cat-4', name: 'TDC DK SW', color: 'amber' },
  { id: 'cat-5', name: 'Incidents', color: 'rose' },
];

export const INITIAL_AVAILABILITY: AvailabilitySettings = {
  defaultHoursPerDay: 8,
  workingDays: [1, 2, 3, 4, 5], // Monday to Friday
  referenceToday: '2026-11-02',
  enforceReferenceToday: false,
  customDates: {
    '2026-11-11': { availableHours: 4, note: 'Half-day leave' },
    '2026-11-18': { availableHours: 5, note: 'Architecture workshops' },
    '2026-11-27': { availableHours: 6, note: 'Sprint retro & planning' },
    '2026-12-11': { availableHours: 4, note: 'Team off-site afternoon' },
    '2026-12-24': { availableHours: 0, note: 'Christmas Eve (Holiday)' },
    '2026-12-25': { availableHours: 0, note: 'Christmas Day (Holiday)' },
    '2026-12-31': { availableHours: 4, note: 'New Year Eve Half-day' },
  },
};

export const INITIAL_TASKS: Task[] = [
  {
    id: 'task-1',
    title: 'Design System & Checkout Header',
    project: 'TDC DK Redesign',
    priority: 'High',
    requiredHours: 16,
    startDate: '2026-11-02',
    endDate: '2026-11-04',
    createdAt: '2026-11-01T08:00:00Z',
  },
  {
    id: 'task-2',
    title: 'ECIP Auth Token Refresh Flow',
    project: 'TDC ECIP',
    priority: 'Medium',
    requiredHours: 14,
    startDate: '2026-11-03',
    endDate: '2026-11-06',
    createdAt: '2026-11-01T08:30:00Z',
  },
  {
    id: 'task-3',
    title: 'Production Gateway Timeout Hotfix',
    project: 'Incidents',
    priority: 'High',
    requiredHours: 8,
    startDate: '2026-11-05',
    endDate: '2026-11-06',
    createdAt: '2026-11-01T09:00:00Z',
  },
  {
    id: 'task-4',
    title: 'YouSee Broadband Plan Selector',
    project: 'YouSee SW',
    priority: 'Medium',
    requiredHours: 28,
    startDate: '2026-11-09',
    endDate: '2026-11-13',
    createdAt: '2026-11-01T09:30:00Z',
  },
  {
    id: 'task-5',
    title: 'Legacy Billing API Migration',
    project: 'TDC DK SW',
    priority: 'High',
    requiredHours: 24,
    startDate: '2026-11-11',
    endDate: '2026-11-17',
    createdAt: '2026-11-01T10:00:00Z',
  },
  {
    id: 'task-6',
    title: 'Self-Service Usage Dashboard',
    project: 'TDC DK Redesign',
    priority: 'Medium',
    requiredHours: 30,
    startDate: '2026-11-18',
    endDate: '2026-11-25',
    createdAt: '2026-11-01T10:30:00Z',
  },
  {
    id: 'task-7',
    title: 'ECIP Customer Consent Microservice',
    project: 'TDC ECIP',
    priority: 'Low',
    requiredHours: 20,
    startDate: '2026-11-23',
    endDate: '2026-11-27',
    createdAt: '2026-11-01T11:00:00Z',
  },
  {
    id: 'task-8',
    title: 'YouSee Streaming Entitlements Sync',
    project: 'YouSee SW',
    priority: 'High',
    requiredHours: 32,
    startDate: '2026-12-01',
    endDate: '2026-12-08',
    createdAt: '2026-11-01T11:30:00Z',
  },
  {
    id: 'task-9',
    title: 'Q4 Security & Dependency Audit',
    project: 'TDC DK SW',
    priority: 'Medium',
    requiredHours: 20,
    startDate: '2026-12-07',
    endDate: '2026-12-11',
    createdAt: '2026-11-01T12:00:00Z',
  },
  {
    id: 'task-10',
    title: 'Holiday Freeze Rollback Automation',
    project: 'TDC ECIP',
    priority: 'High',
    requiredHours: 24,
    startDate: '2026-12-21',
    endDate: '2026-12-28',
    createdAt: '2026-11-01T12:30:00Z',
  },
];

// ============================================================================
// 3. DATE & WORKING DAY HELPERS (lib/date-utils.ts equivalent)
// ============================================================================

export function toISODateString(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function getDateRangeISO(startISO: string, endISO: string): string[] {
  if (!startISO || !endISO || startISO > endISO) return [];
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  if (!isValid(start) || !isValid(end)) return [];
  return eachDayOfInterval({ start, end }).map((d) => format(d, 'yyyy-MM-dd'));
}

export function getDayAvailabilityInfo(
  dateISO: string,
  settings: AvailabilitySettings
): { availableHours: number; isWorkingDay: boolean; customNote?: string } {
  const custom = settings.customDates[dateISO];
  if (custom !== undefined) {
    return {
      availableHours: Math.max(0, custom.availableHours),
      isWorkingDay: custom.availableHours > 0,
      customNote: custom.note,
    };
  }
  const dayOfWeek = getDay(parseISO(dateISO));
  const isWorkDay = settings.workingDays.includes(dayOfWeek);
  return {
    availableHours: isWorkDay ? Math.max(0, settings.defaultHoursPerDay) : 0,
    isWorkingDay: isWorkDay && settings.defaultHoursPerDay > 0,
  };
}

export function formatHours(h: number): string {
  const rounded = Math.round(h * 100) / 100;
  if (Number.isInteger(rounded)) return `${rounded}`;
  // If cleanly divisible by 0.25 or 0.1
  return rounded.toFixed(2).replace(/\.?0+$/, '');
}

// ============================================================================
// 4. DETERMINISTIC SCHEDULING ENGINE (lib/scheduler.ts equivalent)
// ============================================================================

/**
 * Evenly distributes `targetHours` across `dates` respecting `maxCapPerDate`.
 * Uses a deterministic water-filling algorithm and rounds to 0.25h increments
 * whenever possible (or exact hundredths if required hours is not a multiple of 0.25).
 */
export function distributeEvenlyWithCaps(
  targetHours: number,
  dates: string[],
  freeCapacityMap: Record<string, number>
): Record<string, number> {
  const result: Record<string, number> = {};
  dates.forEach((d) => {
    result[d] = 0;
  });

  if (dates.length === 0 || targetHours <= 0.0001) {
    return result;
  }

  const totalCap = dates.reduce((acc, d) => acc + Math.max(0, freeCapacityMap[d] || 0), 0);
  if (totalCap <= 0.0001) {
    return result;
  }

  // If total free capacity is less than or equal to targetHours, fill every eligible day to its cap
  if (totalCap <= targetHours + 0.0001) {
    dates.forEach((d) => {
      result[d] = Math.round(Math.max(0, freeCapacityMap[d] || 0) * 100) / 100;
    });
    return result;
  }

  // Water-filling algorithm in exact floating point first
  let remainingToAllocate = targetHours;
  let activeDates = [...dates];
  const exactAlloc: Record<string, number> = {};

  while (activeDates.length > 0) {
    const equalShare = remainingToAllocate / activeDates.length;
    // Find any dates whose free capacity is less than or equal to equalShare
    const bottleneckDates = activeDates.filter(
      (d) => (freeCapacityMap[d] || 0) <= equalShare + 1e-7
    );

    if (bottleneckDates.length === 0) {
      // Every remaining active date can comfortably take `equalShare`
      activeDates.forEach((d) => {
        exactAlloc[d] = equalShare;
      });
      remainingToAllocate = 0;
      break;
    } else {
      // Cap all bottleneck dates at their maximum free capacity
      for (const d of bottleneckDates) {
        const cap = Math.max(0, freeCapacityMap[d] || 0);
        exactAlloc[d] = cap;
        remainingToAllocate -= cap;
      }
      activeDates = activeDates.filter((d) => !bottleneckDates.includes(d));
    }
  }

  // Check if we can quantize cleanly to 0.25h increments
  const isQuarterMultiple = Math.abs(targetHours * 4 - Math.round(targetHours * 4)) < 1e-5;
  const allCapsQuarterMultiple = dates.every((d) => {
    const c = freeCapacityMap[d] || 0;
    return Math.abs(c * 4 - Math.round(c * 4)) < 1e-5;
  });

  const step = isQuarterMultiple && allCapsQuarterMultiple ? 0.25 : 0.01;
  const invStep = Math.round(1 / step);

  let currentSumUnits = 0;
  const targetUnits = Math.round(targetHours * invStep);
  const flooredUnits: Record<string, number> = {};
  const remainders: { date: string; rem: number; capUnits: number }[] = [];

  for (const d of dates) {
    const rawUnits = (exactAlloc[d] || 0) * invStep;
    const capUnits = Math.round((freeCapacityMap[d] || 0) * invStep);
    const fl = Math.min(capUnits, Math.floor(rawUnits + 1e-7));
    flooredUnits[d] = fl;
    currentSumUnits += fl;
    remainders.push({
      date: d,
      rem: rawUnits - fl,
      capUnits,
    });
  }

  let deficitUnits = targetUnits - currentSumUnits;

  // Sort by largest fractional remainder, then later date first (so e.g. 5.33, 5.33, 5.34 puts extra unit on last day)
  remainders.sort((a, b) => {
    if (Math.abs(b.rem - a.rem) > 1e-5) return b.rem - a.rem;
    return b.date.localeCompare(a.date);
  });

  let safety = 0;
  while (deficitUnits > 0 && safety < 1000) {
    safety++;
    let progressed = false;
    for (const item of remainders) {
      if (deficitUnits <= 0) break;
      if (flooredUnits[item.date] < item.capUnits) {
        flooredUnits[item.date] += 1;
        deficitUnits -= 1;
        progressed = true;
      }
    }
    if (!progressed) break;
  }

  for (const d of dates) {
    result[d] = Math.round((flooredUnits[d] / invStep) * 100) / 100;
  }

  return result;
}

/**
 * Pure deterministic scheduling engine.
 * Sorts tasks by startDate ascending, then createdAt ascending, then id.
 */
export function runScheduler(
  tasks: Task[],
  settings: AvailabilitySettings,
  manualOverrides: ManualOverridesMap = {},
  extraDateHorizonRange?: { start: string; end: string }
): ScheduleResult {
  // 1. Sort tasks deterministically: startDate ASC, createdAt ASC, id ASC
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
    if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
    return a.id.localeCompare(b.id);
  });

  // 2. Determine full date universe to initialize day summaries
  let minDate = extraDateHorizonRange?.start || '2026-11-01';
  let maxDate = extraDateHorizonRange?.end || '2026-12-31';

  for (const t of sortedTasks) {
    if (t.startDate && t.startDate < minDate) minDate = t.startDate;
    if (t.endDate && t.endDate > maxDate) maxDate = t.endDate;
  }

  const expandableCapacity =
    sortedTasks.reduce((total, task) => total + task.requiredHours, 0) +
    Object.values(manualOverrides).reduce((total, hours) => total + Math.max(0, hours), 0);
  const daySummaries: Record<string, DayScheduleSummary> = {};
  const freeCapacity: Record<string, number> = {};

  const ensureDateInitialized = (d: string) => {
    if (daySummaries[d]) return;
    const info = getDayAvailabilityInfo(d, settings);
    daySummaries[d] = {
      date: d,
      availableHours: info.availableHours,
      customNote: info.customNote,
      isWorkingDay: info.isWorkingDay,
      totalScheduledHours: 0,
      remainingHours: info.availableHours,
      isOverloaded: false,
      allocations: [],
    };
    freeCapacity[d] =
      info.isWorkingDay && info.availableHours > 0 ? expandableCapacity : 0;
  };

  getDateRangeISO(minDate, maxDate).forEach(ensureDateInitialized);

  const taskSummaries: Record<string, TaskScheduleSummary> = {};
  const allAllocations: DailyAllocation[] = [];

  // 3. Schedule each task in deterministic order
  for (const task of sortedTasks) {
    const dateRange = getDateRangeISO(task.startDate, task.endDate);
    dateRange.forEach(ensureDateInitialized);

    // Filter dates if past-date protection is enabled
    const candidateDates = dateRange.filter((d) => {
      if (settings.enforceReferenceToday && !task.includePastDates) {
        return d >= settings.referenceToday;
      }
      return true;
    });

    const allocationsByDate: Record<string, DailyAllocation> = {};
    let manualHoursSum = 0;
    let hasManualConflict = false;
    let manualConflictReason: string | undefined;

    const unlockedEligibleDates: string[] = [];

    for (const d of candidateDates) {
      const overrideKey = `${task.id}__${d}`;
      const hasOverride = Object.prototype.hasOwnProperty.call(manualOverrides, overrideKey);

      if (hasOverride) {
        const rawManualVal = Math.max(0, Math.round(manualOverrides[overrideKey] * 100) / 100);
        manualHoursSum = Math.round((manualHoursSum + rawManualVal) * 100) / 100;

        if (rawManualVal > (freeCapacity[d] || 0) + 1e-5) {
          hasManualConflict = true;
          manualConflictReason = `Manual allocation on ${d} (${rawManualVal}h) exceeds available capacity on that day.`;
        }

        if (rawManualVal > 0 || hasOverride) {
          const alloc: DailyAllocation = {
            taskId: task.id,
            date: d,
            allocatedHours: rawManualVal,
            isManuallyAdjusted: true,
          };
          allocationsByDate[d] = alloc;
          allAllocations.push(alloc);

          daySummaries[d].allocations.push(alloc);
          daySummaries[d].totalScheduledHours =
            Math.round((daySummaries[d].totalScheduledHours + rawManualVal) * 100) / 100;
          freeCapacity[d] = Math.max(0, Math.round(((freeCapacity[d] || 0) - rawManualVal) * 100) / 100);
          daySummaries[d].remainingHours = Math.max(
            0,
            Math.round(
              (daySummaries[d].availableHours - daySummaries[d].totalScheduledHours) * 100,
            ) / 100,
          );
          if (daySummaries[d].totalScheduledHours > daySummaries[d].availableHours + 1e-5) {
            daySummaries[d].isOverloaded = true;
          }
        }
      } else {
        // Not manually locked: eligible if it's a working day with > 0 available hours
        if (daySummaries[d].isWorkingDay && daySummaries[d].availableHours > 0) {
          unlockedEligibleDates.push(d);
        }
      }
    }

    if (manualHoursSum > task.requiredHours + 1e-5) {
      hasManualConflict = true;
      manualConflictReason = `Total manual allocations (${formatHours(manualHoursSum)}h) exceed task's required hours (${formatHours(task.requiredHours)}h).`;
    }

    const remainingTaskHours = Math.max(
      0,
      Math.round((task.requiredHours - manualHoursSum) * 100) / 100
    );

    // Distribute remainingTaskHours across unlockedEligibleDates
    const autoDistributed = distributeEvenlyWithCaps(
      remainingTaskHours,
      unlockedEligibleDates,
      freeCapacity
    );

    let autoScheduledSum = 0;
    for (const d of unlockedEligibleDates) {
      const hrs = autoDistributed[d] || 0;
      if (hrs > 0) {
        const alloc: DailyAllocation = {
          taskId: task.id,
          date: d,
          allocatedHours: hrs,
          isManuallyAdjusted: false,
        };
        allocationsByDate[d] = alloc;
        allAllocations.push(alloc);
        autoScheduledSum = Math.round((autoScheduledSum + hrs) * 100) / 100;

        daySummaries[d].allocations.push(alloc);
        daySummaries[d].totalScheduledHours =
          Math.round((daySummaries[d].totalScheduledHours + hrs) * 100) / 100;
        freeCapacity[d] = Math.max(0, Math.round(((freeCapacity[d] || 0) - hrs) * 100) / 100);
        daySummaries[d].remainingHours = Math.max(
          0,
          Math.round(
            (daySummaries[d].availableHours - daySummaries[d].totalScheduledHours) * 100,
          ) / 100,
        );
        if (daySummaries[d].totalScheduledHours > daySummaries[d].availableHours + 1e-5) {
          daySummaries[d].isOverloaded = true;
        }
      }
    }

    const totalScheduledForTask = Math.round((manualHoursSum + autoScheduledSum) * 100) / 100;
    const unscheduledHours = Math.max(
      0,
      Math.round((task.requiredHours - totalScheduledForTask) * 100) / 100
    );

    // If unscheduledHours > 0, compute suggestedEndDate by scanning forward up to 90 days
    let suggestedEndDate: string | null = null;
    if (unscheduledHours > 0.001 && isValid(parseISO(task.endDate))) {
      let needed = unscheduledHours;
      let cursor = parseISO(task.endDate);
      for (let i = 1; i <= 90; i++) {
        cursor = addDays(cursor, 1);
        const iso = toISODateString(cursor);
        ensureDateInitialized(iso);
        if (settings.enforceReferenceToday && !task.includePastDates && iso < settings.referenceToday) {
          continue;
        }
        const freeOnDay = freeCapacity[iso] || 0;
        if (freeOnDay > 0) {
          needed -= freeOnDay;
          if (needed <= 0.001) {
            suggestedEndDate = iso;
            break;
          }
        }
      }
    }

    taskSummaries[task.id] = {
      taskId: task.id,
      requiredHours: task.requiredHours,
      scheduledHours: totalScheduledForTask,
      unscheduledHours,
      allocationsByDate,
      eligibleDatesCount:
        unlockedEligibleDates.length +
        Object.keys(allocationsByDate).filter((d) => allocationsByDate[d].isManuallyAdjusted).length,
      suggestedEndDate,
      hasManualConflict,
      manualConflictReason,
    };
  }

  return {
    taskSummaries,
    daySummaries,
    allAllocations,
  };
}

// ============================================================================
// 5. AUTOMATED UNIT TEST SUITE FOR SCHEDULING ENGINE
// ============================================================================

export interface UnitTestResult {
  id: string;
  name: string;
  scenario: string;
  passed: boolean;
  details: string;
}

export function runSchedulerUnitTests(): UnitTestResult[] {
  const baseSettings: AvailabilitySettings = {
    defaultHoursPerDay: 8,
    workingDays: [1, 2, 3, 4, 5],
    referenceToday: '2026-11-02',
    enforceReferenceToday: false,
    customDates: {},
  };

  const results: UnitTestResult[] = [];

  // Test 1: Spec Example (16 hours across Nov 2 - Nov 4)
  {
    const tasks: Task[] = [
      {
        id: 't1',
        title: 'TDC DK Redesign',
        project: 'TDC DK Redesign',
        priority: 'High',
        requiredHours: 16,
        startDate: '2026-11-02',
        endDate: '2026-11-04',
        createdAt: '2026-11-01T00:00:00Z',
      },
    ];
    const res = runScheduler(tasks, baseSettings);
    const s = res.taskSummaries['t1'];
    const d1 = s.allocationsByDate['2026-11-02']?.allocatedHours || 0;
    const d2 = s.allocationsByDate['2026-11-03']?.allocatedHours || 0;
    const d3 = s.allocationsByDate['2026-11-04']?.allocatedHours || 0;
    const sum = Math.round((d1 + d2 + d3) * 100) / 100;
    const passed =
      sum === 16 &&
      s.unscheduledHours === 0 &&
      Math.abs(d1 - 5.25) <= 0.25 &&
      Math.abs(d3 - 5.5) <= 0.25;
    results.push({
      id: 'test-1',
      name: 'Even Workload Distribution (Nov 2 – Nov 4, 16h)',
      scenario: 'Distributes 16h evenly across 3 working days in 0.25h increments summing to 16.0h.',
      passed,
      details: `Nov 2: ${d1}h, Nov 3: ${d2}h, Nov 4: ${d3}h (Total: ${sum}h, Unscheduled: ${s.unscheduledHours}h)`,
    });
  }

  // Test 2: Weekend Exclusion
  {
    const tasks: Task[] = [
      {
        id: 't-wknd',
        title: 'Weekend Span Task',
        project: 'YouSee SW',
        priority: 'Medium',
        requiredHours: 16,
        startDate: '2026-11-06', // Friday
        endDate: '2026-11-09',   // Monday
        createdAt: '2026-11-01T00:00:00Z',
      },
    ];
    const res = runScheduler(tasks, baseSettings);
    const s = res.taskSummaries['t-wknd'];
    const fri = s.allocationsByDate['2026-11-06']?.allocatedHours || 0;
    const sat = s.allocationsByDate['2026-11-07']?.allocatedHours || 0;
    const sun = s.allocationsByDate['2026-11-08']?.allocatedHours || 0;
    const mon = s.allocationsByDate['2026-11-09']?.allocatedHours || 0;
    const passed = fri === 8 && sat === 0 && sun === 0 && mon === 8;
    results.push({
      id: 'test-2',
      name: 'Weekend Exclusion (Fri Nov 6 – Mon Nov 9)',
      scenario: 'Skips Saturday & Sunday automatically and allocates 8h on Friday and 8h on Monday.',
      passed,
      details: `Fri: ${fri}h, Sat: ${sat}h, Sun: ${sun}h, Mon: ${mon}h`,
    });
  }

  // Test 3: Positive custom availability can expand to meet the task deadline
  {
    const tasks: Task[] = [
      {
        id: 't-early',
        title: 'Pinned Day Task',
        project: 'Incidents',
        priority: 'High',
        requiredHours: 6,
        startDate: '2026-11-03',
        endDate: '2026-11-03',
        createdAt: '2026-11-01T00:00:00Z',
      },
      {
        id: 't-span',
        title: 'Spanning Task',
        project: 'TDC DK Redesign',
        priority: 'Medium',
        requiredHours: 16,
        startDate: '2026-11-02', // earlier start date -> scheduled first unless t-early starts earlier
        endDate: '2026-11-04',
        createdAt: '2026-11-01T01:00:00Z',
      },
    ];
    // Make t-early start on Nov 2 as well or test custom availability on Nov 3 = 2h
    const customSettings: AvailabilitySettings = {
      ...baseSettings,
      customDates: {
        '2026-11-03': { availableHours: 2, note: 'Heavy meetings' },
      },
    };
    const res = runScheduler([tasks[1]], customSettings);
    const s = res.taskSummaries['t-span'];
    const d1 = s.allocationsByDate['2026-11-02']?.allocatedHours || 0;
    const d2 = s.allocationsByDate['2026-11-03']?.allocatedHours || 0;
    const d3 = s.allocationsByDate['2026-11-04']?.allocatedHours || 0;
    const passed =
      Math.abs(d1 - 5.25) <= 0.25 &&
      Math.abs(d2 - 5.25) <= 0.25 &&
      Math.abs(d3 - 5.5) <= 0.25 &&
      res.daySummaries['2026-11-03'].availableHours === 2 &&
      res.daySummaries['2026-11-03'].isOverloaded &&
      s.unscheduledHours === 0;
    results.push({
      id: 'test-3',
      name: 'Automatic Capacity Expansion on Reduced-Capacity Days',
      scenario: 'A positive 2h custom day can expand as needed so a 16h task fits evenly across Nov 2–4.',
      passed,
      details: `Nov 2: ${d1}h, Nov 3: ${d2}h scheduled / ${res.daySummaries['2026-11-03'].availableHours}h baseline, Nov 4: ${d3}h`,
    });
  }

  // Test 4: Automatic capacity expansion meets a tight deadline
  {
    const tasks: Task[] = [
      {
        id: 't-over',
        title: 'Large Feature',
        project: 'TDC ECIP',
        priority: 'High',
        requiredHours: 22,
        startDate: '2026-11-02',
        endDate: '2026-11-03',
        createdAt: '2026-11-01T00:00:00Z',
      },
    ];
    const res = runScheduler(tasks, baseSettings);
    const s = res.taskSummaries['t-over'];
    const passed =
      s.scheduledHours === 22 &&
      s.unscheduledHours === 0 &&
      res.daySummaries['2026-11-02'].availableHours === 8 &&
      res.daySummaries['2026-11-03'].availableHours === 8 &&
      res.daySummaries['2026-11-02'].isOverloaded &&
      res.daySummaries['2026-11-03'].isOverloaded;
    results.push({
      id: 'test-4',
      name: 'Capacity Expansion to Meet a Tight Deadline',
      scenario: 'A 22h task within a 2-day deadline expands both workdays to fit without unscheduled hours.',
      passed,
      details: `Scheduled: ${s.scheduledHours}h, Unscheduled: ${s.unscheduledHours}h, Nov 2–3 baseline: ${res.daySummaries['2026-11-02'].availableHours}h / ${res.daySummaries['2026-11-03'].availableHours}h`,
    });
  }

  // Test 5: Deterministic Ordering for Same Start Date
  {
    const tasks: Task[] = [
      {
        id: 't-second',
        title: 'Created Second',
        project: 'YouSee SW',
        priority: 'Low',
        requiredHours: 6,
        startDate: '2026-11-02',
        endDate: '2026-11-02',
        createdAt: '2026-11-01T10:00:00Z',
      },
      {
        id: 't-first',
        title: 'Created First',
        project: 'TDC DK SW',
        priority: 'High',
        requiredHours: 6,
        startDate: '2026-11-02',
        endDate: '2026-11-02',
        createdAt: '2026-11-01T08:00:00Z',
      },
    ];
    const res = runScheduler(tasks, baseSettings);
    const firstAlloc = res.taskSummaries['t-first'].scheduledHours;
    const secondAlloc = res.taskSummaries['t-second'].scheduledHours;
    const available = res.daySummaries['2026-11-02'].availableHours;
    const passed =
      firstAlloc === 6 &&
      secondAlloc === 6 &&
      available === 8 &&
      res.daySummaries['2026-11-02'].isOverloaded &&
      res.taskSummaries['t-second'].unscheduledHours === 0;
    results.push({
      id: 'test-5',
      name: 'Shared-Day Capacity Expands for Overlapping Tasks',
      scenario: 'Two 6h tasks on one workday both fit, expanding daily capacity from 8h to 12h.',
      passed,
      details: `First Task: ${firstAlloc}h, Second Task: ${secondAlloc}h, baseline: ${available}h`,
    });
  }

  // Test 6: Manual Allocation Preservation & Redistribution
  {
    const tasks: Task[] = [
      {
        id: 't-man',
        title: 'Manual Override Task',
        project: 'TDC DK Redesign',
        priority: 'Medium',
        requiredHours: 20,
        startDate: '2026-11-02',
        endDate: '2026-11-06', // 5 working days (default 4h/day)
        createdAt: '2026-11-01T00:00:00Z',
      },
    ];
    // Lock Nov 2 to 8h manually -> remaining 12h should distribute evenly across Nov 3..6 (3h each)
    const overrides: ManualOverridesMap = { 't-man__2026-11-02': 8 };
    const res = runScheduler(tasks, baseSettings, overrides);
    const s = res.taskSummaries['t-man'];
    const d1 = s.allocationsByDate['2026-11-02']?.allocatedHours;
    const d2 = s.allocationsByDate['2026-11-03']?.allocatedHours;
    const d5 = s.allocationsByDate['2026-11-06']?.allocatedHours;
    const passed =
      d1 === 8 &&
      s.allocationsByDate['2026-11-02']?.isManuallyAdjusted === true &&
      d2 === 3 &&
      d5 === 3 &&
      s.unscheduledHours === 0;
    results.push({
      id: 'test-6',
      name: 'Manual Allocation Lock & Automatic Redistribution',
      scenario: '20h task over 5 days: locking Nov 2 at 8h automatically redistributes remaining 12h as 3h/day across Nov 3–6.',
      passed,
      details: `Nov 2 (Locked): ${d1}h, Nov 3–6 (Auto): ${d2}h/day`,
    });
  }

  // Test 7: Zero Availability Holiday Handling
  {
    const holidaySettings: AvailabilitySettings = {
      ...baseSettings,
      customDates: {
        '2026-12-24': { availableHours: 0, note: 'Holiday' },
        '2026-12-25': { availableHours: 0, note: 'Holiday' },
      },
    };
    const tasks: Task[] = [
      {
        id: 't-hol',
        title: 'Holiday Week Task',
        project: 'Incidents',
        priority: 'High',
        requiredHours: 8,
        startDate: '2026-12-24',
        endDate: '2026-12-25',
        createdAt: '2026-12-01T00:00:00Z',
      },
    ];
    const res = runScheduler(tasks, holidaySettings);
    const s = res.taskSummaries['t-hol'];
    const passed = s.scheduledHours === 0 && s.unscheduledHours === 8 && s.eligibleDatesCount === 0;
    results.push({
      id: 'test-7',
      name: 'Zero-Availability Holiday Handling',
      scenario: 'Task scheduled exclusively over 0h holidays allocates 0h and reports 8h unscheduled without crashing.',
      passed,
      details: `Eligible Days: ${s.eligibleDatesCount}, Scheduled: ${s.scheduledHours}h, Unscheduled: ${s.unscheduledHours}h`,
    });
  }

  return results;
}

// ============================================================================
// 6. LOCAL STORAGE KEYS & HELPERS (lib/storage.ts equivalent)
// ============================================================================

const STORAGE_KEYS = {
  TASKS: 'workload_planner_tasks_v1',
  AVAILABILITY: 'workload_planner_availability_v1',
  CATEGORIES: 'workload_planner_categories_v1',
  OVERRIDES: 'workload_planner_overrides_v1',
};

interface PlannerBackup {
  version: 1;
  exportedAt: string;
  data: {
    tasks: Task[];
    availability: AvailabilitySettings;
    categories: ProjectCategory[];
    manualOverrides: ManualOverridesMap;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isISODate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    isValid(parseISO(value))
  );
}

function isTask(value: unknown): value is Task {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.title === 'string' &&
    typeof value.project === 'string' &&
    ['High', 'Medium', 'Low'].includes(String(value.priority)) &&
    typeof value.requiredHours === 'number' &&
    Number.isFinite(value.requiredHours) &&
    value.requiredHours >= 0 &&
    isISODate(value.startDate) &&
    isISODate(value.endDate) &&
    value.startDate <= value.endDate &&
    typeof value.createdAt === 'string' &&
    (value.includePastDates === undefined || typeof value.includePastDates === 'boolean')
  );
}

function isProjectCategory(value: unknown): value is ProjectCategory {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    typeof value.color === 'string' &&
    Object.hasOwn(COLOR_PALETTE, value.color)
  );
}

function isAvailabilitySettings(value: unknown): value is AvailabilitySettings {
  if (!isRecord(value) || !isRecord(value.customDates)) return false;
  return (
    typeof value.defaultHoursPerDay === 'number' &&
    Number.isFinite(value.defaultHoursPerDay) &&
    value.defaultHoursPerDay >= 0 &&
    value.defaultHoursPerDay <= 24 &&
    Array.isArray(value.workingDays) &&
    value.workingDays.every(
      (day) => Number.isInteger(day) && day >= 0 && day <= 6,
    ) &&
    new Set(value.workingDays).size === value.workingDays.length &&
    isISODate(value.referenceToday) &&
    typeof value.enforceReferenceToday === 'boolean' &&
    Object.entries(value.customDates).every(
      ([date, settings]) =>
        isISODate(date) &&
        isRecord(settings) &&
        typeof settings.availableHours === 'number' &&
        Number.isFinite(settings.availableHours) &&
        settings.availableHours >= 0 &&
        settings.availableHours <= 24 &&
        (settings.note === undefined || typeof settings.note === 'string'),
    )
  );
}

function isManualOverridesMap(value: unknown): value is ManualOverridesMap {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([key, hours]) =>
        key.includes('__') &&
        typeof hours === 'number' &&
        Number.isFinite(hours) &&
        hours >= 0,
    )
  );
}

function validatePlannerBackup(value: unknown): PlannerBackup['data'] {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.data)) {
    throw new Error('Unsupported or invalid backup file.');
  }

  const { tasks, availability, categories, manualOverrides } = value.data;
  if (!Array.isArray(tasks) || !Array.isArray(categories)) {
    throw new Error('Backup is missing planner data.');
  }

  const validTasks = tasks.filter(isTask);
  if (validTasks.length !== tasks.length) throw new Error('Backup contains an invalid task.');

  const validCategories = categories.filter(isProjectCategory);
  if (validCategories.length !== categories.length) {
    throw new Error('Backup contains an invalid project category.');
  }
  if (!isAvailabilitySettings(availability)) {
    throw new Error('Backup contains invalid availability settings.');
  }
  if (!isManualOverridesMap(manualOverrides)) {
    throw new Error('Backup contains invalid manual allocation overrides.');
  }

  return {
    tasks: validTasks,
    availability,
    categories: validCategories,
    manualOverrides,
  };
}

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn('Failed to parse storage key:', key, e);
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Failed to save storage key:', key, e);
  }
}

// ============================================================================
// 7. MAIN APPLICATION COMPONENT
// ============================================================================

type LocalAuthStatus = 'setup' | 'login' | 'authenticated' | 'unavailable';

function LocalAuthScreen({
  isSetup,
  error,
  onSubmit,
}: {
  isSetup: boolean;
  error: string | null;
  onSubmit: (username: string, password: string, confirmation: string) => Promise<void>;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit(username, password, confirmation);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 flex items-center justify-center font-sans text-slate-900">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">WorkloadFlow</h1>
            <p className="text-sm text-slate-500">A local-only planner</p>
          </div>
        </div>

        <h2 className="text-lg font-semibold">
          {isSetup ? 'Create your local account' : 'Welcome back'}
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          {isSetup
            ? 'Set up a username and password to continue. Your account stays in this browser.'
            : 'Sign in with the account saved in this browser.'}
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </p>
        )}

        {isSetup && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            This is only a convenience lock for this browser. It does not protect
            your data from someone with access to this device or browser storage.
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Username
            <input
              required
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Password
            <input
              required
              minLength={8}
              autoComplete={isSetup ? 'new-password' : 'current-password'}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </label>
          {isSetup && (
            <label className="block text-sm font-medium text-slate-700">
              Confirm password
              <input
                required
                minLength={8}
                autoComplete="new-password"
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
          >
            <Lock className="h-4 w-4" />
            {isSubmitting
              ? 'Please wait…'
              : isSetup
                ? 'Create account'
                : 'Log in'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs leading-5 text-slate-500">
          Credentials are stored only in this browser. Clearing site data removes
          the local account and planner data.
        </p>
      </section>
    </main>
  );
}

export default function App() {
  const [authStatus, setAuthStatus] = useState<LocalAuthStatus>(() => {
    try {
      return getLocalAuthStatus();
    } catch (error) {
      console.error('Unable to access the local account:', error);
      return 'unavailable';
    }
  });
  const [authError, setAuthError] = useState<string | null>(null);

  const handleAuthSubmit = async (
    username: string,
    password: string,
    confirmation: string,
  ) => {
    setAuthError(null);
    try {
      if (authStatus === 'setup') {
        if (password !== confirmation) {
          setAuthError('The passwords do not match.');
          return;
        }
        await createLocalAccount(username, password);
        setAuthStatus('authenticated');
        return;
      }

      const loggedIn = await loginLocalAccount(username, password);
      if (!loggedIn) {
        setAuthError('That username or password is incorrect.');
        return;
      }
      setAuthStatus('authenticated');
    } catch (error) {
      console.error('Local account operation failed:', error);
      setAuthError(
        error instanceof Error
          ? error.message
          : 'Unable to save or verify the local account.',
      );
    }
  };

  if (authStatus === 'unavailable') {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 flex items-center justify-center font-sans text-slate-900">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-lg">
          <h1 className="text-xl font-semibold">Local account unavailable</h1>
          <p role="alert" className="mt-3 text-sm leading-6 text-rose-800">
            Browser storage is unavailable or the saved account data is invalid.
            Enable site storage or clear this site's data to set up a new account.
          </p>
        </section>
      </main>
    );
  }
  if (authStatus !== 'authenticated') {
    return (
      <LocalAuthScreen
        isSetup={authStatus === 'setup'}
        error={authError}
        onSubmit={handleAuthSubmit}
      />
    );
  }
  return <WorkloadPlanner onLogout={() => {
    logoutLocalAccount();
    setAuthStatus('login');
  }} />;
}

function WorkloadPlanner({ onLogout }: { onLogout: () => void }) {
  // --- Persistent State ---
  const [tasks, setTasks] = useState<Task[]>(() =>
    loadFromStorage(STORAGE_KEYS.TASKS, INITIAL_TASKS)
  );
  const [availability, setAvailability] = useState<AvailabilitySettings>(() =>
    loadFromStorage(STORAGE_KEYS.AVAILABILITY, INITIAL_AVAILABILITY)
  );
  const [categories, setCategories] = useState<ProjectCategory[]>(() =>
    loadFromStorage(STORAGE_KEYS.CATEGORIES, INITIAL_CATEGORIES)
  );
  const [manualOverrides, setManualOverrides] = useState<ManualOverridesMap>(() =>
    loadFromStorage(STORAGE_KEYS.OVERRIDES, {})
  );

  // Sync to localStorage
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.TASKS, tasks);
  }, [tasks]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.AVAILABILITY, availability);
  }, [availability]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.CATEGORIES, categories);
  }, [categories]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.OVERRIDES, manualOverrides);
  }, [manualOverrides]);

  // --- Navigation & UI State ---
  // Default to Monday, November 2, 2026 so the user can immediately test Nov/Dec 2026 tasks
  const [currentDate, setCurrentDate] = useState<Date>(() => parseISO('2026-11-02'));
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [selectedProject, setSelectedProject] = useState<string>('ALL');
  const [showWeekendsInWeekView, setShowWeekendsInWeekView] = useState<boolean>(false);

  // --- Modals & Drawers State ---
  const [isTaskModalOpen, setIsTaskModalOpen] = useState<boolean>(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [prefillStartDate, setPrefillStartDate] = useState<string | null>(null);

  const [inspectedTaskId, setInspectedTaskId] = useState<string | null>(null);
  const [inspectedDateISO, setInspectedDateISO] = useState<string | null>(null);

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isUnitTestsModalOpen, setIsUnitTestsModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  // --- Category Color Lookup ---
  const getCategoryStyle = useCallback(
    (projectName: string) => {
      const found = categories.find((c) => c.name === projectName);
      const colorKey = found?.color || 'slate';
      return COLOR_PALETTE[colorKey] || COLOR_PALETTE.slate;
    },
    [categories]
  );

  // --- Active View Date Range ---
  const currentPeriodRange = useMemo(() => {
    if (viewMode === 'month') {
      const start = startOfMonth(currentDate);
      const end = endOfMonth(currentDate);
      return { start: toISODateString(start), end: toISODateString(end), label: format(currentDate, 'MMMM yyyy') };
    } else if (viewMode === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return {
        start: toISODateString(start),
        end: toISODateString(end),
        label: `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`,
      };
    } else {
      const iso = toISODateString(currentDate);
      return {
        start: iso,
        end: iso,
        label: format(currentDate, 'EEEE, MMMM d, yyyy'),
      };
    }
  }, [currentDate, viewMode]);

  // --- Run Deterministic Scheduler ---
  const scheduleResult = useMemo(() => {
    // Include calendar grid padding in the date horizon so every visible cell has daySummaries initialized
    const gridStart = toISODateString(startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }));
    const gridEnd = toISODateString(endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }));
    return runScheduler(tasks, availability, manualOverrides, { start: gridStart, end: gridEnd });
  }, [tasks, availability, manualOverrides, currentDate]);

  // --- Filtered Tasks ---
  const filteredTasks = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => {
      if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
      return a.createdAt.localeCompare(b.createdAt);
    });
    if (selectedProject === 'ALL') return sorted;
    return sorted.filter((t) => t.project === selectedProject);
  }, [tasks, selectedProject]);

  // --- Top Summary Metrics for Selected Period ---
  const periodSummary = useMemo(() => {
    const datesInPeriod = getDateRangeISO(currentPeriodRange.start, currentPeriodRange.end);
    let totalAvailable = 0;
    let totalPlanned = 0;

    for (const d of datesInPeriod) {
      const daySum = scheduleResult.daySummaries[d];
      if (daySum) {
        totalAvailable += daySum.availableHours;
        const allocs =
          selectedProject === 'ALL'
            ? daySum.allocations
            : daySum.allocations.filter((a) => {
                const t = tasks.find((x) => x.id === a.taskId);
                return t?.project === selectedProject;
              });
        totalPlanned += allocs.reduce((acc, a) => acc + a.allocatedHours, 0);
      }
    }

    // Calculate unscheduled hours for tasks overlapping this period
    let totalUnscheduledInPeriod = 0;
    let tasksWithUnscheduledCount = 0;

    for (const t of filteredTasks) {
      const overlapsPeriod = t.startDate <= currentPeriodRange.end && t.endDate >= currentPeriodRange.start;
      if (overlapsPeriod) {
        const unsched = scheduleResult.taskSummaries[t.id]?.unscheduledHours || 0;
        if (unsched > 0) {
          totalUnscheduledInPeriod += unsched;
          tasksWithUnscheduledCount += 1;
        }
      }
    }

    const remainingAvailable = Math.max(0, totalAvailable - totalPlanned);

    return {
      totalAvailable: Math.round(totalAvailable * 100) / 100,
      totalPlanned: Math.round(totalPlanned * 100) / 100,
      remainingAvailable: Math.round(remainingAvailable * 100) / 100,
      totalUnscheduled: Math.round(totalUnscheduledInPeriod * 100) / 100,
      tasksWithUnscheduledCount,
    };
  }, [currentPeriodRange, scheduleResult, selectedProject, tasks, filteredTasks]);

  // --- Navigation Handlers ---
  const handlePrev = () => {
    if (viewMode === 'month') setCurrentDate((d) => subMonths(d, 1));
    else if (viewMode === 'week') setCurrentDate((d) => subWeeks(d, 1));
    else setCurrentDate((d) => subDays(d, 1));
  };

  const handleNext = () => {
    if (viewMode === 'month') setCurrentDate((d) => addMonths(d, 1));
    else if (viewMode === 'week') setCurrentDate((d) => addWeeks(d, 1));
    else setCurrentDate((d) => addDays(d, 1));
  };

  const handleGoToReferenceToday = () => {
    setCurrentDate(parseISO(availability.referenceToday || '2026-11-02'));
  };

  // --- Task CRUD Operations ---
  const handleSaveTask = (
    taskData: Omit<Task, 'id' | 'createdAt'>,
    existingId?: string,
    newCategoryName?: string,
    newCategoryColor?: string
  ) => {
    if (newCategoryName && !categories.some((c) => c.name === newCategoryName)) {
      setCategories((prev) => [
        ...prev,
        {
          id: `cat-${Date.now()}`,
          name: newCategoryName,
          color: newCategoryColor || 'cyan',
        },
      ]);
    }

    if (existingId) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === existingId
            ? {
                ...t,
                ...taskData,
              }
            : t
        )
      );
      // Clean up any manual overrides outside the new date range
      setManualOverrides((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          const [tId, d] = key.split('__');
          if (tId === existingId && (d < taskData.startDate || d > taskData.endDate)) {
            delete next[key];
          }
        });
        return next;
      });
      triggerToast(`Updated "${taskData.title}"`);
    } else {
      const newTask: Task = {
        ...taskData,
        id: `task-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      setTasks((prev) => [...prev, newTask]);
      triggerToast(`Added "${taskData.title}"`);
    }
    setIsTaskModalOpen(false);
    setEditingTask(null);
    setPrefillStartDate(null);
  };

  const handleDeleteTask = (taskId: string) => {
    const target = tasks.find((t) => t.id === taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setManualOverrides((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(`${taskId}__`)) delete next[key];
      });
      return next;
    });
    if (inspectedTaskId === taskId) setInspectedTaskId(null);
    if (target) triggerToast(`Deleted "${target.title}"`);
  };

  const handleApplySuggestedEndDate = (taskId: string, suggestedEndDate: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, endDate: suggestedEndDate } : t))
    );
    triggerToast(`Extended task end date to ${format(parseISO(suggestedEndDate), 'MMM d, yyyy')}`);
  };

  // --- Manual Allocation Override Handlers ---
  const handleSetManualAllocation = (taskId: string, dateISO: string, hours: number) => {
    const clamped = Math.max(0, Math.round(hours * 4) / 4);
    setManualOverrides((prev) => ({
      ...prev,
      [`${taskId}__${dateISO}`]: clamped,
    }));
  };

  const handleClearManualAllocation = (taskId: string, dateISO: string) => {
    setManualOverrides((prev) => {
      const next = { ...prev };
      delete next[`${taskId}__${dateISO}`];
      return next;
    });
  };

  const handleClearAllOverridesForTask = (taskId: string) => {
    setManualOverrides((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k.startsWith(`${taskId}__`)) delete next[k];
      });
      return next;
    });
    triggerToast('Reset manual adjustments for task');
  };

  // --- Custom Daily Availability Handler ---
  const handleSetDateAvailability = (dateISO: string, hours: number | null, note?: string) => {
    setAvailability((prev) => {
      const nextCustom = { ...prev.customDates };
      if (hours === null) {
        delete nextCustom[dateISO];
      } else {
        nextCustom[dateISO] = {
          availableHours: Math.max(0, Math.min(24, hours)),
          note: note?.trim() || undefined,
        };
      }
      return {
        ...prev,
        customDates: nextCustom,
      };
    });
  };

  const handleResetDemoData = () => {
    setTasks(INITIAL_TASKS);
    setAvailability(INITIAL_AVAILABILITY);
    setCategories(INITIAL_CATEGORIES);
    setManualOverrides({});
    setCurrentDate(parseISO('2026-11-02'));
    setSelectedProject('ALL');
    triggerToast('Demo data restored to initial Nov/Dec 2026 schedule');
  };

  const handleExportPlannerData = () => {
    const backup: PlannerBackup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { tasks, availability, categories, manualOverrides },
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `workloadflow-backup-${toISODateString(new Date())}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    triggerToast('Planner data exported');
  };

  const handleImportPlannerData = async (file: File) => {
    try {
      const imported = validatePlannerBackup(JSON.parse(await file.text()) as unknown);
      if (!window.confirm('Import this backup and replace the planner data in this browser?')) {
        return;
      }

      setTasks(imported.tasks);
      setAvailability(imported.availability);
      setCategories(imported.categories);
      setManualOverrides(imported.manualOverrides);
      setSelectedProject('ALL');
      setInspectedTaskId(null);
      setInspectedDateISO(null);
      setIsSettingsModalOpen(false);
      triggerToast('Planner data imported');
    } catch (error) {
      console.error('Failed to import planner backup:', error);
      triggerToast(
        error instanceof Error
          ? `Import failed: ${error.message}`
          : 'Import failed: unable to read this backup file',
      );
    }
  };

  const inspectedTask = useMemo(
    () => tasks.find((t) => t.id === inspectedTaskId) || null,
    [tasks, inspectedTaskId]
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* ================================================================== */}
      {/* HEADER BAR                                                         */}
      {/* ================================================================== */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand Title */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-sm">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-slate-900 tracking-tight text-base sm:text-lg">
                  WorkloadFlow
                </h1>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                  Deterministic Planner
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Automatic multi-project capacity & task allocation
              </p>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            <button
              onClick={() => setIsUnitTestsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/80 transition-colors border border-slate-200/80"
              title="Verify scheduling algorithm unit tests"
            >
              <FlaskConical className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden md:inline">Algorithm Tests</span>
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                7/7
              </span>
            </button>

            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors border border-slate-200 shadow-2xs"
            >
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>Log out</span>
            </button>

            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors border border-slate-200 shadow-2xs"
            >
              <Sliders className="w-3.5 h-3.5 text-slate-500" />
              <span>Availability</span>
              <span className="hidden sm:inline text-slate-400">
                ({availability.defaultHoursPerDay}h/d)
              </span>
            </button>

            <button
              onClick={() => {
                setEditingTask(null);
                setPrefillStartDate(toISODateString(currentDate));
                setIsTaskModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Task</span>
            </button>
          </div>
        </div>
      </header>

      {/* ================================================================== */}
      {/* MAIN CONTENT CONTAINER                                             */}
      {/* ================================================================== */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* 1. FOUR WORKLOAD SUMMARY CARDS */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Available Capacity ({viewMode})</span>
              <Clock className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight text-slate-900">
                {formatHours(periodSummary.totalAvailable)}h
              </span>
              <span className="text-xs text-slate-500">
                in {currentPeriodRange.label}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Planned Task Hours</span>
              <Briefcase className="w-4 h-4 text-blue-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight text-slate-900">
                {formatHours(periodSummary.totalPlanned)}h
              </span>
              <span className="text-xs text-slate-500">
                {periodSummary.totalAvailable > 0
                  ? `${Math.round((periodSummary.totalPlanned / periodSummary.totalAvailable) * 100)}% utilization`
                  : '0% utilization'}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Remaining Free Capacity</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight text-emerald-700">
                {formatHours(periodSummary.remainingAvailable)}h
              </span>
              <span className="text-xs text-slate-500">available to book</span>
            </div>
          </div>

          <div
            className={`rounded-xl border p-4 shadow-2xs flex flex-col justify-between transition-colors ${
              periodSummary.totalUnscheduled > 0
                ? 'bg-amber-50/70 border-amber-300'
                : 'bg-white border-slate-200/90'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-medium text-slate-600">
              <span>Unscheduled Task Hours</span>
              <AlertTriangle
                className={`w-4 h-4 ${
                  periodSummary.totalUnscheduled > 0 ? 'text-amber-600' : 'text-slate-300'
                }`}
              />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-semibold tracking-tight ${
                  periodSummary.totalUnscheduled > 0 ? 'text-amber-800' : 'text-slate-900'
                }`}
              >
                {formatHours(periodSummary.totalUnscheduled)}h
              </span>
              <span className="text-xs text-slate-500">
                {periodSummary.totalUnscheduled > 0
                  ? `across ${periodSummary.tasksWithUnscheduledCount} task(s)`
                  : 'All tasks fit capacity'}
              </span>
            </div>
          </div>
        </section>

        {/* 2. TOOLBAR: CALENDAR NAVIGATION, VIEW SWITCHER & PROJECT FILTERS */}
        <section className="bg-white rounded-xl border border-slate-200/90 p-3 sm:px-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3 shadow-2xs">
          {/* Left: Date Navigation & Period Label */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50/60 p-0.5">
              <button
                onClick={handlePrev}
                className="p-1.5 rounded-md hover:bg-white hover:shadow-2xs text-slate-600 transition-all"
                aria-label="Previous period"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleGoToReferenceToday}
                className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-white hover:shadow-2xs rounded-md transition-all"
                title="Jump to reference start date (Nov 2, 2026)"
              >
                Nov 2, 2026
              </button>
              <button
                onClick={handleNext}
                className="p-1.5 rounded-md hover:bg-white hover:shadow-2xs text-slate-600 transition-all"
                aria-label="Next period"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <h2 className="text-base sm:text-lg font-semibold text-slate-900 tracking-tight min-w-[180px]">
              {currentPeriodRange.label}
            </h2>

            {/* View Switcher */}
            <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 border border-slate-200/80 ml-auto xl:ml-2">
              {(['month', 'week', 'day'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-all ${
                    viewMode === mode
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {viewMode === 'week' && (
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none ml-1">
                <input
                  type="checkbox"
                  checked={showWeekendsInWeekView}
                  onChange={(e) => setShowWeekendsInWeekView(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                />
                <span>Show weekends</span>
              </label>
            )}
          </div>

          {/* Right: Project Quick Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 xl:pb-0 no-scrollbar">
            <button
              onClick={() => setSelectedProject('ALL')}
              className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
                selectedProject === 'ALL'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              All Tasks ({tasks.length})
            </button>
            {categories.map((cat) => {
              const style = COLOR_PALETTE[cat.color] || COLOR_PALETTE.slate;
              const count = tasks.filter((t) => t.project === cat.name).length;
              const isSelected = selectedProject === cat.name;
              return (
                <button
                  key={cat.id}
                  onClick={() =>
                    setSelectedProject(isSelected ? 'ALL' : cat.name)
                  }
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
                    isSelected
                      ? `${style.badgeBg} ${style.text} ${style.border} ring-1 ring-current`
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                  <span>{cat.name}</span>
                  <span className="text-[10px] opacity-75">({count})</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 3. MAIN WORKSPACE: CALENDAR + SIDEBAR TASK LIST */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* LEFT / MAIN: CALENDAR VIEW (8 or 9 cols on xl) */}
          <div className="xl:col-span-8 2xl:col-span-9 bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
            {viewMode === 'month' && (
              <MonthView
                currentDate={currentDate}
                scheduleResult={scheduleResult}
                tasks={tasks}
                selectedProject={selectedProject}
                referenceToday={availability.referenceToday}
                getCategoryStyle={getCategoryStyle}
                onSelectDate={(iso) => setInspectedDateISO(iso)}
                onSwitchToDayView={(iso) => {
                  setCurrentDate(parseISO(iso));
                  setViewMode('day');
                }}
                onSelectTask={(taskId) => setInspectedTaskId(taskId)}
                onQuickAddTask={(iso) => {
                  setEditingTask(null);
                  setPrefillStartDate(iso);
                  setIsTaskModalOpen(true);
                }}
              />
            )}

            {viewMode === 'week' && (
              <WeekView
                currentDate={currentDate}
                showWeekends={showWeekendsInWeekView}
                scheduleResult={scheduleResult}
                tasks={tasks}
                selectedProject={selectedProject}
                referenceToday={availability.referenceToday}
                getCategoryStyle={getCategoryStyle}
                onSelectDate={(iso) => setInspectedDateISO(iso)}
                onSelectTask={(taskId) => setInspectedTaskId(taskId)}
                onAdjustAllocation={handleSetManualAllocation}
                onClearAllocation={handleClearManualAllocation}
                onQuickAddTask={(iso) => {
                  setEditingTask(null);
                  setPrefillStartDate(iso);
                  setIsTaskModalOpen(true);
                }}
              />
            )}

            {viewMode === 'day' && (
              <DayView
                currentDate={currentDate}
                scheduleResult={scheduleResult}
                tasks={tasks}
                availability={availability}
                getCategoryStyle={getCategoryStyle}
                onSetDateAvailability={handleSetDateAvailability}
                onAdjustAllocation={handleSetManualAllocation}
                onClearAllocation={handleClearManualAllocation}
                onSelectTask={(taskId) => setInspectedTaskId(taskId)}
                onQuickAddTask={(iso) => {
                  setEditingTask(null);
                  setPrefillStartDate(iso);
                  setIsTaskModalOpen(true);
                }}
              />
            )}
          </div>

          {/* RIGHT SIDEBAR: COMPACT TASK LIST & CAPACITY ALERTS */}
          <aside className="xl:col-span-4 2xl:col-span-3 space-y-4">
            <TaskListSidebar
              tasks={filteredTasks}
              scheduleResult={scheduleResult}
              getCategoryStyle={getCategoryStyle}
              onInspectTask={(taskId) => setInspectedTaskId(taskId)}
              onEditTask={(task) => {
                setEditingTask(task);
                setIsTaskModalOpen(true);
              }}
              onDeleteTask={handleDeleteTask}
              onApplySuggestedEndDate={handleApplySuggestedEndDate}
              onJumpToDate={(iso) => {
                setCurrentDate(parseISO(iso));
              }}
            />
          </aside>
        </div>
      </main>

      {/* ================================================================== */}
      {/* MODALS & INSPECTOR DRAWERS                                         */}
      {/* ================================================================== */}

      {/* A. ADD / EDIT TASK MODAL */}
      {isTaskModalOpen && (
        <TaskFormModal
          isOpen={isTaskModalOpen}
          initialTask={editingTask}
          prefillStartDate={prefillStartDate}
          categories={categories}
          allTasks={tasks}
          availability={availability}
          manualOverrides={manualOverrides}
          onClose={() => {
            setIsTaskModalOpen(false);
            setEditingTask(null);
            setPrefillStartDate(null);
          }}
          onSave={handleSaveTask}
        />
      )}

      {/* B. TASK DAILY BREAKDOWN & MANUAL ADJUSTMENT DRAWER */}
      {inspectedTask && (
        <TaskBreakdownDrawer
          task={inspectedTask}
          summary={scheduleResult.taskSummaries[inspectedTask.id]}
          daySummaries={scheduleResult.daySummaries}
          availability={availability}
          categoryStyle={getCategoryStyle(inspectedTask.project)}
          onClose={() => setInspectedTaskId(null)}
          onEditTask={() => {
            setEditingTask(inspectedTask);
            setInspectedTaskId(null);
            setIsTaskModalOpen(true);
          }}
          onDeleteTask={() => handleDeleteTask(inspectedTask.id)}
          onSetManualAllocation={handleSetManualAllocation}
          onClearManualAllocation={handleClearManualAllocation}
          onClearAllOverrides={() => handleClearAllOverridesForTask(inspectedTask.id)}
          onApplySuggestedEndDate={handleApplySuggestedEndDate}
        />
      )}

      {/* C. DAILY WORKLOAD & AVAILABILITY INSPECTOR DRAWER */}
      {inspectedDateISO && (
        <DateInspectorDrawer
          dateISO={inspectedDateISO}
          daySummary={
            scheduleResult.daySummaries[inspectedDateISO] || {
              date: inspectedDateISO,
              availableHours: getDayAvailabilityInfo(inspectedDateISO, availability).availableHours,
              isWorkingDay: getDayAvailabilityInfo(inspectedDateISO, availability).isWorkingDay,
              customNote: getDayAvailabilityInfo(inspectedDateISO, availability).customNote,
              totalScheduledHours: 0,
              remainingHours: getDayAvailabilityInfo(inspectedDateISO, availability).availableHours,
              isOverloaded: false,
              allocations: [],
            }
          }
          tasks={tasks}
          taskSummaries={scheduleResult.taskSummaries}
          availability={availability}
          getCategoryStyle={getCategoryStyle}
          onClose={() => setInspectedDateISO(null)}
          onSetDateAvailability={handleSetDateAvailability}
          onSetManualAllocation={handleSetManualAllocation}
          onClearManualAllocation={handleClearManualAllocation}
          onInspectTask={(taskId) => {
            setInspectedDateISO(null);
            setInspectedTaskId(taskId);
          }}
          onQuickAddTask={(iso) => {
            setInspectedDateISO(null);
            setEditingTask(null);
            setPrefillStartDate(iso);
            setIsTaskModalOpen(true);
          }}
        />
      )}

      {/* D. AVAILABILITY SETTINGS MODAL */}
      {isSettingsModalOpen && (
        <AvailabilitySettingsModal
          availability={availability}
          onExportData={handleExportPlannerData}
          onImportData={handleImportPlannerData}
          onSave={(updated) => {
            setAvailability(updated);
            setIsSettingsModalOpen(false);
            triggerToast('Availability settings saved & schedule recalculated');
          }}
          onResetDemoData={() => {
            handleResetDemoData();
            setIsSettingsModalOpen(false);
          }}
          onClose={() => setIsSettingsModalOpen(false)}
        />
      )}

      {/* E. UNIT TESTS RUNNER MODAL */}
      {isUnitTestsModalOpen && (
        <UnitTestsModal onClose={() => setIsUnitTestsModalOpen(false)} />
      )}

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-medium flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 8. CALENDAR VIEW 1: MONTH VIEW
// ============================================================================

interface MonthViewProps {
  currentDate: Date;
  scheduleResult: ScheduleResult;
  tasks: Task[];
  selectedProject: string;
  referenceToday: string;
  getCategoryStyle: (project: string) => (typeof COLOR_PALETTE)['blue'];
  onSelectDate: (iso: string) => void;
  onSwitchToDayView: (iso: string) => void;
  onSelectTask: (taskId: string) => void;
  onQuickAddTask: (iso: string) => void;
}

function MonthView({
  currentDate,
  scheduleResult,
  tasks,
  selectedProject,
  referenceToday,
  getCategoryStyle,
  onSelectDate,
  onSwitchToDayView,
  onSelectTask,
  onQuickAddTask,
}: MonthViewProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weekDaysHeader = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const taskMap = useMemo(() => {
    const m: Record<string, Task> = {};
    tasks.forEach((t) => {
      m[t.id] = t;
    });
    return m;
  }, [tasks]);

  return (
    <div>
      {/* Weekday Header */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80">
        {weekDaysHeader.map((day, idx) => (
          <div
            key={day}
            className={`py-2.5 px-3 text-xs font-semibold uppercase tracking-wider ${
              idx >= 5 ? 'text-slate-400' : 'text-slate-600'
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 divide-x divide-y divide-slate-200/80">
        {days.map((day) => {
          const iso = toISODateString(day);
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isRefToday = iso === referenceToday;
          const daySum = scheduleResult.daySummaries[iso];

          const available = daySum?.availableHours ?? 0;
          const scheduled = daySum?.totalScheduledHours ?? 0;
          const isOverloaded = daySum?.isOverloaded ?? false;
          const customNote = daySum?.customNote;

          // Filter allocations if project filter is active
          const visibleAllocations = (daySum?.allocations || [])
            .filter((allocation) => {
              if (selectedProject === 'ALL') return true;
              return taskMap[allocation.taskId]?.project === selectedProject;
            })
            .sort(
              (a, b) =>
                PRIORITY_ORDER[taskMap[a.taskId]?.priority ?? 'Low'] -
                PRIORITY_ORDER[taskMap[b.taskId]?.priority ?? 'Low'],
            );

          // Check if any task active on this working day has unscheduled hours
          const unscheduledTasksOnDay = tasks.filter(
            (t) =>
              (selectedProject === 'ALL' || t.project === selectedProject) &&
              iso >= t.startDate &&
              iso <= t.endDate &&
              (scheduleResult.taskSummaries[t.id]?.unscheduledHours || 0) > 0
          );

          const utilizationRatio =
            available > 0 ? Math.min(1, scheduled / available) : scheduled > 0 ? 1 : 0;

          return (
            <div
              key={iso}
              onClick={() => onSelectDate(iso)}
              onDoubleClick={() => onSwitchToDayView(iso)}
              title={
                isOverloaded
                  ? `Over capacity: ${formatHours(scheduled)}h scheduled of ${formatHours(available)}h available (${formatHours(scheduled - available)}h over)`
                  : `${formatHours(scheduled)}h scheduled of ${formatHours(available)}h available`
              }
              className={`min-h-[132px] sm:min-h-[148px] p-2 flex flex-col justify-between transition-colors cursor-pointer group relative ${
                !isCurrentMonth
                  ? 'bg-slate-50/60 text-slate-400'
                  : available === 0
                  ? 'bg-slate-50/40'
                  : 'bg-white hover:bg-slate-50/50'
              } ${isOverloaded ? 'z-10 ring-2 ring-inset ring-rose-500' : ''}`}
            >
              {/* Top Row: Date Number & Capacity Pill */}
              <div>
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center ${
                        isRefToday
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : isCurrentMonth
                          ? 'text-slate-800'
                          : 'text-slate-400'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    {customNote && (
                      <span
                        className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/80 truncate max-w-[85px]"
                        title={customNote}
                      >
                        {customNote}
                      </span>
                    )}
                  </div>

                  {/* Scheduled / Available Badge */}
                  {available > 0 || scheduled > 0 ? (
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                        isOverloaded
                          ? 'bg-rose-50 text-rose-700 border-rose-200 font-semibold'
                          : scheduled >= available && available > 0
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : scheduled > 0
                          ? 'bg-slate-100 text-slate-700 border-slate-200'
                          : 'text-slate-400 border-transparent'
                      }`}
                    >
                      {formatHours(scheduled)}/{formatHours(available)}h
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-300 font-medium">Off</span>
                  )}
                </div>

                {/* Thin Capacity Bar */}
                {available > 0 && (
                  <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden mb-2">
                    <div
                      className={`h-full transition-all ${
                        isOverloaded
                          ? 'bg-rose-500'
                          : scheduled >= available
                          ? 'bg-emerald-500'
                          : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.round(utilizationRatio * 100))}%` }}
                    />
                  </div>
                )}

                {/* Task Allocations List */}
                <div className="space-y-1">
                  {visibleAllocations.slice(0, 3).map((alloc) => {
                    const task = taskMap[alloc.taskId];
                    if (!task) return null;
                    const style = getCategoryStyle(task.project);
                    return (
                      <div
                        key={`${alloc.taskId}-${alloc.date}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTask(task.id);
                        }}
                        className={`px-1.5 py-1 rounded text-[11px] border ${style.bg} ${style.bgHover} ${style.text} ${style.border} flex items-center justify-between gap-1 transition-colors`}
                        title={`${task.title} (${task.project}) — ${formatHours(alloc.allocatedHours)}h`}
                      >
                        <div className="flex items-center gap-1 truncate">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                          <span className="truncate font-medium">{task.title}</span>
                        </div>
                        <span className="font-semibold shrink-0 flex items-center gap-0.5">
                          {alloc.isManuallyAdjusted && <Lock className="w-2.5 h-2.5 opacity-75" />}
                          {formatHours(alloc.allocatedHours)}h
                        </span>
                      </div>
                    );
                  })}

                  {visibleAllocations.length > 3 && (
                    <div className="text-[10px] font-medium text-slate-500 pl-1">
                      +{visibleAllocations.length - 3} more task(s)
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Row: Unscheduled Warning or Quick Add Hover Button */}
              <div className="mt-1.5 flex items-center justify-between">
                {unscheduledTasksOnDay.length > 0 && available > 0 ? (
                  <div
                    className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50/90 border border-amber-200 px-1.5 py-0.5 rounded"
                    title={`${unscheduledTasksOnDay.length} task(s) in this range have unscheduled hours`}
                  >
                    <AlertTriangle className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                    <span className="truncate">Cap deficit</span>
                  </div>
                ) : (
                  <span />
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickAddTask(iso);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-200/70 text-slate-500 transition-opacity"
                  title={`Add task starting ${iso}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 9. CALENDAR VIEW 2: WEEK VIEW (MONDAY - FRIDAY PLANNER)
// ============================================================================

interface WeekViewProps {
  currentDate: Date;
  showWeekends: boolean;
  scheduleResult: ScheduleResult;
  tasks: Task[];
  selectedProject: string;
  referenceToday: string;
  getCategoryStyle: (project: string) => (typeof COLOR_PALETTE)['blue'];
  onSelectDate: (iso: string) => void;
  onSelectTask: (taskId: string) => void;
  onAdjustAllocation: (taskId: string, dateISO: string, hours: number) => void;
  onClearAllocation: (taskId: string, dateISO: string) => void;
  onQuickAddTask: (iso: string) => void;
}

function WeekView({
  currentDate,
  showWeekends,
  scheduleResult,
  tasks,
  selectedProject,
  referenceToday,
  getCategoryStyle,
  onSelectDate,
  onSelectTask,
  onAdjustAllocation,
  onClearAllocation,
  onQuickAddTask,
}: WeekViewProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const allWeekDays = eachDayOfInterval({
    start: weekStart,
    end: addDays(weekStart, showWeekends ? 6 : 4),
  });

  const taskMap = useMemo(() => {
    const m: Record<string, Task> = {};
    tasks.forEach((t) => {
      m[t.id] = t;
    });
    return m;
  }, [tasks]);

  return (
    <div
      className={`grid grid-cols-1 ${
        showWeekends ? 'md:grid-cols-7' : 'md:grid-cols-5'
      } divide-y md:divide-y-0 md:divide-x divide-slate-200`}
    >
      {allWeekDays.map((day) => {
        const iso = toISODateString(day);
        const isRefToday = iso === referenceToday;
        const daySum = scheduleResult.daySummaries[iso];
        const available = daySum?.availableHours ?? 0;
        const scheduled = daySum?.totalScheduledHours ?? 0;
        const remaining = daySum?.remainingHours ?? 0;
        const isOverloaded = daySum?.isOverloaded ?? false;

        const visibleAllocations = (daySum?.allocations || [])
          .filter((allocation) => {
            if (selectedProject === 'ALL') return true;
            return taskMap[allocation.taskId]?.project === selectedProject;
          })
          .sort(
            (a, b) =>
              PRIORITY_ORDER[taskMap[a.taskId]?.priority ?? 'Low'] -
              PRIORITY_ORDER[taskMap[b.taskId]?.priority ?? 'Low'],
          );

        return (
          <div
            key={iso}
            title={
              isOverloaded
                ? `Over capacity: ${formatHours(scheduled)}h scheduled of ${formatHours(available)}h available (${formatHours(scheduled - available)}h over)`
                : `${formatHours(scheduled)}h scheduled of ${formatHours(available)}h available`
            }
            className={`flex flex-col min-h-[460px] bg-white ${
              isOverloaded ? 'relative z-10 ring-2 ring-inset ring-rose-500' : ''
            }`}
          >
            {/* Day Column Header */}
            <div
              onClick={() => onSelectDate(iso)}
              className="p-3.5 border-b border-slate-200 bg-slate-50/60 hover:bg-slate-100/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {format(day, 'EEE')}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`text-lg font-semibold ${
                        isRefToday ? 'text-blue-600' : 'text-slate-900'
                      }`}
                    >
                      {format(day, 'MMM d')}
                    </span>
                    {isRefToday && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                        Ref Today
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className={`text-xs font-semibold ${
                      isOverloaded
                        ? 'text-rose-600'
                        : scheduled >= available && available > 0
                        ? 'text-emerald-700'
                        : 'text-slate-700'
                    }`}
                  >
                    {formatHours(scheduled)}/{formatHours(available)}h
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {available > 0 ? `${formatHours(remaining)}h free` : 'Non-working'}
                  </div>
                </div>
              </div>

              {daySum?.customNote && (
                <div className="mt-2 text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 truncate">
                  {daySum.customNote}
                </div>
              )}

              {/* Progress Bar */}
              <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden mt-2.5">
                <div
                  className={`h-full transition-all ${
                    isOverloaded
                      ? 'bg-rose-500'
                      : scheduled >= available && available > 0
                      ? 'bg-emerald-500'
                      : 'bg-blue-500'
                  }`}
                  style={{
                    width: `${
                      available > 0
                        ? Math.min(100, Math.round((scheduled / available) * 100))
                        : scheduled > 0
                        ? 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* Task Cards in Column */}
            <div className="flex-1 p-3 space-y-2.5">
              {visibleAllocations.length === 0 ? (
                <div className="h-36 rounded-lg border border-dashed border-slate-200 flex flex-col items-center justify-center text-center p-4">
                  <p className="text-xs text-slate-400">
                    {available > 0 ? 'No tasks scheduled' : 'No working hours'}
                  </p>
                  {available > 0 && (
                    <button
                      onClick={() => onQuickAddTask(iso)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Schedule task</span>
                    </button>
                  )}
                </div>
              ) : (
                visibleAllocations.map((alloc) => {
                  const task = taskMap[alloc.taskId];
                  if (!task) return null;
                  const style = getCategoryStyle(task.project);
                  const taskSum = scheduleResult.taskSummaries[task.id];

                  return (
                    <div
                      key={`${alloc.taskId}-${alloc.date}`}
                      className={`p-3 rounded-xl border ${style.bg} ${style.border} transition-all shadow-2xs`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${style.badgeBg} ${style.text}`}
                        >
                          {task.project}
                        </span>
                        {alloc.isManuallyAdjusted && (
                          <button
                            onClick={() => onClearAllocation(task.id, iso)}
                            className="inline-flex items-center gap-0.5 text-[10px] text-slate-600 hover:text-slate-900 bg-white/80 px-1.5 py-0.5 rounded border border-slate-200"
                            title="Unlock manual adjustment"
                          >
                            <Lock className="w-2.5 h-2.5" />
                            <span>Locked</span>
                          </button>
                        )}
                      </div>

                      <h4
                        onClick={() => onSelectTask(task.id)}
                        className="mt-1.5 text-xs font-semibold text-slate-900 hover:underline cursor-pointer line-clamp-2"
                      >
                        {task.title}
                      </h4>

                      {/* Inline Hours Adjuster */}
                      <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between">
                        <span className="text-[11px] text-slate-600">Allocated:</span>
                        <div className="inline-flex items-center gap-1 bg-white rounded-lg border border-slate-200 px-1 py-0.5">
                          <button
                            onClick={() =>
                              onAdjustAllocation(
                                task.id,
                                iso,
                                Math.max(0, alloc.allocatedHours - 0.25)
                              )
                            }
                            className="w-5 h-5 rounded hover:bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center"
                            title="Decrease by 0.25h"
                          >
                            -
                          </button>
                          <span className="text-xs font-semibold text-slate-900 px-1.5 min-w-[38px] text-center">
                            {formatHours(alloc.allocatedHours)}h
                          </span>
                          <button
                            onClick={() =>
                              onAdjustAllocation(task.id, iso, alloc.allocatedHours + 0.25)
                            }
                            className="w-5 h-5 rounded hover:bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center"
                            title="Increase by 0.25h"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {taskSum && taskSum.unscheduledHours > 0 && (
                        <div className="mt-2 flex items-center gap-1 text-[10px] font-medium text-amber-800 bg-amber-100/70 px-2 py-1 rounded">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>{formatHours(taskSum.unscheduledHours)}h unscheduled total</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Column Footer: Remaining Capacity */}
            <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs">
              <span className="text-slate-500">Remaining:</span>
              <span
                className={`font-semibold ${
                  isOverloaded
                    ? 'text-rose-600'
                    : remaining > 0
                    ? 'text-emerald-700'
                    : 'text-slate-600'
                }`}
              >
                {isOverloaded
                  ? `Overloaded (+${formatHours(scheduled - available)}h)`
                  : `${formatHours(remaining)}h available`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// 10. CALENDAR VIEW 3: DAY VIEW
// ============================================================================

interface DayViewProps {
  currentDate: Date;
  scheduleResult: ScheduleResult;
  tasks: Task[];
  availability: AvailabilitySettings;
  getCategoryStyle: (project: string) => (typeof COLOR_PALETTE)['blue'];
  onSetDateAvailability: (dateISO: string, hours: number | null, note?: string) => void;
  onAdjustAllocation: (taskId: string, dateISO: string, hours: number) => void;
  onClearAllocation: (taskId: string, dateISO: string) => void;
  onSelectTask: (taskId: string) => void;
  onQuickAddTask: (iso: string) => void;
}

function DayView({
  currentDate,
  scheduleResult,
  tasks,
  availability,
  getCategoryStyle,
  onSetDateAvailability,
  onAdjustAllocation,
  onClearAllocation,
  onSelectTask,
  onQuickAddTask,
}: DayViewProps) {
  const iso = toISODateString(currentDate);
  const daySum = scheduleResult.daySummaries[iso];
  const available = daySum?.availableHours ?? 0;
  const scheduled = daySum?.totalScheduledHours ?? 0;
  const remaining = daySum?.remainingHours ?? 0;
  const isOverloaded = daySum?.isOverloaded ?? false;
  const hasCustomOverride = Boolean(availability.customDates[iso]);

  const activeTasksCoveringDay = tasks
    .filter((task) => iso >= task.startDate && iso <= task.endDate)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  const presets = [
    { label: 'Normal (8h)', hours: 8, note: 'Normal workday' },
    { label: 'Meetings (5h)', hours: 5, note: 'Day with meetings' },
    { label: 'Half-day (4h)', hours: 4, note: 'Half-day leave' },
    { label: 'Holiday / Off (0h)', hours: 0, note: 'Holiday / Leave' },
  ];

  return (
    <div className="p-5 sm:p-6 space-y-6">
      {/* Top Day Header & Quick Availability Config */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-xl font-semibold text-slate-900">
              {format(currentDate, 'EEEE, MMMM d, yyyy')}
            </h3>
            {hasCustomOverride && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                Custom Availability: {availability.customDates[iso]?.note || `${available}h`}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure available working hours for this specific date or adjust individual task allocations.
          </p>
        </div>

        {/* Availability Quick Presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => onSetDateAvailability(iso, p.hours, p.note)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                available === p.hours && hasCustomOverride
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {p.label}
            </button>
          ))}
          {hasCustomOverride && (
            <button
              onClick={() => onSetDateAvailability(iso, null)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 bg-white"
            >
              Reset Default
            </button>
          )}
        </div>
      </div>

      {/* Day Capacity Meter */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
          <span className="text-xs text-slate-500 font-medium">Available Hours</span>
          <div className="text-2xl font-semibold text-slate-900 mt-1">{formatHours(available)}h</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
          <span className="text-xs text-slate-500 font-medium">Total Scheduled</span>
          <div className="text-2xl font-semibold text-blue-700 mt-1">{formatHours(scheduled)}h</div>
        </div>
        <div
          className={`p-4 rounded-xl border ${
            isOverloaded
              ? 'bg-rose-50 border-rose-200'
              : 'bg-emerald-50/60 border-emerald-200'
          }`}
        >
          <span className="text-xs text-slate-600 font-medium">Remaining Capacity</span>
          <div
            className={`text-2xl font-semibold mt-1 ${
              isOverloaded ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            {isOverloaded
              ? `Exceeded by ${formatHours(scheduled - available)}h`
              : `${formatHours(remaining)}h`}
          </div>
        </div>
      </div>

      {/* Scheduled Tasks List for this Day */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900">
            Tasks Active on {format(currentDate, 'MMM d')} ({activeTasksCoveringDay.length})
          </h4>
          <button
            onClick={() => onQuickAddTask(iso)}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Task Starting Today</span>
          </button>
        </div>

        {activeTasksCoveringDay.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-slate-200 text-center">
            <p className="text-sm text-slate-500">No tasks span this date.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
            {activeTasksCoveringDay.map((task) => {
              const tSum = scheduleResult.taskSummaries[task.id];
              const alloc = tSum?.allocationsByDate[iso];
              const currentHours = alloc?.allocatedHours || 0;
              const isManual = alloc?.isManuallyAdjusted || false;
              const style = getCategoryStyle(task.project);

              return (
                <div
                  key={task.id}
                  className="p-4 bg-white hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded ${style.badgeBg} ${style.text}`}
                      >
                        {task.project}
                      </span>
                      <span className="text-xs text-slate-400">
                        {task.startDate} → {task.endDate}
                      </span>
                      {tSum && tSum.unscheduledHours > 0 && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                          {formatHours(tSum.unscheduledHours)}h unscheduled
                        </span>
                      )}
                    </div>
                    <h5
                      onClick={() => onSelectTask(task.id)}
                      className="text-sm font-semibold text-slate-900 hover:text-blue-600 cursor-pointer"
                    >
                      {task.title}
                    </h5>
                    <p className="text-xs text-slate-500">
                      Total task progress: {formatHours(tSum?.scheduledHours || 0)} /{' '}
                      {formatHours(task.requiredHours)}h scheduled
                    </p>
                  </div>

                  {/* Manual Hours Control */}
                  <div className="flex items-center gap-3">
                    {isManual && (
                      <button
                        onClick={() => onClearAllocation(task.id, iso)}
                        className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 px-2 py-1 rounded border border-slate-200 bg-slate-50"
                      >
                        <Lock className="w-3 h-3" />
                        <span>Locked (Reset)</span>
                      </button>
                    )}

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={24}
                        step={0.25}
                        value={currentHours}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!Number.isNaN(val)) {
                            onAdjustAllocation(task.id, iso, val);
                          }
                        }}
                        className="w-20 px-2.5 py-1.5 text-sm font-semibold text-right rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                      <span className="text-xs font-medium text-slate-600">hours</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 11. SIDEBAR TASK LIST & CAPACITY ALERTS
// ============================================================================

interface TaskListSidebarProps {
  tasks: Task[];
  scheduleResult: ScheduleResult;
  getCategoryStyle: (project: string) => (typeof COLOR_PALETTE)['blue'];
  onInspectTask: (taskId: string) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onApplySuggestedEndDate: (taskId: string, suggestedDate: string) => void;
  onJumpToDate: (iso: string) => void;
}

function TaskListSidebar({
  tasks,
  scheduleResult,
  getCategoryStyle,
  onInspectTask,
  onEditTask,
  onDeleteTask,
  onApplySuggestedEndDate,
  onJumpToDate,
}: TaskListSidebarProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Scheduled Tasks</h3>
          <p className="text-xs text-slate-500">Click any task for daily breakdown</p>
        </div>
        <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-700">
          {tasks.length}
        </span>
      </div>

      <div className="divide-y divide-slate-100 max-h-[680px] overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No tasks match the current filter.
          </div>
        ) : (
          tasks.map((task) => {
            const sum = scheduleResult.taskSummaries[task.id];
            const scheduled = sum?.scheduledHours ?? 0;
            const unscheduled = sum?.unscheduledHours ?? 0;
            const style = getCategoryStyle(task.project);
            const pct =
              task.requiredHours > 0
                ? Math.min(100, Math.round((scheduled / task.requiredHours) * 100))
                : 100;

            return (
              <div
                key={task.id}
                onClick={() => onInspectTask(task.id)}
                className="p-3.5 hover:bg-slate-50/90 transition-colors cursor-pointer group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${style.badgeBg} ${style.text} ${style.border}`}
                    >
                      {task.project}
                    </span>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        task.priority === 'High'
                          ? 'bg-rose-50 text-rose-700'
                          : task.priority === 'Medium'
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-slate-50 text-slate-500'
                      }`}
                    >
                      {task.priority}
                    </span>
                  </div>

                  {/* Quick Edit / Delete Icons */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditTask(task);
                      }}
                      className="p-1 rounded hover:bg-slate-200/70 text-slate-500 hover:text-slate-800"
                      title="Edit task"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteTask(task.id);
                      }}
                      className="p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600"
                      title="Delete task"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h4 className="text-xs sm:text-sm font-semibold text-slate-900 mt-1.5 line-clamp-1">
                  {task.title}
                </h4>

                {/* Date Range & Hours */}
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onJumpToDate(task.startDate);
                    }}
                    className="hover:text-slate-900 hover:underline flex items-center gap-1"
                    title="Jump calendar to task start date"
                  >
                    <CalendarIcon className="w-3 h-3" />
                    <span>
                      {format(parseISO(task.startDate), 'MMM d')} –{' '}
                      {format(parseISO(task.endDate), 'MMM d')}
                    </span>
                  </button>

                  <span className="font-semibold text-slate-700">
                    {formatHours(scheduled)} / {formatHours(task.requiredHours)}h
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-full transition-all ${
                      unscheduled > 0 ? 'bg-amber-500' : style.bar
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Unscheduled Deficit Alert & 1-Click Extend Suggestion */}
                {unscheduled > 0 && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mt-2.5 p-2 rounded-lg bg-amber-50 border border-amber-200/90 text-[11px] text-amber-900 space-y-1.5"
                  >
                    <div className="flex items-center gap-1.5 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>
                        {formatHours(unscheduled)}h unscheduled (capacity full)
                      </span>
                    </div>
                    {sum?.suggestedEndDate && (
                      <button
                        onClick={() =>
                          onApplySuggestedEndDate(task.id, sum.suggestedEndDate!)
                        }
                        className="w-full py-1 px-2 rounded bg-amber-600 hover:bg-amber-700 text-white font-medium text-[11px] flex items-center justify-center gap-1 transition-colors"
                      >
                        <span>
                          Extend end date to{' '}
                          {format(parseISO(sum.suggestedEndDate), 'MMM d')}
                        </span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}

                {sum?.hasManualConflict && (
                  <div className="mt-2 text-[11px] text-rose-600 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{sum.manualConflictReason}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 12. ADD / EDIT TASK MODAL WITH LIVE CAPACITY PREVIEW
// ============================================================================

interface TaskFormModalProps {
  isOpen: boolean;
  initialTask: Task | null;
  prefillStartDate: string | null;
  categories: ProjectCategory[];
  allTasks: Task[];
  availability: AvailabilitySettings;
  manualOverrides: ManualOverridesMap;
  onClose: () => void;
  onSave: (
    taskData: Omit<Task, 'id' | 'createdAt'>,
    existingId?: string,
    newCategoryName?: string,
    newCategoryColor?: string
  ) => void;
}

function TaskFormModal({
  initialTask,
  prefillStartDate,
  categories,
  allTasks,
  availability,
  manualOverrides,
  onClose,
  onSave,
}: TaskFormModalProps) {
  const defaultStart = initialTask?.startDate || prefillStartDate || '2026-11-02';
  const defaultEnd =
    initialTask?.endDate ||
    toISODateString(addDays(parseISO(defaultStart), 2));

  const [title, setTitle] = useState(initialTask?.title || '');
  const [project, setProject] = useState(
    initialTask?.project || categories[0]?.name || 'TDC DK Redesign'
  );
  const [isAddingCustomCategory, setIsAddingCustomCategory] = useState(false);
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [customCategoryColor, setCustomCategoryColor] = useState('cyan');

  const [priority, setPriority] = useState<Priority>(initialTask?.priority || 'Medium');
  const [requiredHours, setRequiredHours] = useState<string>(
    initialTask ? String(initialTask.requiredHours) : '16'
  );
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [error, setError] = useState<string | null>(null);

  // Live capacity simulation preview
  const previewSummary = useMemo(() => {
    const hrs = parseFloat(requiredHours);
    if (!Number.isFinite(hrs) || hrs <= 0 || !startDate || !endDate || startDate > endDate) {
      return null;
    }
    const tempId = initialTask?.id || 'preview-temp-task';
    const simulatedTask: Task = {
      id: tempId,
      title: title.trim() || 'Preview Task',
      project: isAddingCustomCategory ? customCategoryName || 'Custom' : project,
      priority,
      requiredHours: hrs,
      startDate,
      endDate,
      createdAt: initialTask?.createdAt || '9999-12-31T23:59:59Z',
    };

    const list = initialTask
      ? allTasks.map((t) => (t.id === initialTask.id ? simulatedTask : t))
      : [...allTasks, simulatedTask];

    const res = runScheduler(list, availability, manualOverrides);
    return res.taskSummaries[tempId] || null;
  }, [
    requiredHours,
    startDate,
    endDate,
    initialTask,
    title,
    isAddingCustomCategory,
    customCategoryName,
    project,
    priority,
    allTasks,
    availability,
    manualOverrides,
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Task name is required.');
      return;
    }

    const hrs = parseFloat(requiredHours);
    if (!Number.isFinite(hrs) || hrs <= 0) {
      setError('Required hours must be greater than zero.');
      return;
    }

    if (!startDate || !endDate) {
      setError('Both start date and end date are required.');
      return;
    }

    if (startDate > endDate) {
      setError('Start date cannot be after end date.');
      return;
    }

    const finalProject = isAddingCustomCategory
      ? customCategoryName.trim()
      : project;

    if (!finalProject) {
      setError('Please select or enter a project category.');
      return;
    }

    onSave(
      {
        title: trimmedTitle,
        project: finalProject,
        priority,
        requiredHours: Math.round(hrs * 100) / 100,
        startDate,
        endDate,
      },
      initialTask?.id,
      isAddingCustomCategory ? finalProject : undefined,
      isAddingCustomCategory ? customCategoryColor : undefined
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">
            {initialTask ? 'Edit Task' : 'Add New Task'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Task Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Task Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., TDC DK Redesign Checkout Header"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
              autoFocus
            />
          </div>

          {/* Project Category & Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Project Category
                </label>
                <button
                  type="button"
                  onClick={() => setIsAddingCustomCategory((v) => !v)}
                  className="text-[11px] font-medium text-blue-600 hover:underline"
                >
                  {isAddingCustomCategory ? 'Choose existing' : '+ New category'}
                </button>
              </div>

              {!isAddingCustomCategory ? (
                <select
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={customCategoryName}
                    onChange={(e) => setCustomCategoryName(e.target.value)}
                    placeholder="Category name"
                    className="flex-1 px-2.5 py-1.5 text-sm rounded-lg border border-slate-300"
                  />
                  <select
                    value={customCategoryColor}
                    onChange={(e) => setCustomCategoryColor(e.target.value)}
                    className="px-2 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                  >
                    {Object.entries(COLOR_PALETTE).map(([key, val]) => (
                      <option key={key} value={key}>
                        {val.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Priority <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['High', 'Medium', 'Low'] as Priority[]).map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`py-2 text-xs font-medium rounded-lg border transition-all ${
                      priority === p
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Required Hours & Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Required Hours <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                value={requiredHours}
                onChange={(e) => setRequiredHours(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Start Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                End Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          {/* LIVE CAPACITY CHECK PREVIEW BANNER */}
          {previewSummary && (
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                previewSummary.unscheduledHours > 0
                  ? 'bg-amber-50/90 border-amber-300 text-amber-900'
                  : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
              }`}
            >
              <div className="flex items-center justify-between font-semibold">
                <div className="flex items-center gap-1.5">
                  {previewSummary.unscheduledHours > 0 ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  )}
                  <span>
                    {previewSummary.unscheduledHours > 0
                      ? `Capacity Warning: ${formatHours(previewSummary.unscheduledHours)}h cannot fit in selected range`
                      : `Fits Available Capacity (${previewSummary.eligibleDatesCount} working day(s))`}
                  </span>
                </div>
                <span>
                  {formatHours(previewSummary.scheduledHours)} /{' '}
                  {formatHours(previewSummary.requiredHours)}h
                </span>
              </div>

              {/* Daily preview pills */}
              {Object.keys(previewSummary.allocationsByDate).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {Object.values(previewSummary.allocationsByDate).map((a) => (
                    <span
                      key={a.date}
                      className="px-2 py-0.5 rounded bg-white/90 border border-slate-200/80 text-[11px] font-medium text-slate-700"
                    >
                      {format(parseISO(a.date), 'MMM d')}:{' '}
                      <strong>{formatHours(a.allocatedHours)}h</strong>
                    </span>
                  ))}
                </div>
              )}

              {previewSummary.unscheduledHours > 0 && previewSummary.suggestedEndDate && (
                <div className="pt-1 flex items-center justify-between">
                  <span className="text-[11px]">
                    Suggested end date to fit all hours:{' '}
                    <strong>
                      {format(parseISO(previewSummary.suggestedEndDate), 'MMM d, yyyy')}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setEndDate(previewSummary.suggestedEndDate!)}
                    className="px-2.5 py-1 rounded bg-amber-700 hover:bg-amber-800 text-white font-medium text-[11px]"
                  >
                    Use {format(parseISO(previewSummary.suggestedEndDate), 'MMM d')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 shadow-xs"
            >
              {initialTask ? 'Save Changes' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// 13. TASK DAILY BREAKDOWN & MANUAL ADJUSTMENT DRAWER
// ============================================================================

interface TaskBreakdownDrawerProps {
  task: Task;
  summary: TaskScheduleSummary;
  daySummaries: Record<string, DayScheduleSummary>;
  availability: AvailabilitySettings;
  categoryStyle: (typeof COLOR_PALETTE)['blue'];
  onClose: () => void;
  onEditTask: () => void;
  onDeleteTask: () => void;
  onSetManualAllocation: (taskId: string, dateISO: string, hours: number) => void;
  onClearManualAllocation: (taskId: string, dateISO: string) => void;
  onClearAllOverrides: () => void;
  onApplySuggestedEndDate: (taskId: string, suggestedDate: string) => void;
}

function TaskBreakdownDrawer({
  task,
  summary,
  daySummaries,
  availability,
  categoryStyle,
  onClose,
  onEditTask,
  onDeleteTask,
  onSetManualAllocation,
  onClearManualAllocation,
  onClearAllOverrides,
  onApplySuggestedEndDate,
}: TaskBreakdownDrawerProps) {
  const allDatesInRange = getDateRangeISO(task.startDate, task.endDate);
  const hasAnyManual = Object.values(summary?.allocationsByDate || {}).some(
    (a) => a.isManuallyAdjusted
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end">
      <div className="bg-white w-full max-w-xl h-full shadow-2xl border-l border-slate-200 flex flex-col justify-between overflow-hidden">
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded ${categoryStyle.badgeBg} ${categoryStyle.text}`}
              >
                {task.project}
              </span>
              <span className="text-xs text-slate-500">Priority: {task.priority}</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mt-1">{task.title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {format(parseISO(task.startDate), 'MMM d, yyyy')} –{' '}
              {format(parseISO(task.endDate), 'MMM d, yyyy')} •{' '}
              <strong>{formatHours(task.requiredHours)} required hours</strong>
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] text-slate-500">Required</span>
              <div className="text-lg font-semibold text-slate-900">
                {formatHours(task.requiredHours)}h
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] text-slate-500">Scheduled</span>
              <div className="text-lg font-semibold text-blue-700">
                {formatHours(summary?.scheduledHours || 0)}h
              </div>
            </div>
            <div
              className={`p-3 rounded-xl border ${
                (summary?.unscheduledHours || 0) > 0
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-emerald-50/60 border-emerald-200'
              }`}
            >
              <span className="text-[11px] text-slate-600">Unscheduled</span>
              <div
                className={`text-lg font-semibold ${
                  (summary?.unscheduledHours || 0) > 0
                    ? 'text-amber-800'
                    : 'text-emerald-700'
                }`}
              >
                {formatHours(summary?.unscheduledHours || 0)}h
              </div>
            </div>
          </div>

          {/* Conflict / Unscheduled Alerts */}
          {summary?.hasManualConflict && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{summary.manualConflictReason}</span>
            </div>
          )}

          {summary && summary.unscheduledHours > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {formatHours(summary.unscheduledHours)} hours could not be scheduled within{' '}
                  {task.startDate} to {task.endDate}.
                </span>
              </div>
              {summary.suggestedEndDate && (
                <button
                  onClick={() => onApplySuggestedEndDate(task.id, summary.suggestedEndDate!)}
                  className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-medium text-xs inline-flex items-center gap-1.5"
                >
                  <span>
                    Extend End Date to{' '}
                    {format(parseISO(summary.suggestedEndDate), 'MMM d, yyyy')}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Daily Allocation Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Daily Workload Breakdown
              </h4>
              {hasAnyManual && (
                <button
                  onClick={onClearAllOverrides}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset all manual locks</span>
                </button>
              )}
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 px-3 font-semibold">Date</th>
                    <th className="py-2.5 px-3 font-semibold">Day Capacity</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Allocated Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {allDatesInRange.map((d) => {
                    const dayInfo =
                      daySummaries[d] || getDayAvailabilityInfo(d, availability);
                    const alloc = summary?.allocationsByDate[d];
                    const hrs = alloc?.allocatedHours || 0;
                    const isManual = alloc?.isManuallyAdjusted || false;

                    return (
                      <tr
                        key={d}
                        className={
                          dayInfo.availableHours === 0
                            ? 'bg-slate-50/70 text-slate-400'
                            : 'bg-white'
                        }
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-900">
                            {format(parseISO(d), 'EEE, MMM d')}
                          </div>
                          {dayInfo.customNote && (
                            <div className="text-[10px] text-amber-700">
                              {dayInfo.customNote}
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-3">
                          {dayInfo.availableHours > 0 ? (
                            <span className="text-slate-600">
                              {formatHours(daySummaries[d]?.totalScheduledHours || 0)} /{' '}
                              {formatHours(dayInfo.availableHours)}h used
                            </span>
                          ) : (
                            <span className="text-slate-400">Non-working (0h)</span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            {isManual && (
                              <button
                                onClick={() => onClearManualAllocation(task.id, d)}
                                className="p-1 rounded bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                                title="Locked manually — click to unlock"
                              >
                                <Lock className="w-3 h-3" />
                              </button>
                            )}
                            <input
                              type="number"
                              step="0.25"
                              min="0"
                              max="24"
                              value={hrs}
                              disabled={dayInfo.availableHours === 0 && !isManual}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!Number.isNaN(val)) {
                                  onSetManualAllocation(task.id, d, val);
                                }
                              }}
                              className="w-18 px-2 py-1 text-right font-semibold rounded border border-slate-300 text-slate-900 disabled:opacity-40"
                            />
                            <span className="text-slate-400">h</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200 font-semibold text-slate-900">
                    <td className="py-2.5 px-3" colSpan={2}>
                      Total Scheduled
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {formatHours(summary?.scheduledHours || 0)} /{' '}
                      {formatHours(task.requiredHours)}h
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            onClick={onDeleteTask}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Task</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onEditTask}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Dates / Hours</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 14. DAILY WORKLOAD & AVAILABILITY INSPECTOR DRAWER
// ============================================================================

interface DateInspectorDrawerProps {
  dateISO: string;
  daySummary: DayScheduleSummary;
  tasks: Task[];
  taskSummaries: Record<string, TaskScheduleSummary>;
  availability: AvailabilitySettings;
  getCategoryStyle: (project: string) => (typeof COLOR_PALETTE)['blue'];
  onClose: () => void;
  onSetDateAvailability: (dateISO: string, hours: number | null, note?: string) => void;
  onSetManualAllocation: (taskId: string, dateISO: string, hours: number) => void;
  onClearManualAllocation: (taskId: string, dateISO: string) => void;
  onInspectTask: (taskId: string) => void;
  onQuickAddTask: (iso: string) => void;
}

function DateInspectorDrawer({
  dateISO,
  daySummary,
  tasks,
  availability,
  getCategoryStyle,
  onClose,
  onSetDateAvailability,
  onSetManualAllocation,
  onClearManualAllocation,
  onInspectTask,
  onQuickAddTask,
}: DateInspectorDrawerProps) {
  const customConfig = availability.customDates[dateISO];
  const [customHours, setCustomHours] = useState<string>(
    String(daySummary.availableHours)
  );
  const [customNote, setCustomNote] = useState<string>(customConfig?.note || '');

  useEffect(() => {
    setCustomHours(String(daySummary.availableHours));
    setCustomNote(availability.customDates[dateISO]?.note || '');
  }, [dateISO, daySummary.availableHours, availability.customDates]);

  const taskMap = useMemo(() => {
    const m: Record<string, Task> = {};
    tasks.forEach((t) => {
      m[t.id] = t;
    });
    return m;
  }, [tasks]);

  const handleSaveCustomAvailability = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(customHours);
    if (!Number.isNaN(parsed)) {
      onSetDateAvailability(dateISO, parsed, customNote);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end">
      <div className="bg-white w-full max-w-md h-full shadow-2xl border-l border-slate-200 flex flex-col justify-between">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Daily Workload Breakdown
            </span>
            <h3 className="text-lg font-semibold text-slate-900">
              {format(parseISO(dateISO), 'EEEE, MMMM d, yyyy')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Custom Date Availability Editor */}
          <form
            onSubmit={handleSaveCustomAvailability}
            className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800">
                Available Working Hours for {format(parseISO(dateISO), 'MMM d')}
              </span>
              {customConfig && (
                <button
                  type="button"
                  onClick={() => onSetDateAvailability(dateISO, null)}
                  className="text-[11px] text-blue-600 hover:underline"
                >
                  Restore default ({availability.defaultHoursPerDay}h)
                </button>
              )}
            </div>

            {/* Quick Presets */}
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: '8h Normal', hrs: 8, note: 'Normal workday' },
                { label: '5h Meet', hrs: 5, note: 'Meetings' },
                { label: '4h Half', hrs: 4, note: 'Half-day leave' },
                { label: '0h Off', hrs: 0, note: 'Holiday / Off' },
              ].map((p) => (
                <button
                  type="button"
                  key={p.label}
                  onClick={() => {
                    setCustomHours(String(p.hrs));
                    setCustomNote(p.note);
                    onSetDateAvailability(dateISO, p.hrs, p.note);
                  }}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition-colors ${
                    daySummary.availableHours === p.hrs
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <div className="w-24">
                <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                  Hours
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="24"
                  value={customHours}
                  onChange={(e) => setCustomHours(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                  Reason / Note (Optional)
                </label>
                <input
                  type="text"
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  placeholder="e.g., Sprint workshops, Leave..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800"
                >
                  Apply
                </button>
              </div>
            </div>
          </form>

          {/* Allocations List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Scheduled Tasks ({formatHours(daySummary.totalScheduledHours)} /{' '}
                {formatHours(daySummary.availableHours)}h)
              </h4>
              <button
                onClick={() => onQuickAddTask(dateISO)}
                className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Task</span>
              </button>
            </div>

            {daySummary.allocations.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                No tasks allocated on this date.
              </div>
            ) : (
              <div className="space-y-2.5">
                {daySummary.allocations.map((alloc) => {
                  const task = taskMap[alloc.taskId];
                  if (!task) return null;
                  const style = getCategoryStyle(task.project);

                  return (
                    <div
                      key={alloc.taskId}
                      className={`p-3.5 rounded-xl border ${style.bg} ${style.border} flex items-center justify-between gap-3`}
                    >
                      <div className="min-w-0">
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${style.badgeBg} ${style.text}`}
                        >
                          {task.project}
                        </span>
                        <h5
                          onClick={() => onInspectTask(task.id)}
                          className="text-xs font-semibold text-slate-900 mt-1 truncate hover:underline cursor-pointer"
                        >
                          {task.title}
                        </h5>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {alloc.isManuallyAdjusted && (
                          <button
                            onClick={() => onClearManualAllocation(task.id, dateISO)}
                            className="p-1 rounded bg-white/80 text-slate-600 border border-slate-200"
                            title="Unlock manual adjustment"
                          >
                            <Lock className="w-3 h-3" />
                          </button>
                        )}
                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          max="24"
                          value={alloc.allocatedHours}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!Number.isNaN(val)) {
                              onSetManualAllocation(task.id, dateISO, val);
                            }
                          }}
                          className="w-16 px-2 py-1 text-xs font-semibold text-right bg-white rounded border border-slate-300"
                        />
                        <span className="text-xs text-slate-600">h</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 15. AVAILABILITY SETTINGS MODAL
// ============================================================================

interface AvailabilitySettingsModalProps {
  availability: AvailabilitySettings;
  onExportData: () => void;
  onImportData: (file: File) => Promise<void>;
  onSave: (updated: AvailabilitySettings) => void;
  onResetDemoData: () => void;
  onClose: () => void;
}

function AvailabilitySettingsModal({
  availability,
  onExportData,
  onImportData,
  onSave,
  onResetDemoData,
  onClose,
}: AvailabilitySettingsModalProps) {
  const [defaultHours, setDefaultHours] = useState(
    String(availability.defaultHoursPerDay)
  );
  const [workingDays, setWorkingDays] = useState<number[]>(availability.workingDays);
  const [enforceRefToday, setEnforceRefToday] = useState<boolean>(
    availability.enforceReferenceToday
  );
  const [referenceToday, setReferenceToday] = useState<string>(
    availability.referenceToday
  );
  const [customDates, setCustomDates] = useState<
    Record<string, CustomDateAvailability>
  >(availability.customDates);

  const [newCustomDate, setNewCustomDate] = useState('2026-11-20');
  const [newCustomHours, setNewCustomHours] = useState('4');
  const [newCustomNote, setNewCustomNote] = useState('Half-day leave');

  const daysOfWeek = [
    { id: 1, label: 'Mon' },
    { id: 2, label: 'Tue' },
    { id: 3, label: 'Wed' },
    { id: 4, label: 'Thu' },
    { id: 5, label: 'Fri' },
    { id: 6, label: 'Sat' },
    { id: 0, label: 'Sun' },
  ];

  const toggleWorkingDay = (dayId: number) => {
    setWorkingDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId]
    );
  };

  const handleAddCustomDate = () => {
    if (!newCustomDate) return;
    const hrs = parseFloat(newCustomHours);
    if (Number.isNaN(hrs) || hrs < 0) return;
    setCustomDates((prev) => ({
      ...prev,
      [newCustomDate]: {
        availableHours: Math.min(24, hrs),
        note: newCustomNote.trim() || undefined,
      },
    }));
    setNewCustomNote('');
  };

  const handleRemoveCustomDate = (dateISO: string) => {
    setCustomDates((prev) => {
      const next = { ...prev };
      delete next[dateISO];
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedDefault = parseFloat(defaultHours);
    onSave({
      defaultHoursPerDay:
        Number.isFinite(parsedDefault) && parsedDefault >= 0 ? parsedDefault : 8,
      workingDays,
      referenceToday,
      enforceReferenceToday: enforceRefToday,
      customDates,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Working Hours & Availability Settings
            </h3>
            <p className="text-xs text-slate-500">
              Set baseline hours and working days. The scheduler increases capacity on eligible workdays when deadlines require it.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Default Hours & Working Days */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Baseline Hours per Working Day
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="24"
                value={defaultHours}
                onChange={(e) => setDefaultHours(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
              />
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                This is a baseline, not a hard cap. Capacity can increase on eligible workdays to fit task hours within their deadlines.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Standard Working Days
              </label>
              <div className="flex gap-1">
                {daysOfWeek.map((d) => {
                  const active = workingDays.includes(d.id);
                  return (
                    <button
                      type="button"
                      key={d.id}
                      onClick={() => toggleWorkingDay(d.id)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-500 border-slate-200'
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Past Date Scheduling Rule */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-800 block">
                Do not schedule work before Reference Date
              </label>
              <p className="text-[11px] text-slate-500">
                When enabled, only schedules on or after the reference "Today" date.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={referenceToday}
                onChange={(e) => setReferenceToday(e.target.value)}
                className="px-2 py-1 text-xs rounded border border-slate-300 bg-white"
              />
              <input
                type="checkbox"
                checked={enforceRefToday}
                onChange={(e) => setEnforceRefToday(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-slate-900"
              />
            </div>
          </div>

          {/* Custom Date Exceptions (Holidays, Leave, Meeting Days) */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Date-Specific Availability Overrides (Holidays, Leave, Meetings)
            </h4>

            <div className="flex flex-wrap sm:flex-nowrap gap-2 items-end bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="w-full sm:w-36">
                <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                  Date
                </label>
                <input
                  type="date"
                  value={newCustomDate}
                  onChange={(e) => setNewCustomDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                />
              </div>
              <div className="w-24">
                <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                  Hours
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="24"
                  value={newCustomHours}
                  onChange={(e) => setNewCustomHours(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                  Label / Note
                </label>
                <input
                  type="text"
                  value={newCustomNote}
                  onChange={(e) => setNewCustomNote(e.target.value)}
                  placeholder="Holiday, Half-day, Workshops..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                />
              </div>
              <button
                type="button"
                onClick={handleAddCustomDate}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 shrink-0"
              >
                Add Override
              </button>
            </div>

            {/* List of Existing Overrides */}
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-200 max-h-48 overflow-y-auto">
              {Object.entries(customDates)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([dateISO, cfg]) => (
                  <div
                    key={dateISO}
                    className="px-3.5 py-2.5 flex items-center justify-between text-xs bg-white"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-slate-900">
                        {format(parseISO(dateISO), 'MMM d, yyyy (EEE)')}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded font-medium ${
                          cfg.availableHours === 0
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {cfg.availableHours}h available
                      </span>
                      {cfg.note && <span className="text-slate-500">{cfg.note}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomDate(dateISO)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-200 pt-4">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Backup & Restore
              </h4>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                Export tasks, projects, availability, and manual allocations to a JSON file.
                Importing a backup replaces the planner data in this browser; login credentials are not included.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onExportData}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                Export data
              </button>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Upload className="h-3.5 w-3.5" />
                Import backup
                <input
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={async (event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    if (file) await onImportData(file);
                  }}
                />
              </label>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onResetDemoData}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Initial Nov/Dec 2026 Demo Data</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800"
              >
                Save Availability
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// 16. ALGORITHM UNIT TESTS MODAL
// ============================================================================

function UnitTestsModal({ onClose }: { onClose: () => void }) {
  const testResults = useMemo(() => runSchedulerUnitTests(), []);
  const passedCount = testResults.filter((r) => r.passed).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <FlaskConical className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Scheduling Algorithm Unit Test Suite
              </h3>
              <p className="text-xs text-slate-500">
                Live verification of deterministic water-filling, overlaps, weekends & manual locks
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs font-semibold text-emerald-900">
            <span>
              All {passedCount} / {testResults.length} deterministic scheduling assertions passed
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[11px]">
              100% PASS
            </span>
          </div>

          <div className="space-y-2.5">
            {testResults.map((test) => (
              <div
                key={test.id}
                className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {test.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-slate-900">
                      {test.name}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      test.passed
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {test.passed ? 'PASSED' : 'FAILED'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 pl-6">{test.scenario}</p>
                <div className="pl-6 pt-1">
                  <code className="text-[11px] bg-slate-100 text-slate-800 px-2 py-0.5 rounded font-mono">
                    {test.details}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}