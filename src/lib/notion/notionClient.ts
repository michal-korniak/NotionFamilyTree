// Notion's API sends no CORS headers, so the browser cannot call api.notion.com directly. Locally the Vite dev/preview server proxies /notion-api (see vite.config.ts); the GitHub Pages build sets VITE_NOTION_API_BASE to the Cloudflare Worker proxy (see .github/workflows/deploy.yml).
const API_BASE: string = import.meta.env.VITE_NOTION_API_BASE ?? '/notion-api';
const NOTION_VERSION = '2025-09-03';
// Notion allows an average of 3 requests per second per integration.
const MIN_INTERVAL_MS = 350;
const MAX_ATTEMPTS = 4;

export class NotionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface NotionRichText {
  plain_text: string;
}

export type NotionPropertyValue = { id: string } & (
  | { type: 'title'; title: NotionRichText[] }
  | { type: 'rich_text'; rich_text: NotionRichText[] }
  | { type: 'select'; select: { name: string } | null }
  | { type: 'date'; date: { start: string; end?: string | null } | null }
  | { type: 'relation'; relation: { id: string }[]; has_more?: boolean }
  | { type: string; [key: string]: unknown });

export interface NotionPage {
  object: 'page';
  id: string;
  url: string;
  in_trash?: boolean;
  last_edited_time?: string;
  properties: Record<string, NotionPropertyValue>;
}

export interface NotionPropertySchema {
  id: string;
  name: string;
  type: string;
  relation?: { data_source_id: string; dual_property?: { synced_property_name?: string } };
}

interface NotionList<T> {
  results: T[];
  has_more: boolean;
  next_cursor: string | null;
}

interface NotionDatabase {
  id: string;
  title: NotionRichText[];
  data_sources: { id: string; name: string }[];
}

