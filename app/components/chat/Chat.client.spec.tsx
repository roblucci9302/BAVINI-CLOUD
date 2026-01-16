import { describe, expect, it } from 'vitest';
import type { Message } from '~/types/message';
import { isContinuationRequest, isLastResponseIncomplete, getContinuationContext } from './chat-utils';

/**
 * Tests for Chat.client.tsx utility functions
 * These functions handle continuation detection and artifact parsing
 */

describe('Chat utility functions', () => {
  describe('isContinuationRequest', () => {
    describe('English keywords', () => {
      it('should return true for "continue"', () => {
        expect(isContinuationRequest('continue')).toBe(true);
      });

      it('should return true for "go on"', () => {
        expect(isContinuationRequest('go on')).toBe(true);
      });

      it('should return true for "keep going"', () => {
        expect(isContinuationRequest('keep going')).toBe(true);
      });

      it('should return true for "complete"', () => {
        expect(isContinuationRequest('complete')).toBe(true);
      });
    });

    describe('French keywords', () => {
      it('should return true for "continuer"', () => {
        expect(isContinuationRequest('continuer')).toBe(true);
      });

      it('should return true for "poursuit"', () => {
        expect(isContinuationRequest('poursuit')).toBe(true);
      });

      it('should return true for "poursuis"', () => {
        expect(isContinuationRequest('poursuis')).toBe(true);
      });

      it('should return true for "reprend"', () => {
        expect(isContinuationRequest('reprend')).toBe(true);
      });

      it('should return true for "reprends"', () => {
        expect(isContinuationRequest('reprends')).toBe(true);
      });

      it('should return true for "finis"', () => {
        expect(isContinuationRequest('finis')).toBe(true);
      });

      it('should return true for "termine"', () => {
        expect(isContinuationRequest('termine')).toBe(true);
      });
    });

    describe('punctuation handling', () => {
      it('should return true for "continue."', () => {
        expect(isContinuationRequest('continue.')).toBe(true);
      });

      it('should return true for "continue!"', () => {
        expect(isContinuationRequest('continue!')).toBe(true);
      });

      it('should return true for "continue?"', () => {
        expect(isContinuationRequest('continue?')).toBe(true);
      });
    });

    describe('keywords in sentences', () => {
      it('should return true for "please continue"', () => {
        expect(isContinuationRequest('please continue')).toBe(true);
      });

      it('should return true for "continue please"', () => {
        expect(isContinuationRequest('continue please')).toBe(true);
      });

      it('should return true for "can you continue?"', () => {
        expect(isContinuationRequest('can you continue?')).toBe(true);
      });
    });

    describe('case insensitivity', () => {
      it('should return true for "CONTINUE"', () => {
        expect(isContinuationRequest('CONTINUE')).toBe(true);
      });

      it('should return true for "Continue"', () => {
        expect(isContinuationRequest('Continue')).toBe(true);
      });

      it('should return true for "CoNtInUe"', () => {
        expect(isContinuationRequest('CoNtInUe')).toBe(true);
      });
    });

    describe('whitespace handling', () => {
      it('should return true for "  continue  "', () => {
        expect(isContinuationRequest('  continue  ')).toBe(true);
      });

      it('should return true for "\\ncontinue\\n"', () => {
        expect(isContinuationRequest('\ncontinue\n')).toBe(true);
      });
    });

    describe('negative cases', () => {
      it('should return false for "hello"', () => {
        expect(isContinuationRequest('hello')).toBe(false);
      });

      it('should return false for "make a website"', () => {
        expect(isContinuationRequest('make a website')).toBe(false);
      });

      it('should return false for empty string', () => {
        expect(isContinuationRequest('')).toBe(false);
      });

      it('should return false for "discontinued"', () => {
        // Should not match "continue" as substring in middle of word
        expect(isContinuationRequest('discontinued')).toBe(false);
      });
    });
  });

  describe('isLastResponseIncomplete', () => {
    describe('empty and basic cases', () => {
      it('should return incomplete:false for empty messages', () => {
        const result = isLastResponseIncomplete([]);
        expect(result.incomplete).toBe(false);
        expect(result.lastContent).toBe('');
      });

      it('should return incomplete:false for messages without artifacts', () => {
        const messages: Message[] = [
          {
            id: '1',
            role: 'assistant',
            content: 'Hello, how can I help you?',
          },
        ];
        const result = isLastResponseIncomplete(messages);
        expect(result.incomplete).toBe(false);
      });
    });

    describe('complete artifacts', () => {
      it('should return incomplete:false for properly closed boltArtifact', () => {
        const messages: Message[] = [
          {
            id: '1',
            role: 'assistant',
            content: 'Here is the code: <boltArtifact id="test">content</boltArtifact>',
          },
        ];
        const result = isLastResponseIncomplete(messages);
        expect(result.incomplete).toBe(false);
      });

      it('should return incomplete:false for properly closed boltAction', () => {
        const messages: Message[] = [
          {
            id: '1',
            role: 'assistant',
            content: '<boltArtifact id="test"><boltAction type="file">code</boltAction></boltArtifact>',
          },
        ];
        const result = isLastResponseIncomplete(messages);
        expect(result.incomplete).toBe(false);
      });
    });

    describe('incomplete artifacts', () => {
      it('should return incomplete:true for unclosed boltArtifact', () => {
        const messages: Message[] = [
          {
            id: '1',
            role: 'assistant',
            content: 'Hello <boltArtifact id="test">content',
          },
        ];
        const result = isLastResponseIncomplete(messages);
        expect(result.incomplete).toBe(true);
        expect(result.lastContent).toContain('<boltArtifact');
      });

      it('should return incomplete:true for unclosed boltAction', () => {
        const messages: Message[] = [
          {
            id: '1',
            role: 'assistant',
            content: '<boltArtifact id="test"><boltAction type="file">code',
          },
        ];
        const result = isLastResponseIncomplete(messages);
        expect(result.incomplete).toBe(true);
      });

      it('should detect unclosed action even if artifact is closed', () => {
        const messages: Message[] = [
          {
            id: '1',
            role: 'assistant',
            content: '<boltArtifact id="test"><boltAction type="file">code</boltArtifact>',
          },
        ];
        const result = isLastResponseIncomplete(messages);
        expect(result.incomplete).toBe(true);
      });
    });

    describe('message ordering', () => {
      it('should check only the last assistant message', () => {
        const messages: Message[] = [
          {
            id: '1',
            role: 'assistant',
            content: '<boltArtifact id="incomplete">',
          },
          {
            id: '2',
            role: 'user',
            content: 'continue',
          },
          {
            id: '3',
            role: 'assistant',
            content: 'Complete response',
          },
        ];
        const result = isLastResponseIncomplete(messages);
        expect(result.incomplete).toBe(false);
      });

      it('should skip user messages to find last assistant', () => {
        const messages: Message[] = [
          {
            id: '1',
            role: 'assistant',
            content: '<boltArtifact id="incomplete">',
          },
          {
            id: '2',
            role: 'user',
            content: 'continue',
          },
        ];
        const result = isLastResponseIncomplete(messages);
        expect(result.incomplete).toBe(true);
      });

      it('should return false if no assistant messages exist', () => {
        const messages: Message[] = [
          {
            id: '1',
            role: 'user',
            content: 'Hello',
          },
        ];
        const result = isLastResponseIncomplete(messages);
        expect(result.incomplete).toBe(false);
      });
    });
  });

  describe('getContinuationContext', () => {
    describe('artifact ID extraction', () => {
      it('should extract artifactId from boltArtifact tag', () => {
        const content = '<boltArtifact id="my-artifact-123" title="Test">content';
        const result = getContinuationContext(content);
        expect(result.artifactId).toBe('my-artifact-123');
      });

      it('should handle complex artifact IDs with hyphens', () => {
        const content = '<boltArtifact id="project-files-v2" type="bundled">';
        const result = getContinuationContext(content);
        expect(result.artifactId).toBe('project-files-v2');
      });

      it('should handle artifact IDs with underscores', () => {
        const content = '<boltArtifact id="my_artifact_id">';
        const result = getContinuationContext(content);
        expect(result.artifactId).toBe('my_artifact_id');
      });

      it('should handle artifact IDs with numbers', () => {
        const content = '<boltArtifact id="artifact123">';
        const result = getContinuationContext(content);
        expect(result.artifactId).toBe('artifact123');
      });
    });

    describe('no artifact cases', () => {
      it('should return null if no artifactId found', () => {
        const content = 'Just plain text without artifacts';
        const result = getContinuationContext(content);
        expect(result.artifactId).toBeNull();
      });

      it('should return null for empty content', () => {
        const result = getContinuationContext('');
        expect(result.artifactId).toBeNull();
      });

      it('should return null for malformed artifact tag', () => {
        const content = '<boltArtifact title="Test">';
        const result = getContinuationContext(content);
        expect(result.artifactId).toBeNull();
      });
    });

    describe('multiple artifacts', () => {
      it('should return the first artifact ID when multiple exist', () => {
        const content = '<boltArtifact id="first-artifact">content</boltArtifact><boltArtifact id="second-artifact">';
        const result = getContinuationContext(content);
        expect(result.artifactId).toBe('first-artifact');
      });
    });
  });
});
