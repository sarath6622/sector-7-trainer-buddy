import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { token, device } = body;

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }

  await db.fcmToken.upsert({
    where: { token },
    update: { userId: session.user.id, device, updatedAt: new Date() },
    create: { userId: session.user.id, token, device },
  });

  return NextResponse.json({ success: true });
}