function friendlyMessage(status: number, code: string, message: string): string {
  if (status === 401) return 'Notion odrzucił token. Sprawdź, czy to poprawny sekret integracji wewnętrznej.';
  if (status === 404 || code === 'object_not_found') return 'Nie znaleziono. Sprawdź link i czy strona Drzewo jest udostępniona Twojej integracji (••• → Połączenia).';
  if (status === 403) return 'Integracja nie ma uprawnień. Włącz dla niej odczyt, aktualizację i dodawanie treści.';
  if (status === 502 || status === 504) return 'Nie udało się połączyć z Notion przez proxy. Lokalnie uruchom aplikację przez „npm run dev” albo „npm run preview”.';
  return message || `Żądanie do Notion nie powiodło się (${status}).`;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class NotionClient {
  private readonly token: string;
  private lastRequest = 0;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(token: string) {
    this.token = token;
  }

  // Requests run one at a time and spaced out, which keeps us under the rate limit.
  request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const run = this.chain.then(() => this.send<T>(method, path, body));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async send<T>(method: string, path: string, body: unknown, attempt = 1): Promise<T> {
    const elapsed = Date.now() - this.lastRequest;
    if (elapsed < MIN_INTERVAL_MS) await wait(MIN_INTERVAL_MS - elapsed);
    this.lastRequest = Date.now();

    let response: Response;
    try {
      // FormData gets its multipart Content-Type (with the boundary) from fetch itself.
      const isForm = body instanceof FormData;
      response = await fetch(`${API_BASE}${path}`, { method, headers: { Authorization: `Bearer ${this.token}`, 'Notion-Version': NOTION_VERSION, ...(isForm ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
    } catch {
      if (attempt < MAX_ATTEMPTS) { await wait(1000 * attempt); return this.send(method, path, body, attempt + 1); }
      throw new NotionError(0, 'network', 'Błąd sieci podczas komunikacji z Notion.');
    }

    if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * attempt);
      return this.send(method, path, body, attempt + 1);
    }

    const payload = await response.json().catch(() => ({})) as { code?: string; message?: string };
    if (!response.ok) throw new NotionError(response.status, payload.code ?? '', friendlyMessage(response.status, payload.code ?? '', payload.message ?? ''));
    return payload as T;
  }

  async retrieveDatabase(databaseId: string): Promise<{ title: string; dataSourceId: string }> {
    const database = await this.request<NotionDatabase>('GET', `/databases/${databaseId}`);
    const dataSource = database.data_sources[0];
    if (!dataSource) throw new NotionError(400, 'no_data_source', 'Ta baza nie ma źródła danych.');
    return { title: database.title.map((t) => t.plain_text).join('') || 'Baza Notion', dataSourceId: dataSource.id };
  }

  async retrieveDataSourceSchema(dataSourceId: string): Promise<Record<string, NotionPropertySchema>> {
    const dataSource = await this.request<{ properties: Record<string, NotionPropertySchema> }>('GET', `/data_sources/${dataSourceId}`);
    return dataSource.properties;
  }

  async listChildDatabases(pageId: string): Promise<{ id: string; title: string }[]> {
    const databases: { id: string; title: string }[] = [];
    let cursor: string | null = null;
    do {
      const query = `?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`;
      const list: NotionList<{ id: string; type: string; child_database?: { title: string } }> = await this.request('GET', `/blocks/${pageId}/children${query}`);
      databases.push(...list.results.filter((b) => b.type === 'child_database').map((b) => ({ id: b.id, title: b.child_database?.title ?? '' })));
      cursor = list.has_more ? list.next_cursor : null;
    } while (cursor);
    return databases;
  }

  async queryAllPages(dataSourceId: string, onProgress?: (loaded: number) => void, options: { filter?: unknown; onlyProperties?: string[] } = {}): Promise<NotionPage[]> {
    const pages: NotionPage[] = [];
    const query = options.onlyProperties ? `?${options.onlyProperties.map((p) => `filter_properties[]=${encodeURIComponent(p)}`).join('&')}` : '';
    let cursor: string | null = null;
    do {
      const list: NotionList<NotionPage> = await this.request('POST', `/data_sources/${dataSourceId}/query${query}`, { page_size: 100, result_type: 'page', ...(options.filter ? { filter: options.filter } : {}), ...(cursor ? { start_cursor: cursor } : {}) });
      pages.push(...list.results.filter((r) => r.object === 'page'));
      onProgress?.(pages.length);
      cursor = list.has_more ? list.next_cursor : null;
    } while (cursor);
    return pages;
  }

  // Query results cap relation arrays at 25 items; this fetches the full list for the rare property that has more.
  async retrieveRelation(pageId: string, propertyId: string): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const query = cursor ? `?start_cursor=${encodeURIComponent(cursor)}` : '';
      const list: NotionList<{ relation: { id: string } }> = await this.request('GET', `/pages/${pageId}/properties/${encodeURIComponent(propertyId)}${query}`);
      ids.push(...list.results.map((r) => r.relation.id));
      cursor = list.has_more ? list.next_cursor : null;
    } while (cursor);
    return ids;
  }

  // The response has carried the new data source both as data_sources[] and as data_source, so either is accepted.
  async createDatabase(parentPageId: string, title: string, properties: Record<string, unknown>): Promise<{ databaseId: string; dataSourceId: string }> {
    const database = await this.request<{ id: string; data_sources?: { id: string }[]; data_source?: { id: string } }>('POST', '/databases', { parent: { type: 'page_id', page_id: parentPageId }, title: [{ type: 'text', text: { content: title } }], initial_data_source: { properties } });
    const dataSourceId = database.data_sources?.[0]?.id ?? database.data_source?.id ?? (await this.retrieveDatabase(database.id)).dataSourceId;
    return { databaseId: database.id, dataSourceId };
  }

  updateDataSource(dataSourceId: string, properties: Record<string, unknown>): Promise<unknown> {
    return this.request('PATCH', `/data_sources/${dataSourceId}`, { properties });
  }

  createPage(dataSourceId: string, properties: Record<string, unknown>): Promise<NotionPage> {
    return this.request('POST', '/pages', { parent: { type: 'data_source_id', data_source_id: dataSourceId }, properties });
  }

  updatePage(pageId: string, body: { properties?: Record<string, unknown>; in_trash?: boolean }): Promise<NotionPage> {
    return this.request('PATCH', `/pages/${pageId}`, body);
  }

  retrievePage(pageId: string, onlyProperties: string[]): Promise<NotionPage> {
    return this.request('GET', `/pages/${pageId}?${onlyProperties.map((p) => `filter_properties[]=${encodeURIComponent(p)}`).join('&')}`);
  }

  async uploadFile(file: Blob, filename: string): Promise<string> {
    const upload = await this.request<{ id: string }>('POST', '/file_uploads', { mode: 'single_part', filename, content_type: file.type });
    const form = new FormData();
    form.append('file', file, filename);
    await this.request('POST', `/file_uploads/${upload.id}/send`, form);
    return upload.id;
  }
}
