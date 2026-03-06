'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { PageHeader } from '@/components/shared/page-header';
import { MessageSheet } from '@/components/messages/message-sheet';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// ── Conversation list item ─────────────────────────────────────────────────────

function ConversationItem({
  name,
  image,
  lastMessageBody,
  lastMessageAt,
  unreadCount,
  onClick,
}: {
  name?: string | null;
  image?: string | null;
  lastMessageBody?: string | null;
  lastMessageAt?: Date | null;
  unreadCount: number;
  onClick: () => void;
}) {
  return (
    <button
      className="w-full text-left flex items-center gap-3 p-4 rounded-xl hover:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarImage src={image ?? undefined} />
        <AvatarFallback className="text-sm font-semibold">
          {(name ?? '?').slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-sm truncate">{name ?? 'Trainer'}</p>
          {lastMessageAt && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formatDistanceToNow(new Date(lastMessageAt), { addSuffix: true })}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {lastMessageBody ?? 'No messages yet'}
        </p>
      </div>

      {unreadCount > 0 && (
        <Badge className="shrink-0 h-5 min-w-5 rounded-full text-xs px-1.5">
          {unreadCount}
        </Badge>
      )}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClientMessagesPage() {
  const trpc = useTRPC();
  const [activeConversation, setActiveConversation] = useState<{
    conversationId: string;
    trainerName?: string | null;
  } | null>(null);

  const { data: conversations = [], isLoading } = useQuery(
    trpc.message.listConversations.queryOptions(),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Messages" description="Chat with your trainer" />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-sm">No conversations yet</p>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Your trainer can message you from the Clients page. You&apos;ll see the conversation here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-2">
            {conversations.map((convo) => {
              // Client sees trainer info; convo.trainer is included for CLIENT role
              const trainer = 'trainer' in convo ? (convo as any).trainer : null;
              const trainerUser = trainer?.user;
              const lastMsg = convo.messages?.[0];
              const unread = (convo._count as any)?.messages ?? 0;

              return (
                <ConversationItem
                  key={convo.id}
                  name={trainerUser?.name}
                  image={trainerUser?.image}
                  lastMessageBody={lastMsg?.body}
                  lastMessageAt={lastMsg?.createdAt ? new Date(lastMsg.createdAt) : null}
                  unreadCount={unread}
                  onClick={() =>
                    setActiveConversation({
                      conversationId: convo.id,
                      trainerName: trainerUser?.name,
                    })
                  }
                />
              );
            })}
          </CardContent>
        </Card>
      )}

      <MessageSheet
        open={!!activeConversation}
        onOpenChange={(o) => !o && setActiveConversation(null)}
        conversationId={activeConversation?.conversationId ?? null}
        otherUserName={activeConversation?.trainerName}
      />
    </div>
  );
}
