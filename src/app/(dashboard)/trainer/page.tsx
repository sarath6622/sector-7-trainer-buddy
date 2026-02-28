'use client';

import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { Users, Dumbbell, Calendar } from 'lucide-react';

// Fetches live client and workout data so trainer dashboard shows real numbers
export default function TrainerDashboard() {
  const trpc = useTRPC();
  const { data: overview, isLoading: loadingOverview } = useQuery(
    trpc.workout.getTrainerOverview.queryOptions(),
  );

  const activeClientCount = overview?.clients.length ?? 0;
  const weeklyWorkouts = overview?.clients.reduce(
    (sum: number, c) => sum + c.recentWorkouts.filter((w) => w.status === 'COMPLETED').length,
    0,
  ) ?? 0;
  const assignedCount = overview?.clients.reduce(
    (sum: number, c) => sum + c.recentWorkouts.filter((w) => w.status === 'ASSIGNED').length,
    0,
  ) ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Trainer Dashboard" description="Manage your clients and schedule" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingOverview ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <>
                <div className="text-2xl font-bold">{activeClientCount}</div>
                <p className="text-xs text-muted-foreground">Assigned to you</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Completed This Week</CardTitle>
            <Dumbbell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingOverview ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <>
                <div className="text-2xl font-bold">{weeklyWorkouts}</div>
                <p className="text-xs text-muted-foreground">By your clients</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Workouts</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingOverview ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <>
                <div className="text-2xl font-bold">{assignedCount}</div>
                <p className="text-xs text-muted-foreground">Awaiting completion</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
