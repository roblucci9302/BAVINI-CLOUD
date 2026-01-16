/**
 * Notion Service SDK
 *
 * Lightweight API client for Notion using native fetch().
 * Provides page, database, and block operations.
 *
 * @see https://developers.notion.com/reference
 */

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

/**
 * Base HTTP client for Notion API
 */
class BaseHttpClient {
  constructor(
    protected accessToken: string,
    protected baseUrl: string = NOTION_API_BASE,
  ) {}

  protected async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Notion API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  protected get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  protected post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  protected patch<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  protected delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

/*
 * =============================================================================
 * Types
 * =============================================================================
 */

export interface NotionUser {
  object: 'user';
  id: string;
  type: 'person' | 'bot';
  name?: string;
  avatar_url?: string | null;
  person?: {
    email: string;
  };
  bot?: {
    owner: {
      type: 'workspace' | 'user';
      workspace?: boolean;
      user?: NotionUser;
    };
    workspace_name?: string;
  };
}

export interface NotionPage {
  object: 'page';
  id: string;
  created_time: string;
  last_edited_time: string;
  created_by: { object: 'user'; id: string };
  last_edited_by: { object: 'user'; id: string };
  cover: NotionFile | null;
  icon: NotionEmoji | NotionFile | null;
  parent: NotionParent;
  archived: boolean;
  properties: Record<string, NotionProperty>;
  url: string;
  public_url: string | null;
}

export interface NotionDatabase {
  object: 'database';
  id: string;
  created_time: string;
  last_edited_time: string;
  created_by: { object: 'user'; id: string };
  last_edited_by: { object: 'user'; id: string };
  title: NotionRichText[];
  description: NotionRichText[];
  icon: NotionEmoji | NotionFile | null;
  cover: NotionFile | null;
  properties: Record<string, NotionDatabaseProperty>;
  parent: NotionParent;
  url: string;
  archived: boolean;
  is_inline: boolean;
}

export interface NotionBlock {
  object: 'block';
  id: string;
  parent: NotionParent;
  type: string;
  created_time: string;
  last_edited_time: string;
  created_by: { object: 'user'; id: string };
  last_edited_by: { object: 'user'; id: string };
  has_children: boolean;
  archived: boolean;
  [key: string]: unknown;
}

export interface NotionRichText {
  type: 'text' | 'mention' | 'equation';
  text?: {
    content: string;
    link?: { url: string } | null;
  };
  mention?: {
    type: 'user' | 'page' | 'database' | 'date' | 'link_preview';
    [key: string]: unknown;
  };
  equation?: {
    expression: string;
  };
  annotations: {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
    code: boolean;
    color: string;
  };
  plain_text: string;
  href?: string | null;
}

export interface NotionFile {
  type: 'external' | 'file';
  external?: { url: string };
  file?: { url: string; expiry_time: string };
}

export interface NotionEmoji {
  type: 'emoji';
  emoji: string;
}

export type NotionParent =
  | { type: 'database_id'; database_id: string }
  | { type: 'page_id'; page_id: string }
  | { type: 'workspace'; workspace: true }
  | { type: 'block_id'; block_id: string };

export interface NotionProperty {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface NotionDatabaseProperty {
  id: string;
  name: string;
  type: string;
  [key: string]: unknown;
}

export interface NotionSearchResult {
  object: 'list';
  results: (NotionPage | NotionDatabase)[];
  next_cursor: string | null;
  has_more: boolean;
  type: 'page_or_database';
}

export interface NotionListResult<T> {
  object: 'list';
  results: T[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface NotionQueryFilter {
  property?: string;
  [key: string]: unknown;
}

export interface NotionSort {
  property?: string;
  timestamp?: 'created_time' | 'last_edited_time';
  direction: 'ascending' | 'descending';
}

/*
 * =============================================================================
 * Notion Client
 * =============================================================================
 */

export class NotionClient extends BaseHttpClient {
  constructor(accessToken: string) {
    super(accessToken, NOTION_API_BASE);
  }

  /*
   * ---------------------------------------------------------------------------
   * Users
   * ---------------------------------------------------------------------------
   */

  /**
   * Get current bot user info
   */
  async getMe(): Promise<NotionUser> {
    return this.get<NotionUser>('/users/me');
  }

  /**
   * Get user by ID
   */
  async getUser(userId: string): Promise<NotionUser> {
    return this.get<NotionUser>(`/users/${userId}`);
  }

  /**
   * List all users in the workspace
   */
  async listUsers(startCursor?: string): Promise<NotionListResult<NotionUser>> {
    const params = startCursor ? `?start_cursor=${startCursor}` : '';
    return this.get<NotionListResult<NotionUser>>(`/users${params}`);
  }

  /*
   * ---------------------------------------------------------------------------
   * Pages
   * ---------------------------------------------------------------------------
   */

  /**
   * Retrieve a page by ID
   */
  async getPage(pageId: string): Promise<NotionPage> {
    return this.get<NotionPage>(`/pages/${pageId}`);
  }

  /**
   * Create a new page
   */
  async createPage(params: {
    parent: NotionParent;
    properties: Record<string, unknown>;
    children?: NotionBlock[];
    icon?: NotionEmoji | NotionFile;
    cover?: NotionFile;
  }): Promise<NotionPage> {
    return this.post<NotionPage>('/pages', params);
  }

  /**
   * Update page properties
   */
  async updatePage(
    pageId: string,
    params: {
      properties?: Record<string, unknown>;
      icon?: NotionEmoji | NotionFile | null;
      cover?: NotionFile | null;
      archived?: boolean;
    },
  ): Promise<NotionPage> {
    return this.patch<NotionPage>(`/pages/${pageId}`, params);
  }

  /**
   * Archive (delete) a page
   */
  async archivePage(pageId: string): Promise<NotionPage> {
    return this.updatePage(pageId, { archived: true });
  }

  /*
   * ---------------------------------------------------------------------------
   * Databases
   * ---------------------------------------------------------------------------
   */

  /**
   * Retrieve a database by ID
   */
  async getDatabase(databaseId: string): Promise<NotionDatabase> {
    return this.get<NotionDatabase>(`/databases/${databaseId}`);
  }

  /**
   * Query a database
   */
  async queryDatabase(
    databaseId: string,
    params?: {
      filter?: NotionQueryFilter;
      sorts?: NotionSort[];
      start_cursor?: string;
      page_size?: number;
    },
  ): Promise<NotionListResult<NotionPage>> {
    return this.post<NotionListResult<NotionPage>>(`/databases/${databaseId}/query`, params || {});
  }

  /**
   * Create a new database
   */
  async createDatabase(params: {
    parent: NotionParent;
    title: NotionRichText[];
    properties: Record<string, Omit<NotionDatabaseProperty, 'id' | 'name'>>;
    icon?: NotionEmoji | NotionFile;
    cover?: NotionFile;
    is_inline?: boolean;
  }): Promise<NotionDatabase> {
    return this.post<NotionDatabase>('/databases', params);
  }

  /**
   * Update database properties
   */
  async updateDatabase(
    databaseId: string,
    params: {
      title?: NotionRichText[];
      description?: NotionRichText[];
      properties?: Record<string, Omit<NotionDatabaseProperty, 'id'>>;
      icon?: NotionEmoji | NotionFile | null;
      cover?: NotionFile | null;
      archived?: boolean;
    },
  ): Promise<NotionDatabase> {
    return this.patch<NotionDatabase>(`/databases/${databaseId}`, params);
  }

  /*
   * ---------------------------------------------------------------------------
   * Blocks
   * ---------------------------------------------------------------------------
   */

  /**
   * Retrieve a block by ID
   */
  async getBlock(blockId: string): Promise<NotionBlock> {
    return this.get<NotionBlock>(`/blocks/${blockId}`);
  }

  /**
   * Get child blocks of a block or page
   */
  async getBlockChildren(
    blockId: string,
    startCursor?: string,
    pageSize?: number,
  ): Promise<NotionListResult<NotionBlock>> {
    const params = new URLSearchParams();

    if (startCursor) {
      params.set('start_cursor', startCursor);
    }

    if (pageSize) {
      params.set('page_size', String(pageSize));
    }

    const query = params.toString() ? `?${params}` : '';

    return this.get<NotionListResult<NotionBlock>>(`/blocks/${blockId}/children${query}`);
  }

  /**
   * Append children blocks to a block or page
   */
  async appendBlockChildren(blockId: string, children: Partial<NotionBlock>[]): Promise<NotionListResult<NotionBlock>> {
    return this.patch<NotionListResult<NotionBlock>>(`/blocks/${blockId}/children`, { children });
  }

  /**
   * Update a block
   */
  async updateBlock(blockId: string, params: Partial<NotionBlock>): Promise<NotionBlock> {
    return this.patch<NotionBlock>(`/blocks/${blockId}`, params);
  }

  /**
   * Delete (archive) a block
   */
  async deleteBlock(blockId: string): Promise<NotionBlock> {
    return this.delete<NotionBlock>(`/blocks/${blockId}`);
  }

  /*
   * ---------------------------------------------------------------------------
   * Search
   * ---------------------------------------------------------------------------
   */

  /**
   * Search pages and databases
   */
  async search(params?: {
    query?: string;
    filter?: { property: 'object'; value: 'page' | 'database' };
    sort?: { direction: 'ascending' | 'descending'; timestamp: 'last_edited_time' };
    start_cursor?: string;
    page_size?: number;
  }): Promise<NotionSearchResult> {
    return this.post<NotionSearchResult>('/search', params || {});
  }

  /**
   * Search for pages only
   */
  async searchPages(query?: string, startCursor?: string): Promise<NotionSearchResult> {
    return this.search({
      query,
      filter: { property: 'object', value: 'page' },
      start_cursor: startCursor,
    });
  }

  /**
   * Search for databases only
   */
  async searchDatabases(query?: string, startCursor?: string): Promise<NotionSearchResult> {
    return this.search({
      query,
      filter: { property: 'object', value: 'database' },
      start_cursor: startCursor,
    });
  }

  /*
   * ---------------------------------------------------------------------------
   * Comments
   * ---------------------------------------------------------------------------
   */

  /**
   * Create a comment on a page
   */
  async createComment(params: {
    parent: { page_id: string };
    rich_text: NotionRichText[];
  }): Promise<{ id: string; object: 'comment' }> {
    return this.post('/comments', params);
  }

  /**
   * Get comments for a block or page
   */
  async getComments(
    blockId: string,
    startCursor?: string,
  ): Promise<NotionListResult<{ id: string; object: 'comment'; rich_text: NotionRichText[] }>> {
    const params = new URLSearchParams({ block_id: blockId });

    if (startCursor) {
      params.set('start_cursor', startCursor);
    }

    return this.get(`/comments?${params}`);
  }
}

/*
 * =============================================================================
 * Factory Functions
 * =============================================================================
 */

/**
 * Create a Notion client instance
 */
export function createNotionClient(accessToken: string): NotionClient {
  return new NotionClient(accessToken);
}

/*
 * =============================================================================
 * Utility Functions
 * =============================================================================
 */

/**
 * Extract plain text from rich text array
 */
export function richTextToPlainText(richText: NotionRichText[]): string {
  return richText.map((rt) => rt.plain_text).join('');
}

/**
 * Create a simple text rich text object
 */
export function createRichText(content: string, link?: string): NotionRichText {
  return {
    type: 'text',
    text: {
      content,
      link: link ? { url: link } : null,
    },
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      color: 'default',
    },
    plain_text: content,
    href: link || null,
  };
}

/**
 * Create a paragraph block
 */
export function createParagraphBlock(text: string): Partial<NotionBlock> {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [createRichText(text)],
    },
  };
}

/**
 * Create a heading block
 */
export function createHeadingBlock(text: string, level: 1 | 2 | 3 = 1): Partial<NotionBlock> {
  const type = `heading_${level}` as const;
  return {
    object: 'block',
    type,
    [type]: {
      rich_text: [createRichText(text)],
    },
  };
}

/**
 * Create a bulleted list item block
 */
export function createBulletedListBlock(text: string): Partial<NotionBlock> {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: [createRichText(text)],
    },
  };
}

