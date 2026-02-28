import { ComingSoonPage } from '@/components/shared/coming-soon-page';

export default function TrainerSchedulePage() {
    return (
        <ComingSoonPage
            title="Schedule"
            description="View and manage your availability, block out time, and coordinate session bookings with clients."
            backHref="/trainer"
            backLabel="Back to Dashboard"
        />
    );
}
