'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageSquare, Send } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';

interface MessageSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Trainer entry-point: pass clientProfileId to create/get conversation
  clientProfileId?: string | null;
  // Client entry-point: pass conversationId directly (from listConversations)
  conversationId?: string | null;
  otherUserName?: string | null;
}

// ── Inner chat view — rendered once conversationId is resolved ─────────────────

function ChatThread({
  conversationId,
  otherUserName,
}: {
  conversationId: string;
  otherUserName?: string | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const myUserId = session?.user?.id;
  const [body, setBody] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Poll every 3 s while the sheet is open for near-real-time message delivery
  const { data, isLoading } = useQuery({
    ...trpc.message.getThread.queryOptions({ conversationId }),
    refetchInterval: 3000,
  });

  const markRead = useMutation(trpc.message.markRead.mutationOptions());

  // Mark messages as read when the thread mounts
  useEffect(() => {
    markRead.mutate({ conversationId });
    // Invalidate unreadCount badge so nav updates immediately
    queryClient.invalidateQueries({ queryKey: [['message', 'unreadCount']] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const sendMutation = useMutation(
    trpc.message.send.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [['message', 'getThread'], { conversationId }] });
        queryClient.invalidateQueries({ queryKey: [['message', 'listConversations']] });
        setBody('');
        // Scroll to bottom after send
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const handleSend = () => {
    const trimmed = body.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate({ conversationId, body: trimmed });
  };

  // Display messages oldest-first (getThread returns newest-first)
  const messages = [...(data?.messages ?? [])].reverse();

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!isLoading) {
      setTimeout(() => bottomRef.current?.scrollIntoView(), 50);
    }
  }, [isLoading]);

  return (
    <>
      <ScrollArea className="flex-1 px-4 py-3">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className={cn('h-10 w-2/3 rounded-2xl', i % 2 === 0 ? 'ml-auto' : '')} />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground mt-8">
            No messages yet. Say hello to {otherUserName ?? 'your trainer'}!
          </p>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => {
              const isMe = msg.senderId === myUserId;
              return (
                <div key={msg.id} className={cn('flex gap-2 items-end', isMe ? 'justify-end' : 'justify-start')}>
                  {!isMe && (
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarImage src={msg.sender.image ?? undefined} />
                      <AvatarFallback className="text-[9px]">
                        {(msg.sender.name ?? '?').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className={cn('flex flex-col gap-0.5 max-w-[75%]', isMe ? 'items-end' : 'items-start')}>
                    <div
                      className={cn(
                        'px-3 py-2 text-sm leading-snug',
                        isMe
                          ? 'bg-primary text-primary-foreground rounded-tl-2xl rounded-tr-sm rounded-bl-2xl rounded-br-2xl'
                          : 'bg-muted text-foreground rounded-tl-sm rounded-tr-2xl rounded-bl-2xl rounded-br-2xl',
                      )}
                    >
                      {msg.body}
                    </div>
                    <span className="text-[10px] text-muted-foreground px-1">
                      {format(new Date(msg.createdAt), 'h:mm a')}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Send input */}
      <div className="px-4 py-3 border-t flex gap-2">
        <Input
          placeholder="Type a message…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          className="flex-1"
          disabled={sendMutation.isPending}
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!body.trim() || sendMutation.isPending}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}

// ── MessageSheet — resolves conversationId then renders ChatThread ─────────────

export function MessageSheet({
  open,
  onOpenChange,
  clientProfileId,
  conversationId: conversationIdProp,
  otherUserName,
}: MessageSheetProps) {
  const trpc = useTRPC();

  // Trainer entry: call getOrCreateConversation to get/create the thread
  const createConvo = useMutation(
    trpc.message.getOrCreateConversation.mutationOptions({
      onError: (err) => toast.error(err.message),
    }),
  );

  // Fire getOrCreate when trainer opens the sheet with a clientProfileId
  useEffect(() => {
    if (open && clientProfileId && !conversationIdProp) {
      createConvo.mutate({ clientProfileId });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientProfileId]);

  // Resolved conversationId — from prop (client side) or mutation result (trainer side)
  const resolvedConversationId = conversationIdProp ?? createConvo.data?.id ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 shrink-0" />
            {otherUserName ?? 'Messages'}
          </SheetTitle>
        </SheetHeader>

        {!resolvedConversationId ? (
          // Loading state while getOrCreate resolves
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Opening conversation…</p>
          </div>
        ) : (
          <ChatThread conversationId={resolvedConversationId} otherUserName={otherUserName} />
        )}
      </SheetContent>
    </Sheet>
  );
}
