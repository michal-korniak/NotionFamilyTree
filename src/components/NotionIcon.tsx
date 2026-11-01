// A neutral "N in a page" glyph rather than Notion's trademarked logo.
export function NotionIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M9 16V8l6 8V8" />
    </svg>
  );
}
