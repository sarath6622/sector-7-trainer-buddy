'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Users, Play, X, Trophy } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

// Status badge colours
const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'secondary',
  ACTIVE: 'default',
  COMPLETED: 'outline',
  CANCELLED: 'destructive',
};

const TYPE_LABELS: Record<string, string> = {
  WORKOUT_COUNT: 'Workout Count',
  TOTAL_VOLUME: 'Total Volume',
  STREAK: 'Streak',
  HABIT_CONSISTENCY: 'Habit Consistency',
  CUSTOM: 'Custom',
};

// ── Create Challenge dialog form ──────────────────────────────────────────────

function CreateChallengeDialog({ onCreated }: { onCreated: () => void }) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('WORKOUT_COUNT');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const createMutation = useMutation(trpc.challenge.create.mutationOptions({
    onSuccess: () => {
      toast.success('Challenge created');
      setOpen(false);
      setName(''); setDescription(''); setStartDate(''); setEndDate('');
      setType('WORKOUT_COUNT');
      onCreated();
    },
    onError: (err) => toast.error(err.message),
  }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startDate || !endDate) return;
    createMutation.mutate({ name, description: description || undefined, type: type as any, startDate, endDate });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          New Challenge
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Challenge</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label htmlFor="ch-name">Name</Label>
            <Input
              id="ch-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. March Workout Blitz"
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="ch-desc">Description (optional)</Label>
            <Textarea
              id="ch-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this challenge about?"
              rows={2}
            />
          </div>

          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ch-start">Start Date</Label>
              <Input
                id="ch-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ch-end">End Date</Label>
              <Input
                id="ch-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating…' : 'Create Challenge'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminChallengesPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Fetch all challenges across all statuses for the management table
  const { data: allChallenges, isLoading } = useQuery(
    trpc.challenge.listAll.queryOptions(),
  );

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['challenge'] });

  const activateMutation = useMutation(trpc.challenge.activate.mutationOptions({
    onSuccess: () => { toast.success('Challenge activated'); refetch(); },
    onError: (err) => toast.error(err.message),
  }));

  const cancelMutation = useMutation(trpc.challenge.cancel.mutationOptions({
    onSuccess: () => { toast.success('Challenge cancelled'); refetch(); },
    onError: (err) => toast.error(err.message),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Challenges"
          description="Create and manage gym-wide fitness challenges"
        />
        <CreateChallengeDialog onCreated={refetch} />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : (allChallenges ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No challenges yet. Create one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(allChallenges ?? []).map((c) => (
            <Card key={c.id}>
              <CardContent className="py-4 flex items-start gap-4">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">{c.name}</p>
                    <Badge variant={STATUS_STYLE[c.status] as any} className="text-xs">
                      {c.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {TYPE_LABELS[c.type] ?? c.type}
                    </Badge>
                  </div>
                  {c.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{c.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Trophy className="h-3 w-3" />
                      {format(new Date(c.startDate), 'MMM d')} – {format(new Date(c.endDate), 'MMM d, yyyy')}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {c._count.participants} joined
                    </span>
                  </div>
                </div>

                {/* Action buttons based on status */}
                <div className="flex items-center gap-2 shrink-0">
                  {c.status === 'DRAFT' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-xs h-8"
                      disabled={activateMutation.isPending}
                      onClick={() => activateMutation.mutate({ id: c.id })}
                    >
                      <Play className="h-3 w-3" />
                      Activate
                    </Button>
                  )}
                  {['DRAFT', 'ACTIVE'].includes(c.status) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-xs h-8 text-destructive hover:text-destructive"
                      disabled={cancelMutation.isPending}
                      onClick={() => cancelMutation.mutate({ id: c.id })}
                    >
                      <X className="h-3 w-3" />
                      Cancel
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
