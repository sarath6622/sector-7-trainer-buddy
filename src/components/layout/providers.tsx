'use client';

import { useState } from 'react';
import { SessionProvider } from 'next-auth/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { TRPCProvider, trpcClient } from '@/trpc/client';
import { makeQueryClient } from '@/trpc/query-client';
import { Toaster } from '@/components/ui/sonner';

let browserQueryClient: ReturnType<typeof makeQueryClient> | undefined;

function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(getQueryClient);

  return (
    // defaultTheme="dark" matches Sector 7's brand identity (dark background in logo)
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <SessionProvider>
        <QueryClientProvider client={queryClient}>
          <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
            {children}
            <Toaster />
          </TRPCProvider>
        </QueryClientProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
