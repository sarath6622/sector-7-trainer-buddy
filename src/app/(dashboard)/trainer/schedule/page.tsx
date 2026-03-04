'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { CalendarOff, Plus, Trash2, CalendarCheck } from 'lucide-react';
import { format, isBefore, isAfter, startOfDay } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ── Add block form ────────────────────────────────────────────────────────────

function AddBlockForm({ onAdded }: { onAdded: () => void }) {
  const trpc = useTRPC();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);

  const addMutation = useMutation(
    trpc.trainer.addAvailabilityBlock.mutationOptions({
      onSuccess: () => {
        toast.success('Unavailability block added');
        setStartDate(''); setEndDate(''); setReason('');
        setOpen(false);
        onAdded();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) return;
    addMutation.mutate({ startDate, endDate, reason: reason || undefined });
  };

  if (!open) {
    return (
      <Button size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Block Dates
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Block Unavailable Dates</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="block-start">Start Date</Label>
              <Input
                id="block-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="block-end">End Date</Label>
              <Input
                id="block-end"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="block-reason">Reason (optional)</Label>
            <Input
              id="block-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Holiday, Conference, Personal leave"
              maxLength={200}
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={addMutation.isPending}>
              {addMutation.isPending ? 'Saving…' : 'Save Block'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Single availability block card ────────────────────────────────────────────

function BlockCard({
  block,
  onRemove,
}: {
  block: { id: string; startDate: Date; endDate: Date; reason: string | null; isBlocked: boolean };
  onRemove: (id: string) => void;
}) {
  const today = startOfDay(new Date());
  const end = startOfDay(new Date(block.endDate));
  const start = startOfDay(new Date(block.startDate));

  const isPast = isBefore(end, today);
  const isActive = !isBefore(end, today) && !isAfter(start, today);

  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 rounded-lg border p-3',
        isPast && 'opacity-50',
        isActive && 'border-destructive/50 bg-destructive/5',
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 rounded-md bg-muted p-1.5 shrink-0">
          <CalendarOff className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {format(new Date(block.startDate), 'MMM d, yyyy')}
            {' – '}
            {format(new Date(block.endDate), 'MMM d, yyyy')}
          </p>
          {block.reason && (
            <p className="text-xs text-muted-foreground mt-0.5">{block.reason}</p>
          )}
          <div className="mt-1">
            {isActive && <Badge variant="destructive" className="text-xs">Active now</Badge>}
            {!isActive && !isPast && <Badge variant="outline" className="text-xs">Upcoming</Badge>}
            {isPast && <Badge variant="secondary" className="text-xs">Past</Badge>}
          </div>
        </div>
      </div>

      <Button
        size="icon"
        variant="ghost"
        className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(block.id)}
        title="Remove block"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TrainerSchedulePage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Reuses getMyProfile which already fetches availabilityBlocks ordered by startDate
  const { data: profile, isLoading } = useQuery(
    trpc.trainer.getMyProfile.queryOptions(),
  );

  const refetch = () =>
    queryClient.invalidateQueries({ queryKey: trpc.trainer.getMyProfile.queryKey() });

  const removeMutation = useMutation(
    trpc.trainer.removeAvailabilityBlock.mutationOptions({
      onSuccess: () => { toast.success('Block removed'); refetch(); },
      onError: (err) => toast.error(err.message),
    }),
  );

  const blocks = profile?.availabilityBlocks ?? [];
  const today = startOfDay(new Date());

  // Sort: active/upcoming first (chronological), past blocks at the bottom
  const sorted = [...blocks].sort((a, b) => {
    const aEnd = startOfDay(new Date(a.endDate));
    const bEnd = startOfDay(new Date(b.endDate));
    const aPast = isBefore(aEnd, today);
    const bPast = isBefore(bEnd, today);
    if (aPast !== bPast) return aPast ? 1 : -1;
    return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
  });

  const activeOrUpcomingCount = sorted.filter(
    (b) => !isBefore(startOfDay(new Date(b.endDate)), today),
  ).length;
  const pastCount = sorted.length - activeOrUpcomingCount;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Schedule"
          description="Block out dates when you are unavailable for client sessions"
        />
        <AddBlockForm onAdded={refetch} />
      </div>

      {/* ── Summary cards ──────────────────────────────────────────────────── */}
      {!isLoading && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="rounded-full bg-primary/10 p-2">
                <CalendarCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeOrUpcomingCount}</p>
                <p className="text-xs text-muted-foreground">Active / upcoming blocks</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="rounded-full bg-muted p-2">
                <CalendarOff className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pastCount}</p>
                <p className="text-xs text-muted-foreground">Past blocks</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Block list ─────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No blocked periods. Click <strong>Block Dates</strong> to mark yourself unavailable.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((block) => (
            <BlockCard
              key={block.id}
              block={block}
              onRemove={(id) => removeMutation.mutate({ id })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
