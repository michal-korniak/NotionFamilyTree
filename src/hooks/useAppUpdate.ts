import { useEffect, useRef, useState } from 'react';

const CHECK_EVERY_MS = 5 * 60_000;

async function newerBuildPublished(): Promise<boolean> {
  const response = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' });
  if (!response.ok) return false;
  const { build } = (await response.json()) as { build?: string };
  return Boolean(build) && build !== __BUILD_ID__;
}

// An installed app on a phone is resumed rather than reopened, so it would keep running the version it was started with. This checks for a
// newer deploy when the app comes back to the screen and every few minutes, and reloads straight away; the tree and the photo queue are
// stored in the browser, so nothing is lost. While canReload says no (a form or dialog is open) it only reports the update, for a banner.
export function useAppUpdate(canReload: boolean): boolean {
  const [available, setAvailable] = useState(false);
  const canReloadRef = useRef(canReload);
  canReloadRef.current = canReload;

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState !== 'visible') return;
      checking = true;
      try {
        if (!(await newerBuildPublished())) return;
        void navigator.serviceWorker?.getRegistration().then((registration) => registration?.update()).catch(() => undefined);
        if (canReloadRef.current) location.reload(); else setAvailable(true);
      } catch {
        // Offline or the file is missing: try again on the next check.
      } finally {
        checking = false;
      }
    };
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', check);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, []);

  // Once the form or dialog that held the reload back is closed, the waiting update is applied.
  useEffect(() => { if (available && canReload) location.reload(); }, [available, canReload]);

  return available;
}
