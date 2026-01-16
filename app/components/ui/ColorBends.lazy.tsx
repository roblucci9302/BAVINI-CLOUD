import { lazy, Suspense, memo } from 'react';

// Re-export props type
export type ColorBendsProps = {
  className?: string;
  style?: React.CSSProperties;
  rotation?: number;
  speed?: number;
  colors?: string[];
  transparent?: boolean;
  autoRotate?: number;
  scale?: number;
  frequency?: number;
  warpStrength?: number;
  mouseInfluence?: number;
  parallax?: number;
  noise?: number;
};

// Lazy load the heavy Three.js component
const LazyColorBends = lazy(() => import('./ColorBends'));

/**
 * Gradient placeholder shown while Three.js is loading
 * Uses CSS gradient to approximate the visual effect
 */
function ColorBendsSkeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`${className} animate-pulse`}
      style={{
        ...style,
        background:
          'linear-gradient(135deg, rgba(20, 184, 166, 0.3), rgba(139, 92, 246, 0.3), rgba(236, 72, 153, 0.3))',
        backgroundSize: '200% 200%',
        animation: 'gradientShift 3s ease infinite',
      }}
    >
      <style>{`
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  );
}

/**
 * Lazy-loaded ColorBends wrapper
 * Reduces initial bundle size by ~150KB (gzipped) by deferring Three.js load
 */
export const LazyColorBendsWrapper = memo((props: ColorBendsProps) => {
  return (
    <Suspense fallback={<ColorBendsSkeleton className={props.className} style={props.style} />}>
      <LazyColorBends {...props} />
    </Suspense>
  );
});

LazyColorBendsWrapper.displayName = 'LazyColorBends';

export default LazyColorBendsWrapper;
