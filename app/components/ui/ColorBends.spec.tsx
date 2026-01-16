import { render, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Create reusable Vector mocks
const createVector2Mock = () => ({
  x: 0,
  y: 0,
  set: vi.fn().mockReturnThis(),
  copy: vi.fn().mockReturnThis(),
  lerp: vi.fn().mockReturnThis(),
});

const createVector3Mock = () => ({
  x: 0,
  y: 0,
  z: 0,
  set: vi.fn().mockReturnThis(),
  copy: vi.fn().mockReturnThis(),
});

// Create uColors array with proper Vector3 mocks
const createUColorsArray = () => Array.from({ length: 8 }, () => createVector3Mock());

// Mock Three.js since WebGL is not available in jsdom
vi.mock('three', () => {
  return {
    Scene: vi.fn().mockImplementation(() => ({
      add: vi.fn(),
    })),
    OrthographicCamera: vi.fn(),
    PlaneGeometry: vi.fn().mockImplementation(() => ({
      dispose: vi.fn(),
    })),
    ShaderMaterial: vi.fn().mockImplementation(() => ({
      uniforms: {
        uCanvas: { value: createVector2Mock() },
        uTime: { value: 0 },
        uSpeed: { value: 0 },
        uRot: { value: createVector2Mock() },
        uColorCount: { value: 0 },
        uColors: { value: createUColorsArray() },
        uTransparent: { value: 0 },
        uScale: { value: 1 },
        uFrequency: { value: 1 },
        uWarpStrength: { value: 1 },
        uPointer: { value: createVector2Mock() },
        uMouseInfluence: { value: 0 },
        uParallax: { value: 0 },
        uNoise: { value: 0 },
      },
      dispose: vi.fn(),
    })),
    Mesh: vi.fn(),
    WebGLRenderer: vi.fn().mockImplementation(() => {
      const canvas = document.createElement('canvas');

      return {
        setPixelRatio: vi.fn(),
        setClearColor: vi.fn(),
        setSize: vi.fn(),
        render: vi.fn(),
        dispose: vi.fn(),
        domElement: canvas,
        outputColorSpace: '',
      };
    }),
    Clock: vi.fn().mockImplementation(() => ({
      getDelta: vi.fn().mockReturnValue(0.016),
      elapsedTime: 0,
    })),
    Vector2: vi.fn().mockImplementation(() => createVector2Mock()),
    Vector3: vi.fn().mockImplementation(() => createVector3Mock()),
    SRGBColorSpace: 'srgb',
  };
});

// Mock the theme store
let currentTheme = 'dark';

vi.mock('@nanostores/react', () => ({
  useStore: () => currentTheme,
}));

vi.mock('~/lib/stores/theme', () => ({
  themeStore: { get: () => currentTheme },
}));

// Mock CSS import
vi.mock('./ColorBends.css', () => ({}));

// Mock requestAnimationFrame and ResizeObserver
const originalRAF = global.requestAnimationFrame;
const originalCAF = global.cancelAnimationFrame;
const originalRO = global.ResizeObserver;

beforeEach(() => {
  global.requestAnimationFrame = vi.fn().mockReturnValue(1);
  global.cancelAnimationFrame = vi.fn();
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    disconnect: vi.fn(),
    unobserve: vi.fn(),
  }));
  currentTheme = 'dark';
});

afterEach(() => {
  global.requestAnimationFrame = originalRAF;
  global.cancelAnimationFrame = originalCAF;
  global.ResizeObserver = originalRO;
  cleanup();
  vi.clearAllMocks();
});

// Import after mocks are set up
import ColorBends from './ColorBends';

describe('ColorBends', () => {
  describe('rendering', () => {
    it('should render the container element', () => {
      const { container } = render(<ColorBends />);

      const colorBendsContainer = container.querySelector('.color-bends-container');

      expect(colorBendsContainer).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(<ColorBends className="custom-class" />);

      const colorBendsContainer = container.querySelector('.color-bends-container');

      expect(colorBendsContainer).toHaveClass('custom-class');
    });

    it('should apply custom style', () => {
      const customStyle = { opacity: 0.5 };
      const { container } = render(<ColorBends style={customStyle} />);

      const colorBendsContainer = container.querySelector('.color-bends-container');

      expect(colorBendsContainer).toHaveStyle({ opacity: '0.5' });
    });

    it('should append canvas to container', () => {
      const { container } = render(<ColorBends />);

      const canvas = container.querySelector('canvas');

      expect(canvas).toBeInTheDocument();
    });
  });

  describe('theme support', () => {
    it('should render without errors when theme is dark', () => {
      currentTheme = 'dark';

      const { container } = render(<ColorBends />);

      expect(container.querySelector('.color-bends-container')).toBeInTheDocument();
    });

    it('should render without errors when theme is light', () => {
      currentTheme = 'light';

      const { container } = render(<ColorBends />);

      expect(container.querySelector('.color-bends-container')).toBeInTheDocument();
    });

    it('should accept custom colors', () => {
      const customColors = ['#FF0000', '#00FF00', '#0000FF'];
      const { container } = render(<ColorBends colors={customColors} />);

      expect(container.querySelector('.color-bends-container')).toBeInTheDocument();
    });
  });

  describe('props', () => {
    it('should accept all optional props without errors', () => {
      const { container } = render(
        <ColorBends
          rotation={90}
          speed={0.5}
          transparent={false}
          autoRotate={1}
          scale={2}
          frequency={2}
          warpStrength={1.5}
          mouseInfluence={0.8}
          parallax={0.5}
          noise={0.2}
        />,
      );

      expect(container.querySelector('.color-bends-container')).toBeInTheDocument();
    });

    it('should use default values when no props provided', () => {
      const { container } = render(<ColorBends />);

      expect(container.querySelector('.color-bends-container')).toBeInTheDocument();
    });
  });

  describe('cleanup', () => {
    it('should cancel animation frame on unmount', () => {
      const { unmount } = render(<ColorBends />);

      unmount();

      expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should disconnect ResizeObserver on unmount', () => {
      const disconnectMock = vi.fn();

      global.ResizeObserver = vi.fn().mockImplementation(() => ({
        observe: vi.fn(),
        disconnect: disconnectMock,
        unobserve: vi.fn(),
      }));

      const { unmount } = render(<ColorBends />);

      unmount();

      expect(disconnectMock).toHaveBeenCalled();
    });

    it('should not throw errors when unmounting', () => {
      const { unmount } = render(<ColorBends />);

      expect(() => unmount()).not.toThrow();
    });
  });
});
