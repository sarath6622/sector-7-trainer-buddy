'use client';

import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Users, Dumbbell, Activity, TrendingUp, BarChart2 } from 'lucide-react';

// Custom tooltip matching the app's dark theme
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color ?? 'hsl(var(--primary))' }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

// Fetches live counts via getAdminStats and analytics data via getAdminAnalytics
export default function AdminDashboard() {
  const trpc = useTRPC();
  const { data: stats, isLoading: statsLoading } = useQuery(trpc.user.getAdminStats.queryOptions());
  const { data: analytics, isLoading: analyticsLoading } = useQuery(
    trpc.user.getAdminAnalytics.queryOptions(),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Admin Dashboard" description="Manage your gym operations" />

      {/* ── Stat cards ──────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats?.totalUsers ?? 0}</div>
                <p className="text-xs text-muted-foreground">Active members</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Trainers</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats?.totalTrainers ?? 0}</div>
                <p className="text-xs text-muted-foreground">Active trainers</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Exercises</CardTitle>
            <Dumbbell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats?.totalExercises ?? 0}</div>
                <p className="text-xs text-muted-foreground">In library</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Analytics charts ─────────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* User Growth line chart */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">New Members (Last 12 Weeks)</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {analyticsLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={analytics?.userGrowth ?? []}
                  margin={{ top: 4, right: 8, bottom: 4, left: -20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="newUsers"
                    name="New members"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'hsl(var(--primary))' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Platform Activity bar chart */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Platform Activity (Last 12 Weeks)</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {analyticsLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={analytics?.platformActivity ?? []}
                  margin={{ top: 4, right: 8, bottom: 4, left: -20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="workouts" name="Workouts" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top Exercises horizontal bar chart */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Top Exercises by Usage</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {analyticsLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (analytics?.topExercises ?? []).length === 0 ? (
              <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
                No exercises logged yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  layout="vertical"
                  data={analytics?.topExercises ?? []}
                  margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Uses" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Trainer Comparison table */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Trainer Comparison (Last 30 Days)</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {analyticsLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (analytics?.trainerComparison ?? []).length === 0 ? (
              <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
                No trainers with assigned clients yet.
              </div>
            ) : (
              <div className="space-y-3">
                {(analytics?.trainerComparison ?? []).map((t) => (
                  <div key={t.name} className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs">
                        {t.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.clientCount} {t.clientCount === 1 ? 'client' : 'clients'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{t.completedLast30}</p>
                      <p className="text-xs text-muted-foreground">workouts</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
