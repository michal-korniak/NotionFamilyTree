import { useCallback, useSyncExternalStore } from 'react';

// Chrome, Edge and Samsung Internet's install offer; not in the DOM typings, and never fired on iOS, where installing goes through Share → "Do ekranu początkowego".
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// The browser can offer installation before React has rendered, so the offer is caught as soon as this module loads.
let offer: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); offer = event as InstallPromptEvent; notify(); });
  window.addEventListener('appinstalled', () => { offer = null; notify(); });
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };

// Null while the browser offers no installation: the app is already installed, the browser cannot install it, or it is iOS.
export function useInstallPrompt(): (() => Promise<void>) | null {
  const available = useSyncExternalStore(subscribe, () => offer !== null, () => false);
  const install = useCallback(async () => {
    if (!offer) return;
    const current = offer;
    offer = null;
    notify();
    await current.prompt();
    await current.userChoice.catch(() => undefined);
  }, []);
  return available ? install : null;
}
