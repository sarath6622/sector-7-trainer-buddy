'use client';

import {
  Bell,
  Dumbbell,
  MessageSquare,
  AlertTriangle,
  Trophy,
  Flame,
  Megaphone,
  UserCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, React.ElementType> = {
  WORKOUT_REMINDER: Dumbbell,
  TRAINER_MESSAGE: MessageSquare,
  PROGRAM_ASSIGNED: Dumbbell,
  MISSED_WORKOUT: AlertTriangle,
  TRAINER_UNAVAILABLE: AlertTriangle,
  CHALLENGE_UPDATE: Trophy,
  ACHIEVEMENT: Trophy,
  STREAK_REMINDER: Flame,
  SYSTEM_ANNOUNCEMENT: Megaphone,
  ASSIGNMENT_CHANGE: UserCheck,
};

interface NotificationItemProps {
  notification: {
    id: string;
    type: string;
    title: string;
    message: string;
    isRead: boolean;
    createdAt: string;
  };
  onMarkRead?: (id: string) => void;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const Icon = ICON_MAP[notification.type] || Bell;

  return (
    <button
      onClick={() => onMarkRead?.(notification.id)}
      className={cn(
        'flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-accent',
        !notification.isRead && 'bg-primary/5',
      )}
    >
      <div className="mt-0.5 shrink-0 rounded-full bg-muted p-2">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={cn('text-sm', !notification.isRead && 'font-semibold')}>
            {notification.title}
          </p>
          {!notification.isRead && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
          )}
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">{notification.message}</p>
        <p className="mt-1 text-xs text-muted-foreground">{timeAgo(notification.createdAt)}</p>
      </div>
    </button>
  );
}
