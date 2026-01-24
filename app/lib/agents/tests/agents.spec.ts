/**
 * Tests pour le système d'agents BAVINI - Phase 1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentRegistry } from '../core/agent-registry';
import { ExploreAgent, createExploreAgent } from '../agents/explore-agent';
import { Orchestrator, createOrchestrator } from '../agents/orchestrator';
import { createMockFileSystem } from '../utils/mock-filesystem';
import type { Task, AgentStatus } from '../types';

// Mock du client Anthropic
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Test response from Claude',
            },
          ],
          model: 'claude-sonnet-4-5-20250929',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
          },
        }),
      },
    })),
  };
});

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    AgentRegistry.resetInstance();
    registry = AgentRegistry.getInstance();
  });

  it('should be a singleton', () => {
    const registry2 = AgentRegistry.getInstance();
    expect(registry).toBe(registry2);
  });

  it('should register an agent', () => {
    const agent = createExploreAgent();
    registry.register(agent);

    expect(registry.has('explore')).toBe(true);
    expect(registry.get('explore')).toBe(agent);
  });

  it('should return undefined for unregistered agent', () => {
    expect(registry.get('explore')).toBeUndefined();
    expect(registry.has('explore')).toBe(false);
  });

  it('should return all agents', () => {
    const explore = createExploreAgent();
    const orchestrator = createOrchestrator();

    registry.register(explore);
    registry.register(orchestrator);

    const all = registry.getAll();
    expect(all.size).toBe(2);
    expect(all.has('explore')).toBe(true);
    expect(all.has('orchestrator')).toBe(true);
  });

  it('should return available agents', () => {
    const explore = createExploreAgent();
    registry.register(explore);

    const available = registry.getAvailable();
    expect(available.length).toBe(1);
    expect(available[0].getName()).toBe('explore');
  });

  it('should provide stats', () => {
    const explore = createExploreAgent();
    registry.register(explore);

    const stats = registry.getStats();
    expect(stats.totalAgents).toBe(1);
    expect(stats.availableAgents).toBe(1);
    expect(stats.busyAgents).toBe(0);
  });

  it('should unregister an agent', () => {
    const explore = createExploreAgent();
    registry.register(explore);

    expect(registry.has('explore')).toBe(true);

    const result = registry.unregister('explore');
    expect(result).toBe(true);
    expect(registry.has('explore')).toBe(false);
  });

  it('should clear all agents', () => {
    const explore = createExploreAgent();
    const orchestrator = createOrchestrator();

    registry.register(explore);
    registry.register(orchestrator);

    expect(registry.getAll().size).toBe(2);

    registry.clear();
    expect(registry.getAll().size).toBe(0);
  });
});

describe('ExploreAgent', () => {
  let agent: ExploreAgent;
  let mockFs: ReturnType<typeof createMockFileSystem>;

  beforeEach(() => {
    agent = createExploreAgent();
    mockFs = createMockFileSystem({
      'package.json': JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          react: '^18.0.0',
        },
      }),
      'src/index.ts': 'export const hello = "world";',
      'src/components/Button.tsx': 'export function Button() { return <button>Click</button>; }',
      'README.md': '# Test Project\n\nThis is a test.',
    });
    agent.setFileSystem(mockFs);
  });

  it('should have correct configuration', () => {
    expect(agent.getName()).toBe('explore');
    expect(agent.getStatus()).toBe('idle');
    expect(agent.isAvailable()).toBe(true);
  });

  it('should return error without FileSystem', async () => {
    const agentNoFs = createExploreAgent();

    const task: Task = {
      id: 'test-1',
      type: 'explore',
      prompt: 'Find package.json',
      status: 'pending',
      createdAt: new Date(),
    };

    const result = await agentNoFs.run(task, 'fake-api-key');

    expect(result.success).toBe(false);
    expect(result.output).toContain('FileSystem not initialized');
  });

  it('should have description for orchestrator', () => {
    const description = agent.getDescription();
    expect(description).toContain('exploration');
    expect(description.toLowerCase()).toContain('lecture');
  });
});

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    AgentRegistry.resetInstance();
    orchestrator = createOrchestrator();
  });

  it('should have correct configuration', () => {
    expect(orchestrator.getName()).toBe('orchestrator');
    expect(orchestrator.getStatus()).toBe('idle');
    expect(orchestrator.isAvailable()).toBe(true);
  });

  it('should have description', () => {
    const description = orchestrator.getDescription();
    expect(description).toContain('coordonne');
    expect(description).toContain('agents');
  });
});

describe('MockFileSystem', () => {
  let mockFs: ReturnType<typeof createMockFileSystem>;

  beforeEach(() => {
    mockFs = createMockFileSystem({
      'file1.txt': 'content1',
      'folder/file2.txt': 'content2',
      'folder/subfolder/file3.txt': 'content3',
    });
  });

  it('should read files', async () => {
    const content = await mockFs.readFile('file1.txt');
    expect(content).toBe('content1');
  });

  it('should read nested files', async () => {
    const content = await mockFs.readFile('folder/file2.txt');
    expect(content).toBe('content2');
  });

  it('should throw for non-existent files', async () => {
    await expect(mockFs.readFile('nonexistent.txt')).rejects.toThrow('File not found');
  });

  it('should list directory contents', async () => {
    const entries = await mockFs.readdir('folder');
    const names = entries.map((e) => e.name);

    expect(names).toContain('file2.txt');
    expect(names).toContain('subfolder');
  });

  it('should list root directory', async () => {
    const entries = await mockFs.readdir('');
    const names = entries.map((e) => e.name);

    expect(names).toContain('file1.txt');
    expect(names).toContain('folder');
  });

  it('should check file existence', async () => {
    expect(await mockFs.exists('file1.txt')).toBe(true);
    expect(await mockFs.exists('folder')).toBe(true);
    expect(await mockFs.exists('nonexistent.txt')).toBe(false);
  });

  it('should identify directories', async () => {
    const entries = await mockFs.readdir('');
    const folder = entries.find((e) => e.name === 'folder');
    const file = entries.find((e) => e.name === 'file1.txt');

    expect(folder?.isDirectory).toBe(true);
    expect(file?.isDirectory).toBe(false);
  });
});

describe('Integration', () => {
  it('should register multiple agents', () => {
    AgentRegistry.resetInstance();

    const registry = AgentRegistry.getInstance();

    const explore = createExploreAgent();
    const orchestrator = createOrchestrator();

    registry.register(explore);
    registry.register(orchestrator);

    expect(registry.getAll().size).toBe(2);
    expect(registry.getNames()).toContain('explore');
    expect(registry.getNames()).toContain('orchestrator');
  });
});
