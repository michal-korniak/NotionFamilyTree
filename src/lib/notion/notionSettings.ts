const TOKEN_KEY = 'nft:notion-token';
const DATABASE_KEY = 'nft:notion-database';

function read(key: string): string {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}

function write(key: string, value: string | null) {
  try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* storage unavailable */ }
}

export const notionSettings = {
  token: () => read(TOKEN_KEY),
  databaseInput: () => read(DATABASE_KEY),
  save: (token: string, databaseInput: string) => { write(TOKEN_KEY, token); write(DATABASE_KEY, databaseInput); },
  forgetToken: () => write(TOKEN_KEY, null),
};

// Accepts a full Notion URL (…/a1616bbe708a4677ad975293452652f5?v=…), a bare 32-character id or a dashed UUID.
export function parseDatabaseId(input: string): string | null {
  const withoutQuery = input.trim().split(/[?#]/)[0] ?? '';
  const dashed = withoutQuery.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (dashed) return dashed[0].toLowerCase();
  const compact = [...withoutQuery.matchAll(/[0-9a-f]{32}/gi)].at(-1)?.[0];
  if (!compact) return null;
  const hex = compact.toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
