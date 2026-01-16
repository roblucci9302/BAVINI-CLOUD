/**
 * Supabase SDK.
 *
 * Lightweight client for Supabase REST API.
 */

// Types
export interface SupabaseUser {
  id: string;
  email?: string;
  phone?: string;
  created_at: string;
  user_metadata: Record<string, unknown>;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: SupabaseUser;
}

export interface AuthResponse {
  user: SupabaseUser;
  session: SupabaseSession | null;
}

export interface StorageBucket {
  id: string;
  name: string;
  public: boolean;
  created_at: string;
}

export interface QueryOptions {
  columns?: string;
  filter?: Record<string, string>;
  order?: string;
  limit?: number;
  offset?: number;
}

// Client
export class SupabaseClient {
  private readonly url: string;
  private readonly anonKey: string;
  private accessToken?: string;

  constructor(config: { url: string; anonKey: string }) {
    if (!config.url) {
      throw new Error('Supabase URL is required');
    }

    if (!config.anonKey) {
      throw new Error('Supabase anon key is required');
    }

    this.url = config.url.replace(/\/$/, '');
    this.anonKey = config.anonKey;
  }

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  private getAuthHeader(): string {
    return `Bearer ${this.accessToken || this.anonKey}`;
  }

  async rest<T>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    const response = await fetch(`${this.url}/rest/v1${path}`, {
      method,
      headers: {
        apikey: this.anonKey,
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(error.message || `Supabase API error: ${response.status}`);
    }

    if (response.status === 204) {
      return [] as T;
    }

    return response.json();
  }

  async auth<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.url}/auth/v1${path}`, {
      method,
      headers: {
        apikey: this.anonKey,
        'Content-Type': 'application/json',
        ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { message?: string; error_description?: string };
      throw new Error(error.message || error.error_description || `Supabase Auth error: ${response.status}`);
    }

    return response.json();
  }

  async storage<T>(method: string, path: string, body?: unknown): Promise<T> {
    const isUpload = body instanceof ArrayBuffer;
    const response = await fetch(`${this.url}/storage/v1${path}`, {
      method,
      headers: {
        apikey: this.anonKey,
        Authorization: this.getAuthHeader(),
        ...(isUpload ? {} : { 'Content-Type': 'application/json' }),
      },
      body: isUpload ? body : body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(error.message || `Supabase Storage error: ${response.status}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    const text = await response.text();

    try {
      return JSON.parse(text);
    } catch {
      return text as T;
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      await this.rest('GET', '/');
      return true;
    } catch {
      return false;
    }
  }
}

export function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
  return new SupabaseClient({ url, anonKey });
}

// Database functions
export async function select<T>(client: SupabaseClient, table: string, options?: QueryOptions): Promise<T[]> {
  const params = new URLSearchParams();
  params.set('select', options?.columns || '*');

  if (options?.filter) {
    Object.entries(options.filter).forEach(([key, value]) => params.set(key, value));
  }

  if (options?.order) {
    params.set('order', options.order);
  }

  if (options?.limit) {
    params.set('limit', String(options.limit));
  }

  if (options?.offset) {
    params.set('offset', String(options.offset));
  }

  return client.rest<T[]>('GET', `/${table}?${params.toString()}`);
}

export async function selectOne<T>(client: SupabaseClient, table: string, filter: Record<string, string>): Promise<T> {
  const params = new URLSearchParams({ select: '*' });
  Object.entries(filter).forEach(([key, value]) => params.set(key, value));

  return client.rest<T>('GET', `/${table}?${params.toString()}`, undefined, {
    Accept: 'application/vnd.pgrst.object+json',
  });
}

export async function insert<T>(
  client: SupabaseClient,
  table: string,
  data: Record<string, unknown> | Record<string, unknown>[],
  options?: { upsert?: boolean },
): Promise<T[]> {
  const headers: Record<string, string> = {};

  if (options?.upsert) {
    headers.Prefer = 'return=representation,resolution=merge-duplicates';
  }

  return client.rest<T[]>('POST', `/${table}`, data, headers);
}

export async function update<T>(
  client: SupabaseClient,
  table: string,
  data: Record<string, unknown>,
  filter: Record<string, string>,
): Promise<T[]> {
  const params = new URLSearchParams();
  Object.entries(filter).forEach(([key, value]) => params.set(key, value));

  return client.rest<T[]>('PATCH', `/${table}?${params.toString()}`, data);
}

export async function deleteRows<T>(
  client: SupabaseClient,
  table: string,
  filter: Record<string, string>,
): Promise<T[]> {
  const params = new URLSearchParams();
  Object.entries(filter).forEach(([key, value]) => params.set(key, value));

  return client.rest<T[]>('DELETE', `/${table}?${params.toString()}`);
}

export async function rpc<T>(
  client: SupabaseClient,
  functionName: string,
  params?: Record<string, unknown>,
): Promise<T> {
  return client.rest<T>('POST', `/rpc/${functionName}`, params);
}

// Auth functions
export async function signUp(client: SupabaseClient, email: string, password: string): Promise<AuthResponse> {
  return client.auth('POST', '/signup', { email, password });
}

export async function signInWithPassword(
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<AuthResponse> {
  return client.auth('POST', '/token?grant_type=password', { email, password });
}

export async function signOut(client: SupabaseClient): Promise<void> {
  await client.auth('POST', '/logout', {});
}

export async function getUser(client: SupabaseClient): Promise<SupabaseUser> {
  return client.auth('GET', '/user', undefined);
}

export async function refreshSession(client: SupabaseClient, refreshToken: string): Promise<SupabaseSession> {
  return client.auth('POST', '/token?grant_type=refresh_token', { refresh_token: refreshToken });
}

// Storage functions
export async function listBuckets(client: SupabaseClient): Promise<StorageBucket[]> {
  return client.storage('GET', '/bucket');
}

export async function uploadFile(
  client: SupabaseClient,
  bucket: string,
  path: string,
  file: ArrayBuffer,
): Promise<{ Key: string }> {
  return client.storage('POST', `/object/${bucket}/${path}`, file);
}

export async function downloadFile(client: SupabaseClient, bucket: string, path: string): Promise<Blob> {
  // Accès aux propriétés internes du client Supabase
  const internalClient = client as unknown as import('./types').SupabaseClientInternal;

  const response = await fetch(`${internalClient.url}/storage/v1/object/${bucket}/${path}`, {
    headers: {
      apikey: internalClient.anonKey,
      Authorization: `Bearer ${internalClient.accessToken || internalClient.anonKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  return response.blob();
}

export async function deleteFile(client: SupabaseClient, bucket: string, paths: string[]): Promise<void> {
  await client.storage('DELETE', `/object/${bucket}`, { prefixes: paths });
}

export async function createSignedUrl(
  client: SupabaseClient,
  bucket: string,
  path: string,
  expiresIn: number,
): Promise<string> {
  const result = await client.storage<{ signedURL: string }>('POST', `/object/sign/${bucket}/${path}`, { expiresIn });
  return result.signedURL;
}
