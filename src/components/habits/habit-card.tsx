'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Flame, Pencil, Check, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { HabitType } from '@/generated/prisma/enums';

export type HabitEntry = {
  id: string;
  type: HabitType;
  value: number;
  unit?: string | null;
  date: Date;
};

type HabitCardProps = {
  type: HabitType;
  label: string;
  icon: LucideIcon;
  unit: string;
  target: number;
  color: string;
  // Today's logged entry for this habit (null if not yet logged)
  todayEntry: HabitEntry | null;
  // All entries for the last 30 days — used to calculate streak client-side
  recentEntries: HabitEntry[];
  selectedDate: string; // ISO date string YYYY-MM-DD
};

// Calculates consecutive days this habit was logged, ending on selectedDate
function calcStreak(entries: HabitEntry[], selectedDate: string): number {
  const dateSet = new Set(
    entries.map((e) => new Date(e.date).toISOString().slice(0, 10)),
  );
  let streak = 0;
  const cursor = new Date(selectedDate);
  while (dateSet.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function HabitCard({
  type,
  label,
  icon: Icon,
  unit,
  target,
  color,
  todayEntry,
  recentEntries,
  selectedDate,
}: HabitCardProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const streak = calcStreak(recentEntries, selectedDate);
  const logged = todayEntry !== null;
  const progress = todayEntry ? Math.min((todayEntry.value / target) * 100, 100) : 0;

  const { mutate: logHabit, isPending } = useMutation(
    trpc.habit.log.mutationOptions({
      onSuccess: () => {
        // Invalidate the habits query so all cards refresh with the new value
        queryClient.invalidateQueries({ queryKey: [['habit', 'list']] });
        setEditing(false);
      },
    }),
  );

  function handleSubmit() {
    const val = parseFloat(inputValue);
    if (isNaN(val) || val < 0) return;
    logHabit({ type, date: selectedDate, value: val, unit });
  }

  function handleEdit() {
    setInputValue(todayEntry ? String(todayEntry.value) : '');
    setEditing(true);
  }

  return (
    <Card className={cn('relative overflow-hidden transition-all', logged && 'ring-1 ring-inset ring-primary/30')}>
      {/* Progress fill bar along the bottom */}
      <div
        className="absolute bottom-0 left-0 h-1 bg-primary/60 transition-all duration-500"
        style={{ width: `${progress}%` }}
      />

      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
        <div className="flex items-center gap-2">
          <div className={cn('p-1.5 rounded-lg', color)}>
            <Icon className="h-4 w-4" />
          </div>
          <CardTitle className="text-sm font-medium">{label}</CardTitle>
        </div>
        {streak > 0 && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Flame className="h-3 w-3 text-orange-400" />
            {streak}d
          </Badge>
        )}
      </CardHeader>

      <CardContent className="px-4 pb-4">
        {editing ? (
          <div className="flex items-center gap-2 mt-1">
            <Input
              type="number"
              min="0"
              placeholder={`e.g. ${target}`}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="h-8 text-sm"
              autoFocus
            />
            <span className="text-xs text-muted-foreground shrink-0">{unit}</span>
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={handleSubmit} disabled={isPending}>
              <Check className="h-4 w-4 text-green-500" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setEditing(false)}>
              <X className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ) : (
          <div className="flex items-end justify-between mt-1">
            <div>
              {logged ? (
                <div className="text-2xl font-bold">
                  {todayEntry!.value}
                  <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>
                </div>
              ) : (
                <div className="text-2xl font-bold text-muted-foreground/40">—</div>
              )}
              <p className="text-xs text-muted-foreground">
                Target: {target} {unit}
              </p>
            </div>
            <Button
              size="sm"
              variant={logged ? 'ghost' : 'outline'}
              className="h-7 gap-1 text-xs"
              onClick={handleEdit}
            >
              <Pencil className="h-3 w-3" />
              {logged ? 'Edit' : 'Log'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
