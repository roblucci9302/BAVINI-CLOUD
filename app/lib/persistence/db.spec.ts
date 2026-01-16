import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Message } from '~/types/message';

// mock PGlite instance
const mockPGliteInstance = {
  waitReady: Promise.resolve(),
  exec: vi.fn().mockResolvedValue(undefined),
  query: vi.fn().mockResolvedValue({ rows: [] }),
  close: vi.fn().mockResolvedValue(undefined),
};

// mock pglite module
vi.mock('./pglite', () => ({
  initPGlite: vi.fn().mockResolvedValue(mockPGliteInstance),
  getPGlite: vi.fn().mockResolvedValue(mockPGliteInstance),
}));

// mock migration module
vi.mock('./migration', () => ({
  migrateFromIndexedDB: vi.fn().mockResolvedValue({ migrated: 0, errors: 0 }),
}));

// mock logger
vi.mock('~/utils/logger', () => ({
  createScopedLogger: vi.fn(() => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('Database Layer', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('openDatabase', () => {
    it('should initialize PGlite database', async () => {
      const { openDatabase } = await import('./db');

      const db = await openDatabase();

      expect(db).toBeDefined();
    });

    it('should run migration after init', async () => {
      const { openDatabase } = await import('./db');
      const { migrateFromIndexedDB } = await import('./migration');

      await openDatabase();

      expect(migrateFromIndexedDB).toHaveBeenCalled();
    });
  });

  describe('getAll', () => {
    it('should return all chats from PGlite', async () => {
      const { openDatabase, getAll } = await import('./db');

      const mockChats = [
        {
          id: '1',
          url_id: 'chat-1',
          description: 'Test chat',
          messages: '[]',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockPGliteInstance.query.mockResolvedValueOnce({ rows: mockChats });

      const db = await openDatabase();
      const chats = await getAll(db!);

      expect(chats).toHaveLength(1);
      expect(chats[0].id).toBe('1');
      expect(chats[0].urlId).toBe('chat-1');
    });

    it('should parse JSON messages', async () => {
      const { openDatabase, getAll } = await import('./db');

      const mockMessages: Message[] = [{ id: '1', role: 'user', content: 'Hello' }];
      const mockChats = [
        {
          id: '1',
          url_id: null,
          description: null,
          messages: JSON.stringify(mockMessages),
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockPGliteInstance.query.mockResolvedValueOnce({ rows: mockChats });

      const db = await openDatabase();
      const chats = await getAll(db!);

      expect(chats[0].messages).toEqual(mockMessages);
    });

    it('should return empty array when no chats', async () => {
      const { openDatabase, getAll } = await import('./db');

      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [] });

      const db = await openDatabase();
      const chats = await getAll(db!);

      expect(chats).toEqual([]);
    });
  });

  describe('setMessages', () => {
    it('should insert new chat', async () => {
      const { openDatabase, setMessages } = await import('./db');

      const db = await openDatabase();
      const messages: Message[] = [{ id: '1', role: 'user', content: 'Hello' }];

      await setMessages(db!, '1', messages, 'chat-1', 'Test chat');

      expect(mockPGliteInstance.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO chats'),
        expect.arrayContaining(['1', 'chat-1', 'Test chat', JSON.stringify(messages)]),
      );
    });

    it('should update existing chat with ON CONFLICT', async () => {
      const { openDatabase, setMessages } = await import('./db');

      const db = await openDatabase();
      const messages: Message[] = [{ id: '1', role: 'user', content: 'Updated' }];

      await setMessages(db!, '1', messages);

      expect(mockPGliteInstance.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'), expect.any(Array));
    });

    it('should handle null urlId and description', async () => {
      const { openDatabase, setMessages } = await import('./db');

      const db = await openDatabase();

      await setMessages(db!, '1', []);

      expect(mockPGliteInstance.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['1', null, null]),
      );
    });
  });

  describe('getMessages', () => {
    it('should get chat by id first', async () => {
      const { openDatabase, getMessages } = await import('./db');

      const mockChat = {
        id: '1',
        url_id: 'chat-1',
        description: 'Test',
        messages: '[]',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [mockChat] });

      const db = await openDatabase();
      const chat = await getMessages(db!, '1');

      expect(chat.id).toBe('1');
    });

    it('should fallback to urlId if id not found', async () => {
      const { openDatabase, getMessages } = await import('./db');

      const mockChat = {
        id: '1',
        url_id: 'my-chat',
        description: 'Test',
        messages: '[]',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // first query (by id) returns nothing, second query (by url_id) returns the chat
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [] });
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [mockChat] });

      const db = await openDatabase();
      const chat = await getMessages(db!, 'my-chat');

      expect(chat.urlId).toBe('my-chat');
    });
  });

  describe('getMessagesById', () => {
    it('should query by id', async () => {
      const { openDatabase, getMessagesById } = await import('./db');

      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [] });

      const db = await openDatabase();
      await getMessagesById(db!, '123');

      expect(mockPGliteInstance.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1'), ['123']);
    });

    it('should return undefined when chat not found', async () => {
      const { openDatabase, getMessagesById } = await import('./db');

      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [] });

      const db = await openDatabase();
      const result = await getMessagesById(db!, 'nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('getMessagesByUrlId', () => {
    it('should query by url_id', async () => {
      const { openDatabase, getMessagesByUrlId } = await import('./db');

      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [] });

      const db = await openDatabase();
      await getMessagesByUrlId(db!, 'my-chat');

      expect(mockPGliteInstance.query).toHaveBeenCalledWith(expect.stringContaining('WHERE url_id = $1'), ['my-chat']);
    });

    it('should return undefined when chat not found by urlId', async () => {
      const { openDatabase, getMessagesByUrlId } = await import('./db');

      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [] });

      const db = await openDatabase();
      const result = await getMessagesByUrlId(db!, 'nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('deleteById', () => {
    it('should delete chat by id', async () => {
      const { openDatabase, deleteById } = await import('./db');

      const db = await openDatabase();
      await deleteById(db!, '123');

      expect(mockPGliteInstance.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM chats WHERE id = $1'),
        ['123'],
      );
    });
  });

  describe('getNextId', () => {
    it('should return next available id', async () => {
      const { openDatabase, getNextId } = await import('./db');

      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [{ max_id: '5' }] });

      const db = await openDatabase();
      const nextId = await getNextId(db!);

      expect(nextId).toBe('6');
    });

    it('should return 1 when no chats exist', async () => {
      const { openDatabase, getNextId } = await import('./db');

      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [{ max_id: null }] });

      const db = await openDatabase();
      const nextId = await getNextId(db!);

      expect(nextId).toBe('1');
    });
  });

  describe('getUrlId', () => {
    it('should return id if not taken', async () => {
      const { openDatabase, getUrlId } = await import('./db');

      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [] });

      const db = await openDatabase();
      const urlId = await getUrlId(db!, 'my-project');

      expect(urlId).toBe('my-project');
    });

    it('should append number if id is taken', async () => {
      const { openDatabase, getUrlId } = await import('./db');

      mockPGliteInstance.query.mockResolvedValueOnce({
        rows: [{ url_id: 'my-project' }],
      });

      const db = await openDatabase();
      const urlId = await getUrlId(db!, 'my-project');

      expect(urlId).toBe('my-project-2');
    });

    it('should increment number until unique', async () => {
      const { openDatabase, getUrlId } = await import('./db');

      mockPGliteInstance.query.mockResolvedValueOnce({
        rows: [{ url_id: 'my-project' }, { url_id: 'my-project-2' }, { url_id: 'my-project-3' }],
      });

      const db = await openDatabase();
      const urlId = await getUrlId(db!, 'my-project');

      expect(urlId).toBe('my-project-4');
    });
  });
});
