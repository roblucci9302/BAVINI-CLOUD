import { describe, expect, it, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import {
  InspectSiteTool,
  CompareSitesTool,
  createInspectToolHandlers,
  INSPECT_TOOLS,
  type ScreenshotServiceInterface,
} from './inspect-tools';

// Polyfill btoa for Node.js environment that handles UTF-8 properly
const originalBtoa = globalThis.btoa;
beforeAll(() => {
  // Override btoa to handle UTF-8 characters (like emojis in the mock SVG)
  globalThis.btoa = (str: string) => {
    // Use TextEncoder to properly handle UTF-8 characters
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return Buffer.from(binary, 'binary').toString('base64');
  };
});

afterAll(() => {
  if (originalBtoa === undefined) {
    // @ts-expect-error - cleaning up polyfill
    delete globalThis.btoa;
  } else {
    globalThis.btoa = originalBtoa;
  }
});

describe('InspectSiteTool definition', () => {
  it('should have correct name', () => {
    expect(InspectSiteTool.name).toBe('inspect_site');
  });

  it('should have description explaining usage', () => {
    expect(InspectSiteTool.description).toContain('screenshot');
    expect(InspectSiteTool.description).toContain('site web');
    expect(InspectSiteTool.description).toContain('QUAND UTILISER');
    expect(InspectSiteTool.description).toContain('CE QUE');
  });

  it('should have input schema with required url property', () => {
    expect(InspectSiteTool.inputSchema.type).toBe('object');
    expect(InspectSiteTool.inputSchema.required).toContain('url');
    expect(InspectSiteTool.inputSchema.properties.url).toBeDefined();
    expect(InspectSiteTool.inputSchema.properties.url.type).toBe('string');
  });

  it('should have device property with enum values', () => {
    const deviceProp = InspectSiteTool.inputSchema.properties.device;
    expect(deviceProp).toBeDefined();
    expect(deviceProp.type).toBe('string');
    expect(deviceProp.enum).toEqual(['desktop', 'tablet', 'mobile']);
  });

  it('should have fullPage boolean property', () => {
    const fullPageProp = InspectSiteTool.inputSchema.properties.fullPage;
    expect(fullPageProp).toBeDefined();
    expect(fullPageProp.type).toBe('boolean');
  });

  it('should have darkMode boolean property', () => {
    const darkModeProp = InspectSiteTool.inputSchema.properties.darkMode;
    expect(darkModeProp).toBeDefined();
    expect(darkModeProp.type).toBe('boolean');
  });

  it('should have delay number property', () => {
    const delayProp = InspectSiteTool.inputSchema.properties.delay;
    expect(delayProp).toBeDefined();
    expect(delayProp.type).toBe('number');
  });
});

describe('CompareSitesTool definition', () => {
  it('should have correct name', () => {
    expect(CompareSitesTool.name).toBe('compare_sites');
  });

  it('should have description explaining usage', () => {
    expect(CompareSitesTool.description).toContain('Compare');
    expect(CompareSitesTool.description).toContain('deux sites');
    expect(CompareSitesTool.description).toContain('QUAND UTILISER');
    expect(CompareSitesTool.description).toContain('CE QUE');
  });

  it('should have input schema with required url1 and url2 properties', () => {
    expect(CompareSitesTool.inputSchema.type).toBe('object');
    expect(CompareSitesTool.inputSchema.required).toContain('url1');
    expect(CompareSitesTool.inputSchema.required).toContain('url2');
    expect(CompareSitesTool.inputSchema.properties.url1).toBeDefined();
    expect(CompareSitesTool.inputSchema.properties.url1.type).toBe('string');
    expect(CompareSitesTool.inputSchema.properties.url2).toBeDefined();
    expect(CompareSitesTool.inputSchema.properties.url2.type).toBe('string');
  });

  it('should have device property with enum values', () => {
    const deviceProp = CompareSitesTool.inputSchema.properties.device;
    expect(deviceProp).toBeDefined();
    expect(deviceProp.type).toBe('string');
    expect(deviceProp.enum).toEqual(['desktop', 'tablet', 'mobile']);
  });
});

describe('INSPECT_TOOLS export', () => {
  it('should contain both tools', () => {
    expect(INSPECT_TOOLS).toHaveLength(2);
    expect(INSPECT_TOOLS).toContain(InspectSiteTool);
    expect(INSPECT_TOOLS).toContain(CompareSitesTool);
  });
});

describe('createInspectToolHandlers', () => {
  describe('without screenshot service (mock mode)', () => {
    let handlers: ReturnType<typeof createInspectToolHandlers>;

    beforeEach(() => {
      handlers = createInspectToolHandlers();
    });

    it('should return handlers object with inspect_site and compare_sites', () => {
      expect(handlers).toBeDefined();
      expect(handlers.inspect_site).toBeDefined();
      expect(handlers.compare_sites).toBeDefined();
      expect(typeof handlers.inspect_site).toBe('function');
      expect(typeof handlers.compare_sites).toBe('function');
    });

    describe('inspect_site handler', () => {
      it('should return success with mock screenshot for valid URL', async () => {
        const result = await handlers.inspect_site({
          url: 'https://example.com',
          device: 'desktop',
        });

        expect(result.success).toBe(true);
        expect(result.output).toBeDefined();
        expect((result.output as Record<string, unknown>).url).toBe('https://example.com');
        expect((result.output as Record<string, unknown>).device).toBe('desktop');
        expect((result.output as Record<string, unknown>).mimeType).toBe('image/svg+xml');
        expect((result.output as Record<string, unknown>).imageBase64).toBeDefined();
      });

      it('should return error when url is missing', async () => {
        const result = await handlers.inspect_site({});

        expect(result.success).toBe(false);
        expect(result.error).toContain('url');
        expect(result.error).toContain('requis');
      });

      it('should return error for invalid URL format', async () => {
        const result = await handlers.inspect_site({
          url: 'not-a-valid-url',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('URL invalide');
        expect(result.error).toContain('http://');
      });

      it('should return error for URL without protocol', async () => {
        const result = await handlers.inspect_site({
          url: 'example.com',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('URL invalide');
      });

      it('should return error for FTP URL', async () => {
        const result = await handlers.inspect_site({
          url: 'ftp://example.com',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('URL invalide');
      });

      it('should accept http:// URLs', async () => {
        const result = await handlers.inspect_site({
          url: 'http://localhost:3000',
        });

        expect(result.success).toBe(true);
        expect((result.output as Record<string, unknown>).url).toBe('http://localhost:3000');
      });

      it('should accept https:// URLs', async () => {
        const result = await handlers.inspect_site({
          url: 'https://stripe.com',
        });

        expect(result.success).toBe(true);
        expect((result.output as Record<string, unknown>).url).toBe('https://stripe.com');
      });

      it('should default to desktop device when not specified', async () => {
        const result = await handlers.inspect_site({
          url: 'https://example.com',
        });

        expect(result.success).toBe(true);
        expect((result.output as Record<string, unknown>).device).toBe('desktop');
        expect((result.output as Record<string, unknown>).dimensions).toEqual({
          width: 1280,
          height: 800,
        });
      });

      it('should include mock observations in output', async () => {
        const result = await handlers.inspect_site({
          url: 'https://example.com',
        });

        expect(result.success).toBe(true);
        const output = result.output as Record<string, unknown>;
        expect(output.observations).toBeDefined();
        expect(Array.isArray(output.observations)).toBe(true);
        expect((output.observations as string[]).some((o: string) => o.toLowerCase().includes('mock'))).toBe(true);
      });

      it('should include message in output', async () => {
        const result = await handlers.inspect_site({
          url: 'https://example.com',
          device: 'tablet',
        });

        expect(result.success).toBe(true);
        const output = result.output as Record<string, unknown>;
        expect(output.message).toBeDefined();
        expect(output.message).toContain('Screenshot capturé');
        expect(output.message).toContain('https://example.com');
        expect(output.message).toContain('tablet');
      });
    });

    describe('compare_sites handler', () => {
      it('should return success comparing two valid URLs', async () => {
        const result = await handlers.compare_sites({
          url1: 'https://original.com',
          url2: 'https://copy.com',
          device: 'desktop',
        });

        expect(result.success).toBe(true);
        expect(result.output).toBeDefined();
        const output = result.output as Record<string, unknown>;
        expect(output.comparison).toBeDefined();
        expect(output.message).toContain('Comparaison');
      });

      it('should return error when url1 is missing', async () => {
        const result = await handlers.compare_sites({
          url2: 'https://copy.com',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('url1');
        expect(result.error).toContain('url2');
        expect(result.error).toContain('requis');
      });

      it('should return error when url2 is missing', async () => {
        const result = await handlers.compare_sites({
          url1: 'https://original.com',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('url1');
        expect(result.error).toContain('url2');
      });

      it('should return error for invalid url1', async () => {
        const result = await handlers.compare_sites({
          url1: 'invalid-url',
          url2: 'https://copy.com',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('URL1 invalide');
      });

      it('should return error for invalid url2', async () => {
        const result = await handlers.compare_sites({
          url1: 'https://original.com',
          url2: 'invalid-url',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('URL2 invalide');
      });

      it('should default to desktop device', async () => {
        const result = await handlers.compare_sites({
          url1: 'https://original.com',
          url2: 'https://copy.com',
        });

        expect(result.success).toBe(true);
        const output = result.output as Record<string, unknown>;
        const comparison = output.comparison as Record<string, unknown>;
        expect(comparison.device).toBe('desktop');
      });

      it('should capture both sites with specified device', async () => {
        const result = await handlers.compare_sites({
          url1: 'https://original.com',
          url2: 'https://copy.com',
          device: 'mobile',
        });

        expect(result.success).toBe(true);
        const output = result.output as Record<string, unknown>;
        const comparison = output.comparison as Record<string, unknown>;
        expect(comparison.device).toBe('mobile');

        const site1 = comparison.site1 as Record<string, unknown>;
        const site2 = comparison.site2 as Record<string, unknown>;
        expect(site1.url).toBe('https://original.com');
        expect(site2.url).toBe('https://copy.com');
        expect(site1.success).toBe(true);
        expect(site2.success).toBe(true);
      });

      it('should include screenshot data for both sites', async () => {
        const result = await handlers.compare_sites({
          url1: 'https://original.com',
          url2: 'https://copy.com',
        });

        expect(result.success).toBe(true);
        const output = result.output as Record<string, unknown>;
        const comparison = output.comparison as Record<string, unknown>;
        const site1 = comparison.site1 as Record<string, unknown>;
        const site2 = comparison.site2 as Record<string, unknown>;

        expect(site1.imageBase64).toBeDefined();
        expect(site2.imageBase64).toBeDefined();
        expect(site1.dimensions).toBeDefined();
        expect(site2.dimensions).toBeDefined();
      });
    });
  });

  describe('with screenshot service', () => {
    let mockService: ScreenshotServiceInterface;
    let handlers: ReturnType<typeof createInspectToolHandlers>;

    beforeEach(() => {
      mockService = {
        capture: vi.fn(),
      };
      handlers = createInspectToolHandlers(mockService);
    });

    describe('inspect_site handler with real service', () => {
      it('should call screenshot service with correct parameters', async () => {
        vi.mocked(mockService.capture).mockResolvedValue({
          success: true,
          base64: 'base64-image-data',
          mimeType: 'image/png',
          metadata: {
            url: 'https://example.com',
            width: 1280,
            height: 800,
            capturedAt: '2025-01-08T00:00:00Z',
            provider: 'test-provider',
          },
        });

        const result = await handlers.inspect_site({
          url: 'https://example.com',
          device: 'desktop',
          fullPage: true,
          darkMode: true,
          delay: 2000,
        });

        expect(mockService.capture).toHaveBeenCalledWith({
          url: 'https://example.com',
          device: 'desktop',
          fullPage: true,
          darkMode: true,
          delay: 2000,
        });
        expect(result.success).toBe(true);
      });

      it('should return screenshot data from service', async () => {
        vi.mocked(mockService.capture).mockResolvedValue({
          success: true,
          base64: 'real-base64-image',
          mimeType: 'image/png',
          metadata: {
            url: 'https://example.com',
            width: 1920,
            height: 1080,
            capturedAt: '2025-01-08T00:00:00Z',
            provider: 'test-provider',
          },
        });

        const result = await handlers.inspect_site({
          url: 'https://example.com',
        });

        expect(result.success).toBe(true);
        const output = result.output as Record<string, unknown>;
        expect(output.imageBase64).toBe('real-base64-image');
        expect(output.mimeType).toBe('image/png');
        expect(output.dimensions).toEqual({ width: 1920, height: 1080 });
      });

      it('should handle service capture failure', async () => {
        vi.mocked(mockService.capture).mockResolvedValue({
          success: false,
          error: 'Network timeout',
        });

        const result = await handlers.inspect_site({
          url: 'https://example.com',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Network timeout');
      });

      it('should handle service exception', async () => {
        vi.mocked(mockService.capture).mockRejectedValue(new Error('Service unavailable'));

        const result = await handlers.inspect_site({
          url: 'https://example.com',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Service unavailable');
      });

      it('should use default dimensions when metadata not available', async () => {
        vi.mocked(mockService.capture).mockResolvedValue({
          success: true,
          base64: 'image-data',
          mimeType: 'image/png',
        });

        const result = await handlers.inspect_site({
          url: 'https://example.com',
          device: 'tablet',
        });

        expect(result.success).toBe(true);
        const output = result.output as Record<string, unknown>;
        expect(output.dimensions).toEqual({ width: 768, height: 1024 });
      });
    });

    describe('compare_sites handler with real service', () => {
      it('should capture both sites using service', async () => {
        vi.mocked(mockService.capture).mockResolvedValue({
          success: true,
          base64: 'image-data',
          mimeType: 'image/png',
          metadata: {
            url: 'https://test.com',
            width: 1280,
            height: 800,
            capturedAt: '2025-01-08T00:00:00Z',
            provider: 'test-provider',
          },
        });

        const result = await handlers.compare_sites({
          url1: 'https://original.com',
          url2: 'https://copy.com',
          device: 'desktop',
        });

        expect(mockService.capture).toHaveBeenCalledTimes(2);
        expect(mockService.capture).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://original.com',
            device: 'desktop',
          }),
        );
        expect(mockService.capture).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://copy.com',
            device: 'desktop',
          }),
        );
        expect(result.success).toBe(true);
      });

      it('should handle partial capture failure', async () => {
        vi.mocked(mockService.capture)
          .mockResolvedValueOnce({
            success: true,
            base64: 'image-data',
            mimeType: 'image/png',
          })
          .mockResolvedValueOnce({
            success: false,
            error: 'Failed to capture second site',
          });

        const result = await handlers.compare_sites({
          url1: 'https://original.com',
          url2: 'https://broken.com',
        });

        expect(result.success).toBe(true);
        const output = result.output as Record<string, unknown>;
        const comparison = output.comparison as Record<string, unknown>;
        const site1 = comparison.site1 as Record<string, unknown>;
        const site2 = comparison.site2 as Record<string, unknown>;

        expect(site1.success).toBe(true);
        expect(site2.success).toBe(false);
        expect(site2.error).toBe('Failed to capture second site');
      });

      it('should handle exception during comparison', async () => {
        vi.mocked(mockService.capture).mockRejectedValue(new Error('Service crashed'));

        const result = await handlers.compare_sites({
          url1: 'https://original.com',
          url2: 'https://copy.com',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Service crashed');
      });
    });
  });

  describe('device simulation', () => {
    let handlers: ReturnType<typeof createInspectToolHandlers>;

    beforeEach(() => {
      handlers = createInspectToolHandlers();
    });

    it('should return desktop dimensions (1280x800)', async () => {
      const result = await handlers.inspect_site({
        url: 'https://example.com',
        device: 'desktop',
      });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, unknown>;
      expect(output.dimensions).toEqual({ width: 1280, height: 800 });
    });

    it('should return tablet dimensions (768x1024)', async () => {
      const result = await handlers.inspect_site({
        url: 'https://example.com',
        device: 'tablet',
      });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, unknown>;
      expect(output.dimensions).toEqual({ width: 768, height: 1024 });
    });

    it('should return mobile dimensions (375x812)', async () => {
      const result = await handlers.inspect_site({
        url: 'https://example.com',
        device: 'mobile',
      });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, unknown>;
      expect(output.dimensions).toEqual({ width: 375, height: 812 });
    });

    it('should default to desktop dimensions for unknown device', async () => {
      const result = await handlers.inspect_site({
        url: 'https://example.com',
        device: 'unknown-device',
      });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, unknown>;
      expect(output.dimensions).toEqual({ width: 1280, height: 800 });
    });
  });

  describe('URL validation', () => {
    let handlers: ReturnType<typeof createInspectToolHandlers>;

    beforeEach(() => {
      handlers = createInspectToolHandlers();
    });

    it('should accept valid https URL', async () => {
      const result = await handlers.inspect_site({
        url: 'https://www.google.com/search?q=test',
      });

      expect(result.success).toBe(true);
    });

    it('should accept valid http URL', async () => {
      const result = await handlers.inspect_site({
        url: 'http://localhost:8080/dashboard',
      });

      expect(result.success).toBe(true);
    });

    it('should accept URL with port', async () => {
      const result = await handlers.inspect_site({
        url: 'https://example.com:3000',
      });

      expect(result.success).toBe(true);
    });

    it('should accept URL with path', async () => {
      const result = await handlers.inspect_site({
        url: 'https://example.com/path/to/page',
      });

      expect(result.success).toBe(true);
    });

    it('should accept URL with query parameters', async () => {
      const result = await handlers.inspect_site({
        url: 'https://example.com?foo=bar&baz=qux',
      });

      expect(result.success).toBe(true);
    });

    it('should accept URL with hash fragment', async () => {
      const result = await handlers.inspect_site({
        url: 'https://example.com/page#section',
      });

      expect(result.success).toBe(true);
    });

    it('should reject empty URL', async () => {
      const result = await handlers.inspect_site({
        url: '',
      });

      expect(result.success).toBe(false);
    });

    it('should reject null URL', async () => {
      const result = await handlers.inspect_site({
        url: null as unknown as string,
      });

      expect(result.success).toBe(false);
    });

    it('should reject undefined URL', async () => {
      const result = await handlers.inspect_site({
        url: undefined as unknown as string,
      });

      expect(result.success).toBe(false);
    });

    it('should reject file:// protocol', async () => {
      const result = await handlers.inspect_site({
        url: 'file:///etc/passwd',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('URL invalide');
    });

    it('should reject javascript: protocol', async () => {
      const result = await handlers.inspect_site({
        url: 'javascript:alert(1)',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('URL invalide');
    });

    it('should reject data: protocol', async () => {
      const result = await handlers.inspect_site({
        url: 'data:text/html,<h1>Test</h1>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('URL invalide');
    });

    it('should reject malformed URL', async () => {
      const result = await handlers.inspect_site({
        url: 'ht tp://bad url.com',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('mock screenshot generation', () => {
    let handlers: ReturnType<typeof createInspectToolHandlers>;

    beforeEach(() => {
      handlers = createInspectToolHandlers();
    });

    it('should generate base64 encoded SVG', async () => {
      const result = await handlers.inspect_site({
        url: 'https://example.com',
      });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, unknown>;
      expect(output.imageBase64).toBeDefined();
      expect(typeof output.imageBase64).toBe('string');

      // Should be valid base64 - decode it
      const decoded = Buffer.from(output.imageBase64 as string, 'base64').toString('utf-8');
      expect(decoded).toContain('<svg');
      expect(decoded).toContain('</svg>');
    });

    it('should include hostname in mock SVG', async () => {
      const result = await handlers.inspect_site({
        url: 'https://stripe.com/dashboard',
      });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, unknown>;
      const decoded = Buffer.from(output.imageBase64 as string, 'base64').toString('utf-8');
      expect(decoded).toContain('stripe.com');
    });

    it('should include device dimensions in mock SVG', async () => {
      const result = await handlers.inspect_site({
        url: 'https://example.com',
        device: 'mobile',
      });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, unknown>;
      const decoded = Buffer.from(output.imageBase64 as string, 'base64').toString('utf-8');
      expect(decoded).toContain('375');
      expect(decoded).toContain('812');
    });
  });

  describe('error handling', () => {
    it('should handle non-Error exceptions in inspect_site', async () => {
      const mockService: ScreenshotServiceInterface = {
        capture: vi.fn().mockRejectedValue('string error'),
      };

      const handlers = createInspectToolHandlers(mockService);

      const result = await handlers.inspect_site({
        url: 'https://example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('string error');
    });

    it('should handle exception in compare_sites', async () => {
      const mockService: ScreenshotServiceInterface = {
        capture: vi.fn().mockRejectedValue(new Error('Comparison failed')),
      };

      const handlers = createInspectToolHandlers(mockService);

      const result = await handlers.compare_sites({
        url1: 'https://a.com',
        url2: 'https://b.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Comparison failed');
    });

    it('should handle non-Error exceptions in compare_sites', async () => {
      const mockService: ScreenshotServiceInterface = {
        capture: vi.fn().mockRejectedValue('raw string error'),
      };

      const handlers = createInspectToolHandlers(mockService);

      const result = await handlers.compare_sites({
        url1: 'https://a.com',
        url2: 'https://b.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('raw string error');
    });
  });

  describe('default parameter values', () => {
    let handlers: ReturnType<typeof createInspectToolHandlers>;
    let mockService: ScreenshotServiceInterface;

    beforeEach(() => {
      mockService = {
        capture: vi.fn().mockResolvedValue({
          success: true,
          base64: 'data',
          mimeType: 'image/png',
        }),
      };
      handlers = createInspectToolHandlers(mockService);
    });

    it('should use default values for optional parameters in inspect_site', async () => {
      await handlers.inspect_site({
        url: 'https://example.com',
      });

      expect(mockService.capture).toHaveBeenCalledWith({
        url: 'https://example.com',
        device: 'desktop',
        fullPage: false,
        darkMode: false,
        delay: 1000,
      });
    });

    it('should override default values when provided', async () => {
      await handlers.inspect_site({
        url: 'https://example.com',
        device: 'mobile',
        fullPage: true,
        darkMode: true,
        delay: 5000,
      });

      expect(mockService.capture).toHaveBeenCalledWith({
        url: 'https://example.com',
        device: 'mobile',
        fullPage: true,
        darkMode: true,
        delay: 5000,
      });
    });
  });
});
