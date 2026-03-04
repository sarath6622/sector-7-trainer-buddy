'use client';

import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Users, TrendingUp, CheckCircle, Clock, BarChart2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Custom tooltip that matches the app's dark theme
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
      <p className="font-medium mb-1">{label}</p>
      <p className="text-primary">{payload[0].value} workouts</p>
    </div>
  );
}

// Fetches granular per-client metrics via getTrainerPerformance for the full dashboard
export default function TrainerDashboard() {
  const trpc = useTRPC();
  const { data: perf, isLoading } = useQuery(
    trpc.workout.getTrainerPerformance.queryOptions(),
  );

  const stats = perf?.stats;
  const clients = perf?.clients ?? [];

  // Bar chart data: one bar per client showing workouts completed in the last 30 days
  const chartData = clients
    .map((c) => ({
      name: (c.name ?? 'Unknown').split(' ')[0], // first name only to keep labels short
      workouts: c.completedLast30,
    }))
    .sort((a, b) => b.workouts - a.workouts);

  return (
    <div className="space-y-6">
      <PageHeader title="Trainer Dashboard" description="Your performance at a glance" />

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-12" /> : (
              <>
                <div className="text-2xl font-bold">{clients.length}</div>
                <p className="text-xs text-muted-foreground">Assigned to you</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Retention Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <>
                <div className="text-2xl font-bold">{stats?.retentionRate ?? 0}%</div>
                <p className="text-xs text-muted-foreground">Active last 30 days</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg / Client / Week</CardTitle>
            <BarChart2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-12" /> : (
              <>
                <div className="text-2xl font-bold">{stats?.avgWorkoutsPerClientPerWeek ?? 0}</div>
                <p className="text-xs text-muted-foreground">Workouts per client</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <>
                <div className="text-2xl font-bold">{stats?.completionRate ?? 0}%</div>
                <p className="text-xs text-muted-foreground">
                  {stats?.pendingTotal ?? 0} pending
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Client activity chart + table ────────────────────────────────── */}
      {!isLoading && clients.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">

          {/* Bar chart — workouts completed per client last 30 days */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Client Activity (Last 30 Days)</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="workouts" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Per-client status table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Client Status</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {clients
                  .slice()
                  .sort((a, b) => b.completedLast30 - a.completedLast30)
                  .map((c) => (
                    <div key={c.clientProfileId} className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={c.image ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {(c.name ?? '?').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.name ?? 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.lastActive
                            ? `Active ${formatDistanceToNow(new Date(c.lastActive), { addSuffix: true })}`
                            : 'No activity yet'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold">{c.completedLast30}</span>
                        {c.pendingAssigned > 0 && (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Clock className="h-3 w-3" />
                            {c.pendingAssigned}
                          </Badge>
                        )}
                        {c.completedLast30 === 0 && (
                          <Badge variant="secondary" className="text-xs text-muted-foreground">
                            Inactive
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

        </div>
      )}

      {/* Empty state when no clients assigned yet */}
      {!isLoading && clients.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No clients assigned yet. Ask your admin to assign clients to you.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
