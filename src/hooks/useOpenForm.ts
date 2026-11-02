import { useEffect, useRef } from 'react';

export interface OpenForm {
  isDirty: () => boolean;
  // Saves the form as its own Zapisz would; false when it does not validate and stays open.
  save: () => boolean;
  discard: () => void;
}

// Forms that are open right now, so saving to Notion can first ask what to do with the one being edited.
const openForms = new Set<{ current: OpenForm }>();

export function useOpenForm(form: OpenForm): void {
  const latest = useRef(form);
  latest.current = form;
  useEffect(() => {
    const entry = latest;
    openForms.add(entry);
    return () => { openForms.delete(entry); };
  }, []);
}

export function changedForms(): OpenForm[] {
  return [...openForms].map((entry) => entry.current).filter((form) => form.isDirty());
}

// On a phone, focusing a field on its own opens the keyboard over half the form, so fields are only focused where there is a mouse.
export const focusOnOpen = (): boolean => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
