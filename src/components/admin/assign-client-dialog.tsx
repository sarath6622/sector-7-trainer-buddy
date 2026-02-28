'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { toast } from 'sonner';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface AssignClientDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    defaultTrainerId?: string;
}

// Admin dialog to link a client to a trainer — prevents duplicate active mappings
export function AssignClientDialog({ open, onOpenChange, defaultTrainerId }: AssignClientDialogProps) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [trainerId, setTrainerId] = useState(defaultTrainerId ?? '');
    const [clientUserId, setClientUserId] = useState('');
    const [mappingType, setMappingType] = useState<'PRIMARY' | 'TEMPORARY'>('PRIMARY');
    const [reason, setReason] = useState('');
    const [clientSearch, setClientSearch] = useState('');

    const { data: trainers, isLoading: loadingTrainers } = useQuery(trpc.trainer.listAll.queryOptions());
    const { data: clientUsers, isLoading: loadingClients } = useQuery(
        trpc.user.list.queryOptions({ role: 'CLIENT', limit: 50 }),
    );

    const assign = useMutation(trpc.trainer.assignClient.mutationOptions({
        onSuccess: () => {
            toast.success('Client assigned successfully');
            queryClient.invalidateQueries(trpc.trainer.getMappings.queryFilter());
            queryClient.invalidateQueries(trpc.trainer.listAll.queryFilter());
            onOpenChange(false);
            resetForm();
        },
        onError: (err: { message: string }) => toast.error(err.message),
    }));

    function resetForm() {
        setTrainerId(defaultTrainerId ?? '');
        setClientUserId('');
        setMappingType('PRIMARY');
        setReason('');
        setClientSearch('');
    }

    const filteredClients = clientUsers?.users.filter(
        (u) => !clientSearch || u.name?.toLowerCase().includes(clientSearch.toLowerCase()) || u.email.toLowerCase().includes(clientSearch.toLowerCase()),
    ) ?? [];

    function handleSubmit() {
        if (!trainerId || !clientUserId) {
            toast.error('Please select both a trainer and a client');
            return;
        }

        // trainerId = TrainerProfile.id (from trainer.listAll), clientUserId = ClientProfile.id
        assign.mutate({ trainerId, clientId: clientUserId, type: mappingType, reason: reason || undefined });
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Assign Client to Trainer</DialogTitle>
                    <DialogDescription>Create a trainer-client mapping. Duplicate active mappings are prevented.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Trainer picker */}
                    <div className="space-y-1.5">
                        <Label>Trainer</Label>
                        {loadingTrainers ? <Skeleton className="h-9 w-full" /> : (
                            <Select value={trainerId} onValueChange={setTrainerId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a trainer…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {trainers?.map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                            <div className="flex items-center gap-2">
                                                <Avatar className="h-5 w-5">
                                                    <AvatarImage src={t.user.image ?? undefined} />
                                                    <AvatarFallback className="text-xs">{t.user.name?.charAt(0)}</AvatarFallback>
                                                </Avatar>
                                                <span>{t.user.name ?? t.user.email}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    ({t.clientMappings.length} clients)
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    {/* Client search */}
                    <div className="space-y-1.5">
                        <Label>Client</Label>
                        <Input
                            placeholder="Search clients by name or email…"
                            value={clientSearch}
                            onChange={(e) => setClientSearch(e.target.value)}
                        />
                        {loadingClients ? <Skeleton className="h-24 w-full" /> : (
                            <div className="max-h-40 overflow-y-auto rounded-md border divide-y">
                                {filteredClients.map((u) => {
                                    const profileId = u.clientProfile?.id;
                                    const isSelected = !!profileId && clientUserId === profileId;
                                    return (
                                        <button
                                            key={u.id}
                                            type="button"
                                            disabled={!profileId}
                                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed ${isSelected ? 'bg-muted' : 'hover:bg-muted'
                                                }`}
                                            onClick={() => profileId && setClientUserId(profileId)}
                                        >
                                            <Avatar className="h-6 w-6 shrink-0">
                                                <AvatarImage src={u.image ?? undefined} />
                                                <AvatarFallback className="text-xs">{u.name?.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <p className="truncate font-medium">{u.name ?? '—'}</p>
                                                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                                            </div>
                                            {isSelected && <span className="text-xs text-primary shrink-0">Selected</span>}
                                            {!profileId && <span className="text-xs text-yellow-500 shrink-0">No profile</span>}
                                        </button>
                                    );
                                })}
                                {filteredClients.length === 0 && (
                                    <p className="text-sm text-muted-foreground text-center py-3">No clients found</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Mapping type */}
                    <div className="space-y-1.5">
                        <Label>Mapping Type</Label>
                        <Select value={mappingType} onValueChange={(v) => setMappingType(v as 'PRIMARY' | 'TEMPORARY')}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="PRIMARY">Primary (permanent assignment)</SelectItem>
                                <SelectItem value="TEMPORARY">Temporary (cover / substitute)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Reason */}
                    <div className="space-y-1.5">
                        <Label>Reason (optional)</Label>
                        <Input placeholder="e.g. New client onboarding" value={reason} onChange={(e) => setReason(e.target.value)} />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={assign.isPending || !trainerId || !clientUserId}>
                        {assign.isPending ? 'Assigning…' : 'Assign'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
