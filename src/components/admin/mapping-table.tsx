'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface MappingTableProps {
    onRefetch?: () => void;
}

// Paginated table of active trainer-client mappings with deactivation actions
export function MappingTable({ onRefetch }: MappingTableProps) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const [deactivateId, setDeactivateId] = useState<string | null>(null);

    const { data, isLoading } = useQuery(trpc.trainer.getMappings.queryOptions({ activeOnly: true, page, limit: 15 }));

    const remove = useMutation(trpc.trainer.removeAssignment.mutationOptions({
        onSuccess: () => {
            toast.success('Assignment removed');
            queryClient.invalidateQueries(trpc.trainer.getMappings.queryFilter());
            onRefetch?.();
            setDeactivateId(null);
        },
        onError: (err: { message: string }) => toast.error(err.message),
    }));

    if (isLoading) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
        );
    }

    const mappings = data?.mappings ?? [];
    const totalPages = data?.totalPages ?? 1;

    return (
        <>
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Trainer</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Since</TableHead>
                            <TableHead className="w-16"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {mappings.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                    No active mappings
                                </TableCell>
                            </TableRow>
                        ) : (
                            mappings.map((m) => (
                                <TableRow key={m.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Avatar className="h-7 w-7">
                                                <AvatarImage src={m.trainer.user.image ?? undefined} />
                                                <AvatarFallback className="text-xs">{m.trainer.user.name?.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="text-sm font-medium">{m.trainer.user.name ?? '—'}</p>
                                                <p className="text-xs text-muted-foreground">{m.trainer.user.email}</p>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Avatar className="h-7 w-7">
                                                <AvatarImage src={m.client.user.image ?? undefined} />
                                                <AvatarFallback className="text-xs">{m.client.user.name?.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="text-sm font-medium">{m.client.user.name ?? '—'}</p>
                                                <p className="text-xs text-muted-foreground">{m.client.user.email}</p>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={m.type === 'PRIMARY' ? 'default' : 'secondary'} className="text-xs">
                                            {m.type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {formatDistanceToNow(new Date(m.startDate), { addSuffix: true })}
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                            onClick={() => setDeactivateId(m.id)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-3">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                    <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
            )}

            <AlertDialog open={!!deactivateId} onOpenChange={(o) => !o && setDeactivateId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove Assignment</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will deactivate the trainer-client relationship. The history record is preserved. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deactivateId && remove.mutate({ mappingId: deactivateId })}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Remove
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
