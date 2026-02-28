'use client';

import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { Dumbbell, Flame, Trophy, TrendingUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Fetches live workout stats via getStats so the dashboard reflects real training data
export default function ClientDashboard() {
  const trpc = useTRPC();
  const { data: stats, isLoading } = useQuery(trpc.workout.getStats.queryOptions());

  const lastWorkoutLabel = stats?.lastWorkout
    ? formatDistanceToNow(new Date(stats.lastWorkout.date), { addSuffix: true })
    : '—';

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Track your fitness journey" />
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Recent Workout</CardTitle>
            <Dumbbell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold truncate">{stats?.lastWorkout?.title ?? '—'}</div>
                <p className="text-xs text-muted-foreground">{lastWorkoutLabel}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Streak</CardTitle>
            <Flame className="h-4 w-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats?.streak ?? 0} days</div>
                <p className="text-xs text-muted-foreground">
                  {stats?.streak ? 'Keep it up!' : 'Start your streak today'}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats?.weeklyCount ?? 0}</div>
                <p className="text-xs text-muted-foreground">Workouts completed</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats?.totalWorkouts ?? 0}</div>
                <p className="text-xs text-muted-foreground">Workouts ever</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
