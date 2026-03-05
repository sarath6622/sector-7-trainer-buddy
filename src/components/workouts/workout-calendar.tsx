'use client';

import { useState, useMemo } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  format,
  addMonths,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WorkoutStatus } from '@/generated/prisma/enums';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CalendarWorkout = {
  id: string;
  title: string | null;
  date: Date;
  status: WorkoutStatus;
  clientName?: string | null;
  clientProfileId?: string | null;
};

interface WorkoutCalendarProps {
  workouts: CalendarWorkout[];
  isLoading?: boolean;
  onMonthChange?: (start: string, end: string) => void;
  onWorkoutClick?: (workout: CalendarWorkout) => void;
  /** Show client names on chips (trainer view). Defaults to false. */
  showClientName?: boolean;
}

// ── Status colour map ─────────────────────────────────────────────────────────

const STATUS_DOT: Record<WorkoutStatus, string> = {
  ASSIGNED: 'bg-blue-500',
  IN_PROGRESS: 'bg-yellow-500',
  COMPLETED: 'bg-green-500',
  SKIPPED: 'bg-gray-400',
};

const STATUS_CHIP: Record<WorkoutStatus, string> = {
  ASSIGNED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  SKIPPED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

// ── Day cell ──────────────────────────────────────────────────────────────────

function DayCell({
  day,
  currentMonth,
  workouts,
  showClientName,
  onWorkoutClick,
}: {
  day: Date;
  currentMonth: Date;
  workouts: CalendarWorkout[];
  showClientName: boolean;
  onWorkoutClick?: (w: CalendarWorkout) => void;
}) {
  const isCurrentMonth = isSameMonth(day, currentMonth);
  const isTodayDate = isToday(day);
  const visible = workouts.slice(0, 3);
  const overflow = workouts.length - visible.length;

  return (
    <div
      className={cn(
        'min-h-[90px] border-b border-r p-1 flex flex-col gap-0.5',
        !isCurrentMonth && 'opacity-40 bg-muted/30',
      )}
    >
      {/* Day number */}
      <span
        className={cn(
          'text-xs font-medium self-start leading-none mb-0.5 h-5 w-5 flex items-center justify-center rounded-full',
          isTodayDate && 'bg-primary text-primary-foreground',
          !isTodayDate && !isCurrentMonth && 'text-muted-foreground',
        )}
      >
        {format(day, 'd')}
      </span>

      {/* Workout chips */}
      {visible.map((w) => (
        <button
          key={w.id}
          onClick={() => onWorkoutClick?.(w)}
          className={cn(
            'w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight truncate',
            STATUS_CHIP[w.status],
            onWorkoutClick && 'hover:opacity-80 cursor-pointer',
          )}
          title={w.title ?? 'Workout'}
        >
          <span className={cn('inline-block h-1.5 w-1.5 rounded-full mr-1 align-middle', STATUS_DOT[w.status])} />
          {showClientName && w.clientName
            ? `${w.clientName}${w.title ? ` – ${w.title}` : ''}`
            : (w.title ?? 'Workout')}
        </button>
      ))}

      {overflow > 0 && (
        <span className="text-[10px] text-muted-foreground pl-1">+{overflow} more</span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function WorkoutCalendar({
  workouts,
  isLoading = false,
  onMonthChange,
  onWorkoutClick,
  showClientName = false,
}: WorkoutCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    return eachDayOfInterval({
      start: startOfWeek(monthStart, { weekStartsOn: 1 }),
      end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
    });
  }, [currentMonth]);

  // Group workouts by ISO date string for O(1) lookup
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarWorkout[]>();
    for (const w of workouts) {
      const key = format(new Date(w.date), 'yyyy-MM-dd');
      const arr = map.get(key) ?? [];
      arr.push(w);
      map.set(key, arr);
    }
    return map;
  }, [workouts]);

  const handlePrev = () => {
    const next = subMonths(currentMonth, 1);
    setCurrentMonth(next);
    onMonthChange?.(
      format(startOfMonth(next), 'yyyy-MM-dd'),
      format(endOfMonth(next), 'yyyy-MM-dd'),
    );
  };

  const handleNext = () => {
    const next = addMonths(currentMonth, 1);
    setCurrentMonth(next);
    onMonthChange?.(
      format(startOfMonth(next), 'yyyy-MM-dd'),
      format(endOfMonth(next), 'yyyy-MM-dd'),
    );
  };

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <Button variant="ghost" size="icon" onClick={handlePrev} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="font-semibold text-sm">{format(currentMonth, 'MMMM yyyy')}</h3>
        <Button variant="ghost" size="icon" onClick={handleNext} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 bg-muted/40">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground border-b border-r last:border-r-0">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      {isLoading ? (
        <div className="grid grid-cols-7">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="min-h-[90px] border-b border-r animate-pulse bg-muted/20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7">
          {days.map((day) => (
            <DayCell
              key={day.toISOString()}
              day={day}
              currentMonth={currentMonth}
              workouts={byDay.get(format(day, 'yyyy-MM-dd')) ?? []}
              showClientName={showClientName}
              onWorkoutClick={onWorkoutClick}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-4 py-2 border-t bg-card text-[11px] text-muted-foreground">
        {(Object.entries(STATUS_DOT) as [WorkoutStatus, string][]).map(([status, dot]) => (
          <span key={status} className="flex items-center gap-1">
            <span className={cn('inline-block h-2 w-2 rounded-full', dot)} />
            {status.charAt(0) + status.slice(1).toLowerCase().replace('_', ' ')}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Selected-day workout list (shown in a popover or below the calendar) ──────

export function WorkoutDayList({
  date,
  workouts,
  onWorkoutClick,
  showClientName = false,
}: {
  date: Date | null;
  workouts: CalendarWorkout[];
  onWorkoutClick?: (w: CalendarWorkout) => void;
  showClientName?: boolean;
}) {
  if (!date) return null;
  return (
    <div className="space-y-2 pt-2">
      <p className="text-sm font-medium text-muted-foreground">
        {format(date, 'EEEE, MMMM d')}
      </p>
      {workouts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No workouts this day.</p>
      ) : (
        workouts.map((w) => (
          <button
            key={w.id}
            onClick={() => onWorkoutClick?.(w)}
            className={cn(
              'w-full text-left rounded-md px-3 py-2 text-sm',
              STATUS_CHIP[w.status],
              onWorkoutClick && 'hover:opacity-80',
            )}
          >
            <span className="font-medium">{w.title ?? 'Workout'}</span>
            {showClientName && w.clientName && (
              <span className="ml-2 text-xs opacity-75">{w.clientName}</span>
            )}
            <Badge variant="outline" className="ml-2 text-[10px] py-0">
              {w.status.charAt(0) + w.status.slice(1).toLowerCase().replace('_', ' ')}
            </Badge>
          </button>
        ))
      )}
    </div>
  );
}
