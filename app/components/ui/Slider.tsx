'use client';

import React, { memo } from 'react';
import { classNames } from '~/utils/classNames';

interface SliderOption<T> {
  value: T;
  text: string;
}

export interface SliderOptions<T> {
  left: SliderOption<T>;
  right: SliderOption<T>;
}

interface SliderProps<T> {
  selected: T;
  options: SliderOptions<T>;
  setSelected?: (selected: T) => void;
}

/**
 * Slider - Tab switcher with sliding pill indicator
 *
 * IMPORTANT: This component uses CSS transitions instead of framer-motion layoutId.
 * The layoutId was causing layout measurements to propagate across the entire app,
 * leading to screen glitching when other components re-rendered.
 */
function SliderComponent<T>({ selected, options, setSelected }: SliderProps<T>) {
  const isLeftSelected = selected === options.left.value;

  return (
    <div className="relative flex items-center flex-nowrap shrink-0 gap-0.5 bg-[var(--bolt-bg-base,#050506)] overflow-hidden rounded-[12px] p-[3px] border border-bolt-elements-borderColor">
      {/* Sliding pill indicator - CSS transform instead of framer-motion layoutId */}
      <div
        className={classNames(
          'absolute top-[3px] bottom-[3px] rounded-[8px] bg-[var(--bolt-bg-header,#141417)]',
          'transition-all duration-200 ease-out',
          'shadow-[0_1px_2px_rgba(0,0,0,0.3)]',
        )}
        style={{
          left: isLeftSelected ? '3px' : '50%',
          right: isLeftSelected ? '50%' : '3px',
        }}
      />
      <SliderButton selected={isLeftSelected} setSelected={() => setSelected?.(options.left.value)}>
        {options.left.text}
      </SliderButton>
      <SliderButton selected={!isLeftSelected} setSelected={() => setSelected?.(options.right.value)}>
        {options.right.text}
      </SliderButton>
    </div>
  );
}

// Export with memo wrapper - using type assertion for generic component
export const Slider = memo(SliderComponent) as typeof SliderComponent;

interface SliderButtonProps {
  selected: boolean;
  children: React.ReactNode;
  setSelected: () => void;
}

const SliderButton = memo(({ selected, children, setSelected }: SliderButtonProps) => {
  return (
    <button
      onClick={setSelected}
      className={classNames(
        'bg-transparent text-[13px] font-medium px-3.5 py-1.5 rounded-[8px] relative z-10',
        'transition-colors duration-150',
        selected
          ? 'text-bolt-elements-textPrimary'
          : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
      )}
    >
      {children}
    </button>
  );
});
