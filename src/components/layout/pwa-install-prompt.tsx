'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DISMISSED_KEY = 'pwa-install-dismissed-until';
const DISMISS_DAYS = 7;

// Detect iOS Safari (doesn't fire beforeinstallprompt)
function isIOS() {
  return (
    typeof navigator !== 'undefined' &&
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !(window as any).MSStream
  );
}

// Detect standalone mode (already installed)
function isStandalone() {
  return (
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true)
  );
}

export function PWAInstallPrompt() {
  const [show, setShow] = useState(false);
  const [isIos, setIsIos] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Don't show if already running as installed PWA
    if (isStandalone()) return;

    // Don't show if user dismissed recently
    const until = localStorage.getItem(DISMISSED_KEY);
    if (until && Date.now() < Number(until)) return;

    const ios = isIOS();
    setIsIos(ios);

    if (ios) {
      // iOS: show our manual instruction banner
      setShow(true);
    } else {
      // Android / Chrome / Edge: wait for browser event
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setShow(true);
      };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(
      DISMISSED_KEY,
      String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000),
    );
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShow(false);
    }
    setDeferredPrompt(null);
  };

  if (!show) return null;

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]',
        'animate-in slide-in-from-bottom-4 duration-300',
      )}
    >
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card shadow-2xl shadow-black/40 p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-96x96.png"
            alt="Sector 7"
            className="h-12 w-12 rounded-xl shrink-0"
          />

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-snug">Install Sector 7</p>
            {isIos ? (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Tap the{' '}
                <Share className="inline h-3 w-3 mx-0.5 -mt-0.5" />
                <strong> Share</strong> button, then{' '}
                <strong>Add to Home Screen</strong> for the full app experience.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Add to your home screen for fast access — works offline too.
              </p>
            )}
          </div>

          {/* Dismiss */}
          <button
            onClick={dismiss}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors -mt-0.5"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Install button — only for non-iOS where we can trigger the prompt */}
        {!isIos && (
          <Button
            size="sm"
            className="w-full mt-3 gap-2 h-9"
            onClick={install}
          >
            <Download className="h-4 w-4" />
            Install App
          </Button>
        )}
      </div>
    </div>
  );
}
