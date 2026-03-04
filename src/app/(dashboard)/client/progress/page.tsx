'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Trophy, TrendingUp, BarChart2, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MUSCLE_GROUP_LABELS } from '@/lib/constants';
import type { MuscleGroup } from '@/generated/prisma/enums';

// ── Consistency heatmap ───────────────────────────────────────────────────────

function ConsistencyHeatmap({ dates }: { dates: string[] }) {
  const dateSet = new Set(dates);

  // Build the last 16 weeks of days (Mon–Sun) ending today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Roll back to the most recent Monday
  const dow = today.getDay() || 7; // 1=Mon … 7=Sun
  const lastMonday = new Date(today);
  lastMonday.setDate(today.getDate() - dow + 1);

  const weeks: string[][] = [];
  for (let w = 15; w >= 0; w--) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(lastMonday);
      day.setDate(lastMonday.getDate() - w * 7 + d);
      week.push(day.toISOString().slice(0, 10));
    }
    weeks.push(week);
  }

  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div className="space-y-1">
      {/* Day-of-week labels */}
      <div className="flex gap-1 pl-0">
        {DAY_LABELS.map((l, i) => (
          <div key={i} className="w-5 text-center text-[10px] text-muted-foreground">{l}</div>
        ))}
      </div>
      {/* Grid: each row is a week, each cell is a day */}
      <div className="flex gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((date) => {
              const future = date > today.toISOString().slice(0, 10);
              const worked = dateSet.has(date);
              return (
                <div
                  key={date}
                  title={date}
                  className={cn(
                    'h-5 w-5 rounded-sm transition-colors',
                    future && 'opacity-0 pointer-events-none',
                    !future && worked && 'bg-primary',
                    !future && !worked && 'bg-muted',
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground pt-1">Last 16 weeks</p>
    </div>
  );
}

// ── Custom Recharts tooltip ───────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.value} {unit}
        </p>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClientProgressPage() {
  const trpc = useTRPC();
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);

  const { data: records = [], isLoading: recordsLoading } = useQuery(
    trpc.workout.getPersonalRecords.queryOptions(),
  );

  const { data: weeklyVolume = [], isLoading: volumeLoading } = useQuery(
    trpc.workout.getWeeklyVolume.queryOptions({ weeks: 12 }),
  );

  // Consistency: get COMPLETED workout dates for the last 16 weeks from the weekly volume query
  // We also need a consistency query — use the existing list or a new call.
  // Since we have weeklyVolume which already has workoutCount per week, for heatmap we need
  // actual dates. We'll derive from the workout list (last 120 days).
  const { data: recentWorkouts } = useQuery(
    trpc.workout.list.queryOptions({ status: 'COMPLETED', limit: 100 }),
  );

  const consistencyDates = useMemo(
    () => (recentWorkouts?.workouts ?? []).map((w: any) => new Date(w.date).toISOString().slice(0, 10)),
    [recentWorkouts],
  );

  // Exercise picker is populated from personal records (only exercises they've actually logged with weight)
  const exerciseOptions = useMemo(() => records.map((r) => ({ id: r.exerciseId, name: r.name })), [records]);

  // Auto-select the first exercise once records load
  const activeExerciseId = selectedExerciseId ?? exerciseOptions[0]?.id ?? null;

  const { data: progressData = [], isLoading: progressLoading } = useQuery({
    ...trpc.workout.getProgressData.queryOptions({
      exerciseId: activeExerciseId ?? '',
      weeks: 12,
    }),
    enabled: !!activeExerciseId,
  });

  return (
    <div className="space-y-8">
      <PageHeader title="Progress" description="Track your strength gains and training consistency" />

      {/* ── Personal Records ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-yellow-500" />
          <h2 className="text-base font-semibold">Personal Records</h2>
        </div>

        {recordsLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : records.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No personal records yet — log some weighted workouts to see your bests here.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {records.slice(0, 6).map((r) => (
              <Card key={r.exerciseId}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {MUSCLE_GROUP_LABELS[r.primaryMuscle as MuscleGroup]}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-xs font-bold">
                      {r.maxWeightKg} kg
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {r.reps} reps · {r.date}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── Strength Progression ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Strength Progression</h2>
          </div>
          {exerciseOptions.length > 0 && (
            <Select
              value={activeExerciseId ?? ''}
              onValueChange={setSelectedExerciseId}
            >
              <SelectTrigger className="w-48 h-8 text-sm">
                <SelectValue placeholder="Select exercise" />
              </SelectTrigger>
              <SelectContent>
                {exerciseOptions.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <Card>
          <CardContent className="pt-4 pb-2">
            {progressLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : progressData.length < 2 ? (
              <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
                {activeExerciseId
                  ? 'Log this exercise at least twice to see your progression.'
                  : 'No weighted exercises logged yet.'}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={progressData} margin={{ top: 4, right: 8, bottom: 4, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit=" kg" />
                  <Tooltip content={<ChartTooltip unit="kg" />} />
                  <Line
                    type="monotone"
                    dataKey="maxWeightKg"
                    name="Max weight"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 4, fill: 'hsl(var(--primary))' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Weekly Volume + Consistency ───────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Weekly Volume */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Weekly Volume</h2>
          </div>
          <Card>
            <CardContent className="pt-4 pb-2">
              {volumeLoading ? (
                <Skeleton className="h-52 w-full" />
              ) : weeklyVolume.every((w) => w.volume === 0) ? (
                <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
                  No workout volume logged yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={weeklyVolume} margin={{ top: 4, right: 8, bottom: 4, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip unit="kg·reps" />} />
                    <Bar
                      dataKey="volume"
                      name="Volume"
                      fill="hsl(var(--primary))"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Consistency heatmap */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Consistency</h2>
          </div>
          <Card>
            <CardContent className="pt-4 pb-4 overflow-x-auto">
              <ConsistencyHeatmap dates={consistencyDates} />
            </CardContent>
          </Card>
        </section>

      </div>
    </div>
  );
}
