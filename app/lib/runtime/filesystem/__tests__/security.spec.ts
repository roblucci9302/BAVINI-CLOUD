/**
 * =============================================================================
 * Tests: Path Security (security.ts)
 * =============================================================================
 * FIX 1.4: Tests for path traversal protection and security utilities.
 * =============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
  SecurityError,
  validatePath,
  isValidSecurePath,
  resolveSecurePath,
  sanitizePathForLog,
  isSafeFilename,
  extractSafeFilename,
} from '../security';

describe('SecurityError', () => {
  it('should create error with correct properties', () => {
    const error = new SecurityError('Test message', '/etc/passwd', 'traversal');

    expect(error.message).toBe('Test message');
    expect(error.path).toBe('/etc/passwd');
    expect(error.violation).toBe('traversal');
    expect(error.name).toBe('SecurityError');
  });
});

describe('validatePath', () => {
  describe('valid paths', () => {
    it('should accept simple absolute paths', () => {
      expect(validatePath('/home/user/file.txt')).toBe('/home/user/file.txt');
      expect(validatePath('/project/src/index.ts')).toBe('/project/src/index.ts');
    });

    it('should accept paths within allowed root', () => {
      expect(validatePath('/home/user/docs/file.txt', '/home')).toBe('/home/user/docs/file.txt');
      expect(validatePath('/home/user', '/home')).toBe('/home/user');
    });

    it('should normalize paths with redundant slashes', () => {
      expect(validatePath('/home//user///file.txt')).toMatch(/\/home\/user\/file\.txt/);
    });

    it('should handle root path', () => {
      expect(validatePath('/')).toBe('/');
    });
  });

  describe('path traversal attacks', () => {
    it('should reject paths starting with ..', () => {
      expect(() => validatePath('../etc/passwd')).toThrow(SecurityError);
      expect(() => validatePath('..\\etc\\passwd')).toThrow(SecurityError);
    });

    it('should reject paths containing /../', () => {
      expect(() => validatePath('/home/../etc/passwd')).toThrow(SecurityError);
      expect(() => validatePath('/home/user/../../../etc/passwd')).toThrow(SecurityError);
    });

    it('should reject paths ending with /..', () => {
      expect(() => validatePath('/home/user/..')).toThrow(SecurityError);
    });

    it('should reject path that is just ..', () => {
      expect(() => validatePath('..')).toThrow(SecurityError);
    });

    it('should throw with traversal violation type', () => {
      try {
        validatePath('../etc/passwd');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SecurityError);
        expect((error as SecurityError).violation).toBe('traversal');
      }
    });
  });

  describe('null byte injection', () => {
    it('should reject paths with null bytes', () => {
      expect(() => validatePath('/home/user\0.txt')).toThrow(SecurityError);
      expect(() => validatePath('/etc/passwd\0.txt')).toThrow(SecurityError);
    });

    it('should throw with null_byte violation type', () => {
      try {
        validatePath('/home\0/user');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SecurityError);
        expect((error as SecurityError).violation).toBe('null_byte');
      }
    });
  });

  describe('path escape detection', () => {
    it('should reject paths that escape allowed root after normalization', () => {
      // These paths might normalize to something outside the root
      expect(() => validatePath('/tmp/file.txt', '/home')).toThrow(SecurityError);
      expect(() => validatePath('/etc/passwd', '/home/user')).toThrow(SecurityError);
    });
  });
});

describe('isValidSecurePath', () => {
  it('should return true for valid paths', () => {
    expect(isValidSecurePath('/home/user/file.txt')).toBe(true);
    expect(isValidSecurePath('/project/src/index.ts', '/project')).toBe(true);
  });

  it('should return false for invalid paths', () => {
    expect(isValidSecurePath('../etc/passwd')).toBe(false);
    expect(isValidSecurePath('/home\0/user')).toBe(false);
    expect(isValidSecurePath('/etc/passwd', '/home')).toBe(false);
  });
});

describe('resolveSecurePath', () => {
  it('should resolve absolute paths', () => {
    expect(resolveSecurePath('/home/user/file.txt', '/project')).toBe('/home/user/file.txt');
  });

  it('should resolve relative paths against cwd', () => {
    const result = resolveSecurePath('file.txt', '/home/user');
    expect(result).toBe('/home/user/file.txt');
  });

  it('should reject traversal in relative paths', () => {
    expect(() => resolveSecurePath('../../../etc/passwd', '/home/user')).toThrow(SecurityError);
  });

  it('should respect allowed root', () => {
    expect(() => resolveSecurePath('/etc/passwd', '/home', '/home')).toThrow(SecurityError);
  });
});

describe('sanitizePathForLog', () => {
  it('should replace control characters', () => {
    expect(sanitizePathForLog('/home\0/user')).toBe('/home?/user');
    expect(sanitizePathForLog('/home\x1F/user')).toBe('/home?/user');
  });

  it('should truncate long paths', () => {
    const longPath = '/home/user/' + 'a'.repeat(200);
    const sanitized = sanitizePathForLog(longPath, 100);
    expect(sanitized.length).toBe(100);
    expect(sanitized.endsWith('...')).toBe(true);
  });

  it('should leave short paths unchanged', () => {
    expect(sanitizePathForLog('/home/user')).toBe('/home/user');
  });
});

describe('isSafeFilename', () => {
  describe('safe filenames', () => {
    it('should accept normal filenames', () => {
      expect(isSafeFilename('file.txt')).toBe(true);
      expect(isSafeFilename('my-file.ts')).toBe(true);
      expect(isSafeFilename('index.html')).toBe(true);
      expect(isSafeFilename('.gitignore')).toBe(true);
    });
  });

  describe('unsafe filenames', () => {
    it('should reject filenames with /', () => {
      expect(isSafeFilename('path/file.txt')).toBe(false);
      expect(isSafeFilename('/file.txt')).toBe(false);
    });

    it('should reject filenames with backslash', () => {
      expect(isSafeFilename('path\\file.txt')).toBe(false);
    });

    it('should reject . and ..', () => {
      expect(isSafeFilename('.')).toBe(false);
      expect(isSafeFilename('..')).toBe(false);
    });

    it('should reject filenames with null bytes', () => {
      expect(isSafeFilename('file\0.txt')).toBe(false);
    });

    it('should reject empty filename', () => {
      expect(isSafeFilename('')).toBe(false);
    });
  });
});

describe('extractSafeFilename', () => {
  it('should extract filename from path', () => {
    expect(extractSafeFilename('/home/user/file.txt')).toBe('file.txt');
    expect(extractSafeFilename('/project/src/index.ts')).toBe('index.ts');
  });

  it('should return null for unsafe filenames', () => {
    expect(extractSafeFilename('/home/user/')).toBe(null);
    expect(extractSafeFilename('/home/user/..')).toBe(null);
  });

  it('should handle simple filename', () => {
    expect(extractSafeFilename('file.txt')).toBe('file.txt');
  });
});