/**
 * Create a numbered list item block
 */
export function createNumberedListBlock(text: string): Partial<NotionBlock> {
  return {
    object: 'block',
    type: 'numbered_list_item',
    numbered_list_item: {
      rich_text: [createRichText(text)],
    },
  };
}

/**
 * Create a to-do block
 */
export function createTodoBlock(text: string, checked = false): Partial<NotionBlock> {
  return {
    object: 'block',
    type: 'to_do',
    to_do: {
      rich_text: [createRichText(text)],
      checked,
    },
  };
}

/**
 * Create a code block
 */
export function createCodeBlock(code: string, language = 'plain text'): Partial<NotionBlock> {
  return {
    object: 'block',
    type: 'code',
    code: {
      rich_text: [createRichText(code)],
      language,
    },
  };
}

/**
 * Extract page ID from Notion URL
 */
export function parseNotionUrl(url: string): string | null {
  /*
   * Formats:
   * https://www.notion.so/workspace/Page-Name-xxxxx
   * https://www.notion.so/xxxxx
   * https://notion.so/xxxxx?v=yyyy
   */
  const match = url.match(/notion\.so\/(?:[^/]+\/)?([a-f0-9]{32}|[a-f0-9-]{36})/i);

  if (match) {
    return match[1].replace(/-/g, '');
  }

  // Try extracting from query params or hash
  const urlObj = new URL(url);
  const pageId = urlObj.searchParams.get('p') || urlObj.hash.slice(1);

  if (pageId && /^[a-f0-9]{32}$/i.test(pageId.replace(/-/g, ''))) {
    return pageId.replace(/-/g, '');
  }

  return null;
}

/**
 * Format page ID to UUID format (with dashes)
 */
export function formatPageId(pageId: string): string {
  const clean = pageId.replace(/-/g, '');

  if (clean.length !== 32) {
    return pageId;
  }

  return [clean.slice(0, 8), clean.slice(8, 12), clean.slice(12, 16), clean.slice(16, 20), clean.slice(20)].join('-');
}

/**
 * Get page title from page object
 */
export function getPageTitle(page: NotionPage): string {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === 'title') {
      const titleProp = prop as unknown as { type: 'title'; title: NotionRichText[] };
      return richTextToPlainText(titleProp.title);
    }
  }
  return 'Untitled';
}

/**
 * Get database title from database object
 */
export function getDatabaseTitle(database: NotionDatabase): string {
  return richTextToPlainText(database.title);
}
