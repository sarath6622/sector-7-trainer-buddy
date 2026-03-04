'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HabitCard } from '@/components/habits/habit-card';
import { Droplets, Moon, Footprints, Beef, Flame, ChevronLeft, ChevronRight } from 'lucide-react';
import type { HabitType } from '@/generated/prisma/enums';

// Static config for each built-in habit type — defines icon, unit, and daily target
const HABIT_CONFIG: Array<{
  type: HabitType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  unit: string;
  target: number;
  color: string;
}> = [
  { type: 'WATER',    label: 'Water',    icon: Droplets,   unit: 'glasses', target: 8,     color: 'bg-blue-500/15 text-blue-400' },
  { type: 'SLEEP',    label: 'Sleep',    icon: Moon,       unit: 'hrs',     target: 8,     color: 'bg-indigo-500/15 text-indigo-400' },
  { type: 'STEPS',    label: 'Steps',    icon: Footprints, unit: 'steps',   target: 10000, color: 'bg-green-500/15 text-green-400' },
  { type: 'PROTEIN',  label: 'Protein',  icon: Beef,       unit: 'g',       target: 150,   color: 'bg-orange-500/15 text-orange-400' },
  { type: 'CALORIES', label: 'Calories', icon: Flame,      unit: 'kcal',    target: 2500,  color: 'bg-red-500/15 text-red-400' },
];

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = toDateString(new Date());
  const yesterday = toDateString(new Date(Date.now() - 86400000));
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Fetches 30 days of habit data so streaks can be computed client-side without extra requests
export default function ClientHabitsPage() {
  const trpc = useTRPC();
  const [selectedDate, setSelectedDate] = useState(toDateString(new Date()));

  const today = toDateString(new Date());
  const isToday = selectedDate === today;

  function shiftDate(days: number) {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    // Don't allow navigating into the future
    if (toDateString(d) > today) return;
    setSelectedDate(toDateString(d));
  }

  // Fetch last 30 days to cover streak calculation for any day the user browses to
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return toDateString(d);
  }, []);

  const { data: entries = [], isLoading } = useQuery(
    trpc.habit.list.queryOptions({ startDate: thirtyDaysAgo, endDate: today }),
  );

  // Build a lookup: type → entry for the selected date
  const todayMap = useMemo(() => {
    const map = new Map<HabitType, typeof entries[number]>();
    for (const e of entries) {
      if (toDateString(new Date(e.date)) === selectedDate) {
        map.set(e.type as HabitType, e);
      }
    }
    return map;
  }, [entries, selectedDate]);

  const loggedCount = todayMap.size;
  const totalHabits = HABIT_CONFIG.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Habits"
        description="Track your daily habits and build consistent streaks"
      />

      {/* Date navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftDate(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium w-28 text-center">{formatDisplayDate(selectedDate)}</span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => shiftDate(1)}
          disabled={isToday}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {!isLoading && (
          <span className="ml-2 text-xs text-muted-foreground">
            {loggedCount}/{totalHabits} logged
          </span>
        )}
      </div>

      {/* Habit cards grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HABIT_CONFIG.map((config) => {
            const todayEntry = todayMap.get(config.type) ?? null;
            const recentEntries = entries.filter((e) => e.type === config.type);

            return (
              <HabitCard
                key={config.type}
                type={config.type}
                label={config.label}
                icon={config.icon as any}
                unit={config.unit}
                target={config.target}
                color={config.color}
                todayEntry={
                  todayEntry
                    ? {
                        id: todayEntry.id,
                        type: todayEntry.type as HabitType,
                        value: todayEntry.value,
                        unit: todayEntry.unit,
                        date: new Date(todayEntry.date),
                      }
                    : null
                }
                recentEntries={recentEntries.map((e) => ({
                  id: e.id,
                  type: e.type as HabitType,
                  value: e.value,
                  unit: e.unit,
                  date: new Date(e.date),
                }))}
                selectedDate={selectedDate}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
