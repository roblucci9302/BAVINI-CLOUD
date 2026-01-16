import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    span: ({ children, className, ...props }: any) => (
      <span className={className} {...props}>
        {children}
      </span>
    ),
  },
}));

// Mock easings
vi.mock('~/utils/easings', () => ({
  cubicEasingFn: (t: number) => t,
}));

// Import after mocks
import { Slider, type SliderOptions } from './Slider';

describe('Slider', () => {
  const defaultOptions: SliderOptions<string> = {
    left: { value: 'left', text: 'Left Option' },
    right: { value: 'right', text: 'Right Option' },
  };

  describe('rendering', () => {
    it('should render both options', () => {
      render(<Slider selected="left" options={defaultOptions} />);

      expect(screen.getByText('Left Option')).toBeInTheDocument();
      expect(screen.getByText('Right Option')).toBeInTheDocument();
    });

    it('should render as buttons', () => {
      render(<Slider selected="left" options={defaultOptions} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2);
    });
  });

  describe('selection', () => {
    it('should highlight left option when selected', () => {
      render(<Slider selected="left" options={defaultOptions} />);

      const leftButton = screen.getByText('Left Option').closest('button');
      // Updated: New design uses textPrimary for selected state
      expect(leftButton).toHaveClass('text-bolt-elements-textPrimary');
    });

    it('should highlight right option when selected', () => {
      render(<Slider selected="right" options={defaultOptions} />);

      const rightButton = screen.getByText('Right Option').closest('button');
      // Updated: New design uses textPrimary for selected state
      expect(rightButton).toHaveClass('text-bolt-elements-textPrimary');
    });

    it('should not highlight unselected option', () => {
      render(<Slider selected="left" options={defaultOptions} />);

      const rightButton = screen.getByText('Right Option').closest('button');
      // Updated: New design uses textSecondary for unselected state
      expect(rightButton).toHaveClass('text-bolt-elements-textSecondary');
    });
  });

  describe('interaction', () => {
    it('should call setSelected with left value when left option clicked', () => {
      const setSelected = vi.fn();
      render(<Slider selected="right" options={defaultOptions} setSelected={setSelected} />);

      fireEvent.click(screen.getByText('Left Option'));

      expect(setSelected).toHaveBeenCalledWith('left');
    });

    it('should call setSelected with right value when right option clicked', () => {
      const setSelected = vi.fn();
      render(<Slider selected="left" options={defaultOptions} setSelected={setSelected} />);

      fireEvent.click(screen.getByText('Right Option'));

      expect(setSelected).toHaveBeenCalledWith('right');
    });

    it('should work without setSelected callback', () => {
      expect(() => {
        render(<Slider selected="left" options={defaultOptions} />);
        fireEvent.click(screen.getByText('Right Option'));
      }).not.toThrow();
    });
  });

  describe('generic types', () => {
    it('should work with number values', () => {
      const numberOptions: SliderOptions<number> = {
        left: { value: 1, text: 'One' },
        right: { value: 2, text: 'Two' },
      };
      const setSelected = vi.fn();

      render(<Slider selected={1} options={numberOptions} setSelected={setSelected} />);

      fireEvent.click(screen.getByText('Two'));

      expect(setSelected).toHaveBeenCalledWith(2);
    });

    it('should work with boolean values', () => {
      const boolOptions: SliderOptions<boolean> = {
        left: { value: true, text: 'Yes' },
        right: { value: false, text: 'No' },
      };
      const setSelected = vi.fn();

      render(<Slider selected={true} options={boolOptions} setSelected={setSelected} />);

      fireEvent.click(screen.getByText('No'));

      expect(setSelected).toHaveBeenCalledWith(false);
    });

    it('should work with enum values', () => {
      enum Mode {
        Light = 'light',
        Dark = 'dark',
      }

      const enumOptions: SliderOptions<Mode> = {
        left: { value: Mode.Light, text: 'Light' },
        right: { value: Mode.Dark, text: 'Dark' },
      };
      const setSelected = vi.fn();

      render(<Slider selected={Mode.Light} options={enumOptions} setSelected={setSelected} />);

      fireEvent.click(screen.getByText('Dark'));

      expect(setSelected).toHaveBeenCalledWith(Mode.Dark);
    });
  });

  describe('styling', () => {
    it('should have container styling', () => {
      const { container } = render(<Slider selected="left" options={defaultOptions} />);

      const wrapper = container.firstChild;
      // Updated: New design uses rounded-[12px] and additional flex classes
      expect(wrapper).toHaveClass('relative', 'flex', 'items-center');
    });

    it('should have pill animation element for selected button', () => {
      const { container } = render(<Slider selected="left" options={defaultOptions} />);

      // Updated: New design uses CSS custom property for pill background
      // The pill now has rounded-[8px] and bg-[var(--bolt-bg-header,#141417)]
      const pillBackground = container.querySelector('.rounded-\\[8px\\]');
      expect(pillBackground).toBeInTheDocument();
    });
  });

  describe('custom text', () => {
    it('should render custom text for options', () => {
      const customOptions: SliderOptions<string> = {
        left: { value: 'a', text: 'Option Alpha' },
        right: { value: 'b', text: 'Option Beta' },
      };

      render(<Slider selected="a" options={customOptions} />);

      expect(screen.getByText('Option Alpha')).toBeInTheDocument();
      expect(screen.getByText('Option Beta')).toBeInTheDocument();
    });
  });
});
