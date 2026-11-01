import { useEffect, useRef, useState } from 'react';
import type { NotionLink, PeopleById, UnionDetails } from '../types/person';
import { pushToNotion } from '../lib/notion/notionPush';
import { notionSettings } from '../lib/notion/notionSettings';

// Waiting for a pause in editing batches a burst of changes (e.g. adding a child and then their dates) into one push.
const QUIET_PERIOD_MS = 3000;

export type AutoSyncStatus = { kind: 'idle' } | { kind: 'syncing' } | { kind: 'error'; message: string };

interface AutoSyncOptions {
  enabled: boolean;
  paused: boolean;
  link: NotionLink | undefined;
  people: PeopleById;
  unions: Record<string, UnionDetails>;
  pending: number;
  onPushed: (link: NotionLink) => void;
}

export function useNotionAutoSync({ enabled, paused, link, people, unions, pending, onPushed }: AutoSyncOptions): AutoSyncStatus {
  const [status, setStatus] = useState<AutoSyncStatus>({ kind: 'idle' });
  const running = useRef(false);
  // A failed push is not retried for the same data, only after the next edit; otherwise a lasting error (bad token, no access) would loop.
  const failedFor = useRef<{ people: PeopleById; unions: Record<string, UnionDetails> } | null>(null);

  useEffect(() => {
    if (!enabled) { setStatus({ kind: 'idle' }); return; }
    if (paused || !link || pending === 0 || running.current) return;
    if (failedFor.current?.people === people && failedFor.current.unions === unions) return;
    const timer = setTimeout(async () => {
      const token = notionSettings.token();
      if (!token) { failedFor.current = { people, unions }; setStatus({ kind: 'error', message: 'Brak tokenu Notion. Podaj go raz w oknie „Aktualizuj”.' }); return; }
      running.current = true;
      setStatus({ kind: 'syncing' });
      const result = await pushToNotion(token, link, people, unions, () => {});
      running.current = false;
      failedFor.current = result.error ? { people, unions } : null;
      setStatus(result.error ? { kind: 'error', message: result.error } : { kind: 'idle' });
      onPushed(result.link);
    }, QUIET_PERIOD_MS);
    return () => clearTimeout(timer);
  }, [enabled, paused, link, people, unions, pending, onPushed]);

  return status;
}
