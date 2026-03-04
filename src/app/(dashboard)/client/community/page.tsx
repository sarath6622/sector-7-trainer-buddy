'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Users, ChevronDown, ChevronUp, LogIn, LogOut } from 'lucide-react';
import { format, isAfter, isBefore } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  WORKOUT_COUNT: 'Workout Count',
  TOTAL_VOLUME: 'Total Volume (kg·reps)',
  STREAK: 'Streak',
  HABIT_CONSISTENCY: 'Habit Consistency',
  CUSTOM: 'Custom',
};

// ── Leaderboard panel — expands inline below each challenge card ──────────────

function LeaderboardPanel({ challengeId }: { challengeId: string }) {
  const trpc = useTRPC();
  const { data: entries = [], isLoading } = useQuery(
    trpc.challenge.getLeaderboard.queryOptions({ challengeId }),
  );

  if (isLoading) {
    return (
      <div className="space-y-2 pt-3 border-t mt-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="pt-3 border-t mt-3 text-xs text-muted-foreground text-center">
        No participants yet — be the first to join!
      </p>
    );
  }

  return (
    <div className="pt-3 border-t mt-3 space-y-2">
      {entries.map((entry) => (
        <div
          key={entry.userId}
          className={cn(
            'flex items-center gap-3 rounded-lg px-2 py-1.5',
            entry.isMe && 'bg-primary/10',
          )}
        >
          {/* Rank medal for top 3 */}
          <span className="text-sm font-bold w-6 text-center shrink-0">
            {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
          </span>

          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={entry.image ?? undefined} />
            <AvatarFallback className="text-[10px]">
              {(entry.name ?? '?').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {entry.name}
              {entry.isMe && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
            </p>
          </div>

          <span className="text-sm font-semibold shrink-0">{entry.score}</span>
        </div>
      ))}
    </div>
  );
}

// ── Single challenge card ─────────────────────────────────────────────────────

function ChallengeCard({ challenge }: { challenge: any }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Derived state from the list query's participants array (0 or 1 entries for current user)
  const myEntry = challenge.participants?.[0];
  const isJoined = !!myEntry && !myEntry.optedOut;

  const refetch = () => queryClient.invalidateQueries({ queryKey: [['challenge', 'list']] });

  const joinMutation = useMutation(trpc.challenge.join.mutationOptions({
    onSuccess: () => { toast.success('Joined challenge!'); refetch(); },
    onError: (err) => toast.error(err.message),
  }));

  const leaveMutation = useMutation(trpc.challenge.leave.mutationOptions({
    onSuccess: () => { toast.success('Left challenge'); refetch(); },
    onError: (err) => toast.error(err.message),
  }));

  const now = new Date();
  const started = !isBefore(now, new Date(challenge.startDate));
  const ended = isAfter(now, new Date(challenge.endDate));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <CardTitle className="text-base">{challenge.name}</CardTitle>
              <Badge variant="outline" className="text-xs shrink-0">
                {TYPE_LABELS[challenge.type] ?? challenge.type}
              </Badge>
            </div>
            {challenge.description && (
              <p className="text-sm text-muted-foreground">{challenge.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Trophy className="h-3 w-3" />
                {format(new Date(challenge.startDate), 'MMM d')} – {format(new Date(challenge.endDate), 'MMM d, yyyy')}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {challenge._count?.participants ?? 0} joined
              </span>
            </div>
            {ended && <p className="text-xs text-muted-foreground mt-1">Challenge ended</p>}
            {!started && <p className="text-xs text-muted-foreground mt-1">Starts {format(new Date(challenge.startDate), 'MMM d')}</p>}
          </div>

          {/* Join / Leave button — only show while challenge is running or upcoming */}
          {!ended && (
            <div className="shrink-0">
              {isJoined ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-xs h-8"
                  disabled={leaveMutation.isPending}
                  onClick={() => leaveMutation.mutate({ challengeId: challenge.id })}
                >
                  <LogOut className="h-3 w-3" />
                  Leave
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="gap-1 text-xs h-8"
                  disabled={joinMutation.isPending}
                  onClick={() => joinMutation.mutate({ challengeId: challenge.id })}
                >
                  <LogIn className="h-3 w-3" />
                  Join
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Leaderboard toggle */}
        <button
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowLeaderboard((v) => !v)}
        >
          {showLeaderboard ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showLeaderboard ? 'Hide' : 'Show'} Leaderboard
        </button>

        {showLeaderboard && <LeaderboardPanel challengeId={challenge.id} />}
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClientCommunityPage() {
  const trpc = useTRPC();

  const { data: challenges = [], isLoading } = useQuery(
    // Fetches only ACTIVE challenges (default behaviour of challenge.list)
    trpc.challenge.list.queryOptions({}),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Community"
        description="Join gym-wide challenges and compete on the leaderboard"
      />

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : challenges.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No active challenges right now. Check back soon!
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {challenges.map((c) => (
            <ChallengeCard key={c.id} challenge={c} />
          ))}
        </div>
      )}
    </div>
  );
}
