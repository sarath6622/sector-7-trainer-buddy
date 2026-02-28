import { ComingSoonPage } from '@/components/shared/coming-soon-page';

export default function ClientCommunityPage() {
    return (
        <ComingSoonPage
            title="Community"
            description="Connect with fellow members, join challenges, share progress, and compete on leaderboards."
            backHref="/client"
            backLabel="Back to Dashboard"
        />
    );
}
