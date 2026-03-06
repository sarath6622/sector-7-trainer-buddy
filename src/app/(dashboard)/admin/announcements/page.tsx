'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Megaphone, Pin, PinOff, Trash2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

// ── Create Dialog ─────────────────────────────────────────────────────────────

function CreateAnnouncementDialog({ onCreated }: { onCreated: () => void }) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isPinned, setIsPinned] = useState(false);

  const create = useMutation(
    trpc.announcement.create.mutationOptions({
      onSuccess: () => {
        toast.success('Announcement posted and members notified.');
        setOpen(false);
        setTitle('');
        setBody('');
        setIsPinned(false);
        onCreated();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          New Announcement
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Announcement</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="ann-title">Title</Label>
            <Input
              id="ann-title"
              placeholder="e.g. Gym closure this Sunday"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ann-body">Message</Label>
            <Textarea
              id="ann-body"
              placeholder="Write your announcement here…"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch id="ann-pin" checked={isPinned} onCheckedChange={setIsPinned} />
            <Label htmlFor="ann-pin" className="cursor-pointer">
              Pin to top of feed
            </Label>
          </div>
          <Button
            className="w-full"
            disabled={!title.trim() || !body.trim() || create.isPending}
            onClick={() => create.mutate({ title: title.trim(), body: body.trim(), isPinned })}
          >
            {create.isPending ? 'Posting…' : 'Post Announcement'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Announcement Card ─────────────────────────────────────────────────────────

function AnnouncementCard({ item, onChanged }: { item: any; onChanged: () => void }) {
  const trpc = useTRPC();

  const pin = useMutation(
    trpc.announcement.pin.mutationOptions({
      onSuccess: () => { toast.success('Pinned'); onChanged(); },
      onError: (err) => toast.error(err.message),
    }),
  );

  const unpin = useMutation(
    trpc.announcement.unpin.mutationOptions({
      onSuccess: () => { toast.success('Unpinned'); onChanged(); },
      onError: (err) => toast.error(err.message),
    }),
  );

  const del = useMutation(
    trpc.announcement.delete.mutationOptions({
      onSuccess: () => { toast.success('Announcement deleted'); onChanged(); },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm">{item.title}</p>
              {item.isPinned && (
                <Badge variant="default" className="text-xs gap-1">
                  <Pin className="h-3 w-3" />
                  Pinned
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">{item.body}</p>
            <p className="text-xs text-muted-foreground">
              {item.author?.name ?? 'Admin'} · {format(new Date(item.createdAt), 'MMM d, yyyy')}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {item.isPinned ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1 text-xs"
                disabled={unpin.isPending}
                onClick={() => unpin.mutate({ id: item.id })}
              >
                <PinOff className="h-3.5 w-3.5" />
                Unpin
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1 text-xs"
                disabled={pin.isPending}
                onClick={() => pin.mutate({ id: item.id })}
              >
                <Pin className="h-3.5 w-3.5" />
                Pin
              </Button>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete announcement?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove &ldquo;{item.title}&rdquo; from the feed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => del.mutate({ id: item.id })}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminAnnouncementsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: announcements = [], isLoading } = useQuery(
    trpc.announcement.listAll.queryOptions(),
  );

  const refetch = () =>
    queryClient.invalidateQueries({ queryKey: [['announcement', 'listAll']] });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          title="Announcements"
          description="Post gym-wide updates that notify all active members"
        />
        <CreateAnnouncementDialog onCreated={refetch} />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : announcements.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
            <Megaphone className="h-8 w-8 opacity-30" />
            <p>No announcements yet. Post one to notify all members.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {announcements.map((item) => (
            <AnnouncementCard key={item.id} item={item} onChanged={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}
