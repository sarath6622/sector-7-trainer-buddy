'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DISMISSED_KEY = 'pwa-install-dismissed-until';
const DISMISS_DAYS = 7;

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPhone / iPod
  if (/iphone|ipod/i.test(ua)) return true;
  // iPad classic UA
  if (/ipad/i.test(ua)) return true;
  // iPadOS 13+ reports as "Macintosh" but has touch support
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

function isMobile() {
  if (typeof navigator === 'undefined') return false;
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent)
    || (typeof navigator.maxTouchPoints !== 'undefined' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

export function PWAInstallPrompt() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    if (isStandalone()) return;
    if (!isMobile()) return;

    const until = localStorage.getItem(DISMISSED_KEY);
    if (until && Date.now() < Number(until)) return;

    const iosDevice = isIOS();
    setIos(iosDevice);

    if (iosDevice) {
      // iOS Safari never fires beforeinstallprompt — show manual instructions immediately
      setShow(true);
    } else {
      // Android/Chrome: show a banner straight away with instructions,
      // and upgrade to native install button if beforeinstallprompt fires
      setShow(true);

      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
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
    if (outcome === 'accepted') setShow(false);
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-96x96.png"
            alt="Sector 7"
            className="h-12 w-12 rounded-xl shrink-0"
          />

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-snug">Install Sector 7</p>
            {ios ? (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Tap the{' '}
                <Share className="inline h-3 w-3 mx-0.5 -mt-0.5" />
                <strong> Share</strong> button, then{' '}
                <strong>Add to Home Screen</strong>.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {deferredPrompt
                  ? 'Add to your home screen for fast, offline access.'
                  : 'Open your browser menu and tap Add to Home Screen.'}
              </p>
            )}
          </div>

          <button
            onClick={dismiss}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors -mt-0.5"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Native install button — shown on Android when beforeinstallprompt fired */}
        {!ios && deferredPrompt && (
          <Button size="sm" className="w-full mt-3 gap-2 h-9" onClick={install}>
            <Download className="h-4 w-4" />
            Install App
          </Button>
        )}
      </div>
    </div>
  );
}
