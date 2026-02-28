'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Calendar, Clock, Dumbbell, Flame } from 'lucide-react';
import type { WorkoutStatus } from '@/generated/prisma/enums';

interface WorkoutLogCardProps {
    id: string;
    title?: string | null;
    date: Date;
    durationMin?: number | null;
    status: WorkoutStatus;
    scheduledAt?: Date | null;
    muscleGroups?: string[];
    exerciseCount?: number;
    onClick?: () => void;
}

// Maps status to a readable badge variant so clients can quickly scan their history
const STATUS_CONFIG: Record<WorkoutStatus, { label: string; className: string }> = {
    ASSIGNED: { label: 'Assigned', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    IN_PROGRESS: { label: 'In Progress', className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
    COMPLETED: { label: 'Completed', className: 'bg-green-500/10 text-green-400 border-green-500/20' },
    SKIPPED: { label: 'Skipped', className: 'bg-muted text-muted-foreground border-border' },
};

function formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date));
}

export function WorkoutLogCard({
    title,
    date,
    durationMin,
    status,
    scheduledAt,
    muscleGroups = [],
    exerciseCount = 0,
    onClick,
}: WorkoutLogCardProps) {
    const cfg = STATUS_CONFIG[status];

    return (
        <Card
            onClick={onClick}
            className={cn(
                'transition-all duration-200',
                onClick && 'cursor-pointer hover:border-primary/40 hover:shadow-md hover:shadow-primary/5',
            )}
        >
            <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                <CardTitle className="text-base font-semibold line-clamp-1">
                    {title ?? 'Workout Session'}
                </CardTitle>
                <Badge variant="outline" className={cn('shrink-0 text-xs', cfg.className)}>
                    {cfg.label}
                </Badge>
            </CardHeader>

            <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {status === 'ASSIGNED' && scheduledAt
                            ? `Scheduled: ${formatDate(scheduledAt)}`
                            : formatDate(date)}
                    </span>
                    {durationMin && (
                        <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {durationMin} min
                        </span>
                    )}
                    {exerciseCount > 0 && (
                        <span className="flex items-center gap-1">
                            <Dumbbell className="h-3.5 w-3.5" />
                            {exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>

                {muscleGroups.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {muscleGroups.slice(0, 4).map((m) => (
                            <span key={m} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                {m.replace('_', ' ')}
                            </span>
                        ))}
                        {muscleGroups.length > 4 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                +{muscleGroups.length - 4}
                            </span>
                        )}
                    </div>
                )}

                {status === 'COMPLETED' && (
                    <div className="flex items-center gap-1 text-xs text-green-400">
                        <Flame className="h-3.5 w-3.5" />
                        Completed
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
