import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// mock pyodide module
const mockPyodideInstance = {
  loadPackage: vi.fn().mockResolvedValue(undefined),
  runPython: vi.fn().mockReturnValue(42),
  runPythonAsync: vi.fn().mockResolvedValue(''),
  pyimport: vi.fn().mockReturnValue({
    install: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockReturnValue([]),
  }),
};

vi.mock('pyodide', () => ({
  loadPyodide: vi.fn().mockResolvedValue(mockPyodideInstance),
}));

vi.mock('~/utils/logger', () => ({
  createScopedLogger: vi.fn(() => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('Pyodide Wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(async () => {
    const { closePyodide } = await import('./index');
    closePyodide();
  });

  describe('initPyodide', () => {
    it('should initialize Pyodide with correct indexURL', async () => {
      const { loadPyodide } = await import('pyodide');
      const { initPyodide } = await import('./index');

      await initPyodide();

      expect(loadPyodide).toHaveBeenCalledWith({
        indexURL: '/assets/pyodide/',
      });
    });

    it('should return same instance on subsequent calls', async () => {
      const { initPyodide } = await import('./index');

      const instance1 = await initPyodide();
      const instance2 = await initPyodide();

      expect(instance1).toBe(instance2);
    });

    it('should handle concurrent initialization', async () => {
      const { loadPyodide } = await import('pyodide');
      const { initPyodide } = await import('./index');

      const [instance1, instance2] = await Promise.all([initPyodide(), initPyodide()]);

      expect(instance1).toBe(instance2);
      expect(loadPyodide).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPyodide', () => {
    it('should throw if not initialized', async () => {
      const { getPyodide } = await import('./index');

      expect(() => getPyodide()).toThrow('Pyodide not initialized');
    });

    it('should return instance after initialization', async () => {
      const { initPyodide, getPyodide } = await import('./index');

      await initPyodide();

      const instance = getPyodide();

      expect(instance).toBeDefined();
    });
  });

  describe('isPyodideReady', () => {
    it('should return false before initialization', async () => {
      const { isPyodideReady } = await import('./index');

      expect(isPyodideReady()).toBe(false);
    });

    it('should return true after initialization', async () => {
      const { initPyodide, isPyodideReady } = await import('./index');

      await initPyodide();

      expect(isPyodideReady()).toBe(true);
    });
  });

  describe('installPackages', () => {
    it('should load micropip before installing', async () => {
      const { initPyodide, installPackages } = await import('./index');

      await initPyodide();
      await installPackages(['numpy']);

      expect(mockPyodideInstance.loadPackage).toHaveBeenCalledWith('micropip');
    });

    it('should install each package', async () => {
      const { initPyodide, installPackages } = await import('./index');

      const mockInstall = vi.fn().mockResolvedValue(undefined);
      mockPyodideInstance.pyimport.mockReturnValue({ install: mockInstall });

      await initPyodide();
      await installPackages(['numpy', 'pandas']);

      expect(mockInstall).toHaveBeenCalledWith('numpy');
      expect(mockInstall).toHaveBeenCalledWith('pandas');
    });

    it('should skip if packages array is empty', async () => {
      const { initPyodide, installPackages } = await import('./index');

      await initPyodide();
      await installPackages([]);

      expect(mockPyodideInstance.loadPackage).not.toHaveBeenCalled();
    });

    it('should throw on install failure', async () => {
      const { initPyodide, installPackages } = await import('./index');

      const mockInstall = vi.fn().mockRejectedValue(new Error('Package not found'));
      mockPyodideInstance.pyimport.mockReturnValue({ install: mockInstall });

      await initPyodide();

      await expect(installPackages(['nonexistent-package'])).rejects.toThrow('Package not found');
    });
  });

  describe('runPython', () => {
    it('should execute Python code', async () => {
      const { initPyodide, runPython } = await import('./index');

      mockPyodideInstance.runPythonAsync.mockResolvedValue('test result');

      await initPyodide();

      const result = await runPython('print("hello")');

      expect(result).toBeDefined();
      expect(mockPyodideInstance.runPythonAsync).toHaveBeenCalled();
    });

    it('should capture stdout', async () => {
      const { initPyodide, runPython } = await import('./index');

      // mock: first call is for setup, then code, then getvalue calls
      mockPyodideInstance.runPythonAsync
        .mockResolvedValueOnce(undefined) // setup
        .mockResolvedValueOnce(undefined) // code execution
        .mockResolvedValueOnce('Hello, World!') // stdout.getvalue()
        .mockResolvedValueOnce('') // stderr.getvalue()
        .mockResolvedValueOnce(undefined); // restore

      await initPyodide();

      const result = await runPython('print("Hello, World!")');

      expect(result.stdout).toBe('Hello, World!');
    });

    it('should capture stderr on error', async () => {
      const { initPyodide, runPython } = await import('./index');

      mockPyodideInstance.runPythonAsync
        .mockResolvedValueOnce(undefined) // setup
        .mockRejectedValueOnce(new Error('SyntaxError')) // code execution fails
        .mockResolvedValueOnce('') // stdout.getvalue()
        .mockResolvedValueOnce('SyntaxError: invalid syntax') // stderr.getvalue()
        .mockResolvedValueOnce(undefined); // restore

      await initPyodide();

      const result = await runPython('invalid python code !!!');

      expect(result.result).toBeNull();
      expect(result.stderr).toContain('SyntaxError');
    });
  });

  describe('runPythonSync', () => {
    it('should execute Python code synchronously', async () => {
      const { initPyodide, runPythonSync } = await import('./index');

      mockPyodideInstance.runPython.mockReturnValue(42);

      await initPyodide();

      const result = runPythonSync('1 + 1');

      expect(result).toBe(42);
      expect(mockPyodideInstance.runPython).toHaveBeenCalledWith('1 + 1');
    });

    it('should throw if Pyodide not initialized', async () => {
      const { runPythonSync } = await import('./index');

      expect(() => runPythonSync('1 + 1')).toThrow('Pyodide not initialized');
    });
  });

  describe('isPackageBuiltin', () => {
    it('should return true for installed package', async () => {
      const { initPyodide, isPackageBuiltin } = await import('./index');

      mockPyodideInstance.runPythonAsync.mockResolvedValue(true);

      await initPyodide();

      const result = await isPackageBuiltin('numpy');

      expect(result).toBe(true);
    });

    it('should return false for non-installed package', async () => {
      const { initPyodide, isPackageBuiltin } = await import('./index');

      mockPyodideInstance.runPythonAsync.mockResolvedValue(false);

      await initPyodide();

      const result = await isPackageBuiltin('unknown-package');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      const { initPyodide, isPackageBuiltin } = await import('./index');

      mockPyodideInstance.runPythonAsync.mockRejectedValue(new Error('micropip not loaded'));

      await initPyodide();

      const result = await isPackageBuiltin('numpy');

      expect(result).toBe(false);
    });
  });

  describe('closePyodide', () => {
    it('should reset instance', async () => {
      const { initPyodide, closePyodide, isPyodideReady } = await import('./index');

      await initPyodide();
      expect(isPyodideReady()).toBe(true);

      closePyodide();
      expect(isPyodideReady()).toBe(false);
    });

    it('should allow reinitialization after close', async () => {
      const { loadPyodide } = await import('pyodide');
      const { initPyodide, closePyodide } = await import('./index');

      await initPyodide();
      closePyodide();
      await initPyodide();

      expect(loadPyodide).toHaveBeenCalledTimes(2);
    });
  });

  describe('runPythonWithTimeout', () => {
    it('should execute Python code within timeout', async () => {
      const { initPyodide, runPythonWithTimeout } = await import('./index');

      mockPyodideInstance.runPythonAsync
        .mockResolvedValueOnce(undefined) // setup
        .mockResolvedValueOnce('result') // code execution
        .mockResolvedValueOnce('output') // stdout
        .mockResolvedValueOnce('') // stderr
        .mockResolvedValueOnce(undefined); // restore

      await initPyodide();

      const result = await runPythonWithTimeout('print("hello")', 5000);

      expect(result.stdout).toBe('output');
    });

    it('should use default timeout from EXECUTION_LIMITS', async () => {
      const { initPyodide, runPythonWithTimeout } = await import('./index');

      mockPyodideInstance.runPythonAsync
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce('result')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(undefined);

      await initPyodide();

      // Should not throw with default timeout
      await expect(runPythonWithTimeout('1+1')).resolves.toBeDefined();
    });
  });
});
