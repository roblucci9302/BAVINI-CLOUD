/**
 * Tests for Prompt and Tool Cache
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedSystemPrompt,
  getCachedToolConversion,
  invalidatePromptCache,
  invalidateToolCache,
  getCacheStats,
  resetCaches,
  getPromptCacheHitRate,
  getToolCacheHitRate,
} from './prompt-cache';
import type { ToolDefinition } from '../types';

describe('prompt-cache', () => {
  beforeEach(() => {
    resetCaches();
  });

  describe('getCachedSystemPrompt', () => {
    it('should cache and return prompt', () => {
      let callCount = 0;
      const computeFn = () => {
        callCount++;
        return 'System prompt content';
      };

      const result1 = getCachedSystemPrompt('test-agent', computeFn);
      const result2 = getCachedSystemPrompt('test-agent', computeFn);

      expect(result1).toBe('System prompt content');
      expect(result2).toBe('System prompt content');
      expect(callCount).toBe(1); // Only computed once
    });

    it('should cache different prompts for different agents', () => {
      const prompt1 = getCachedSystemPrompt('agent1', () => 'Prompt 1');
      const prompt2 = getCachedSystemPrompt('agent2', () => 'Prompt 2');

      expect(prompt1).toBe('Prompt 1');
      expect(prompt2).toBe('Prompt 2');
    });

    it('should track cache hits and misses', () => {
      getCachedSystemPrompt('agent', () => 'Prompt');
      getCachedSystemPrompt('agent', () => 'Prompt');
      getCachedSystemPrompt('agent', () => 'Prompt');

      const stats = getCacheStats();
      expect(stats.promptMisses).toBe(1);
      expect(stats.promptHits).toBe(2);
    });
  });

  describe('invalidatePromptCache', () => {
    it('should invalidate specific agent prompt', () => {
      let callCount = 0;
      const computeFn = () => {
        callCount++;
        return `Prompt ${callCount}`;
      };

      getCachedSystemPrompt('agent', computeFn);
      invalidatePromptCache('agent');
      const result = getCachedSystemPrompt('agent', computeFn);

      expect(result).toBe('Prompt 2');
      expect(callCount).toBe(2);
    });

    it('should invalidate all prompts when no agent specified', () => {
      getCachedSystemPrompt('agent1', () => 'Prompt 1');
      getCachedSystemPrompt('agent2', () => 'Prompt 2');

      invalidatePromptCache();

      const stats = getCacheStats();
      expect(stats.promptCacheSize).toBe(0);
    });
  });

  describe('getCachedToolConversion', () => {
    const mockTools: ToolDefinition[] = [
      {
        name: 'tool1',
        description: 'Tool 1',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'tool2',
        description: 'Tool 2',
        inputSchema: { type: 'object', properties: {} },
      },
    ];

    it('should cache and return converted tools', () => {
      let callCount = 0;
      const convertFn = (tools: ToolDefinition[]) => {
        callCount++;
        return tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as any,
        }));
      };

      const result1 = getCachedToolConversion(mockTools, convertFn);
      const result2 = getCachedToolConversion(mockTools, convertFn);

      expect(result1).toHaveLength(2);
      expect(result2).toHaveLength(2);
      expect(callCount).toBe(1); // Only converted once
    });

    it('should return empty array for empty tools', () => {
      const result = getCachedToolConversion([], () => []);
      expect(result).toEqual([]);
    });

    it('should cache based on tool names', () => {
      let callCount = 0;
      const convertFn = () => {
        callCount++;
        return [];
      };

      // Same tools should hit cache
      getCachedToolConversion(mockTools, convertFn);
      getCachedToolConversion(mockTools, convertFn);

      expect(callCount).toBe(1);

      // Different tools should miss cache
      getCachedToolConversion([mockTools[0]], convertFn);

      expect(callCount).toBe(2);
    });

    it('should track cache hits and misses', () => {
      const convertFn = () => [];

      getCachedToolConversion(mockTools, convertFn);
      getCachedToolConversion(mockTools, convertFn);
      getCachedToolConversion(mockTools, convertFn);

      const stats = getCacheStats();
      expect(stats.toolMisses).toBe(1);
      expect(stats.toolHits).toBe(2);
    });
  });

  describe('invalidateToolCache', () => {
    const mockTools: ToolDefinition[] = [
      {
        name: 'tool1',
        description: 'Tool 1',
        inputSchema: { type: 'object', properties: {} },
      },
    ];

    it('should invalidate specific tools', () => {
      let callCount = 0;
      const convertFn = () => {
        callCount++;
        return [];
      };

      getCachedToolConversion(mockTools, convertFn);
      invalidateToolCache(mockTools);
      getCachedToolConversion(mockTools, convertFn);

      expect(callCount).toBe(2);
    });

    it('should invalidate all tools when none specified', () => {
      getCachedToolConversion(
        [{ name: 't1', description: '', inputSchema: { type: 'object', properties: {} } }],
        () => [],
      );
      getCachedToolConversion(
        [{ name: 't2', description: '', inputSchema: { type: 'object', properties: {} } }],
        () => [],
      );

      invalidateToolCache();

      const stats = getCacheStats();
      expect(stats.toolCacheSize).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('should return current cache statistics', () => {
      getCachedSystemPrompt('agent1', () => 'Prompt');
      getCachedSystemPrompt('agent1', () => 'Prompt');
      getCachedSystemPrompt('agent2', () => 'Prompt');

      const stats = getCacheStats();

      expect(stats.promptHits).toBe(1);
      expect(stats.promptMisses).toBe(2);
      expect(stats.promptCacheSize).toBe(2);
      expect(stats.toolCacheSize).toBe(0);
    });
  });

  describe('resetCaches', () => {
    it('should clear all caches and reset stats', () => {
      getCachedSystemPrompt('agent', () => 'Prompt');
      getCachedToolConversion(
        [{ name: 'tool', description: '', inputSchema: { type: 'object', properties: {} } }],
        () => [],
      );

      resetCaches();

      const stats = getCacheStats();
      expect(stats.promptHits).toBe(0);
      expect(stats.promptMisses).toBe(0);
      expect(stats.toolHits).toBe(0);
      expect(stats.toolMisses).toBe(0);
      expect(stats.promptCacheSize).toBe(0);
      expect(stats.toolCacheSize).toBe(0);
    });
  });

  describe('getPromptCacheHitRate', () => {
    it('should return 0 when no requests', () => {
      expect(getPromptCacheHitRate()).toBe(0);
    });

    it('should calculate correct hit rate', () => {
      getCachedSystemPrompt('agent', () => 'Prompt'); // miss
      getCachedSystemPrompt('agent', () => 'Prompt'); // hit
      getCachedSystemPrompt('agent', () => 'Prompt'); // hit
      getCachedSystemPrompt('agent', () => 'Prompt'); // hit

      // 3 hits / 4 total = 75%
      expect(getPromptCacheHitRate()).toBe(75);
    });
  });

  describe('getToolCacheHitRate', () => {
    it('should return 0 when no requests', () => {
      expect(getToolCacheHitRate()).toBe(0);
    });

    it('should calculate correct hit rate', () => {
      const tools: ToolDefinition[] = [
        { name: 'tool', description: '', inputSchema: { type: 'object', properties: {} } },
      ];

      getCachedToolConversion(tools, () => []); // miss
      getCachedToolConversion(tools, () => []); // hit

      // 1 hit / 2 total = 50%
      expect(getToolCacheHitRate()).toBe(50);
    });
  });
});
