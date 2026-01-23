'use client';

import { memo, useEffect, useRef, useMemo } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import type { PreviewInfo } from '~/lib/stores/previews';

interface PortDropdownProps {
  activePreviewIndex: number;
  setActivePreviewIndex: (index: number) => void;
  isDropdownOpen: boolean;
  setIsDropdownOpen: (value: boolean) => void;
  setHasSelectedPreview: (value: boolean) => void;
  previews: PreviewInfo[];
}

export const PortDropdown = memo(
  ({
    activePreviewIndex,
    setActivePreviewIndex,
    isDropdownOpen,
    setIsDropdownOpen,
    setHasSelectedPreview,
    previews,
  }: PortDropdownProps) => {
    const dropdownRef = useRef<HTMLDivElement>(null);

    // FIX: Memoize sorted previews to avoid recalculating on every render
    const sortedPreviews = useMemo(
      () =>
        previews
          .map((previewInfo, index) => ({ ...previewInfo, index }))
          .sort((a, b) => a.port - b.port),
      [previews],
    );

    // FIX: Simplified click-outside listener - only add when dropdown is open
    useEffect(() => {
      if (!isDropdownOpen) return;

      const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setIsDropdownOpen(false);
        }
      };

      window.addEventListener('mousedown', handleClickOutside);
      return () => window.removeEventListener('mousedown', handleClickOutside);
    }, [isDropdownOpen, setIsDropdownOpen]);

    return (
      <div className="relative z-40" ref={dropdownRef}>
        <IconButton icon="i-ph:plug" title="Sélectionner un port" onClick={() => setIsDropdownOpen(!isDropdownOpen)} />
        {isDropdownOpen && (
          <div className="absolute right-0 mt-2 min-w-[140px] dropdown-animation rounded-lg overflow-hidden bg-[var(--bolt-glass-background-elevated)] backdrop-blur-[var(--bolt-glass-blur)] border border-[var(--bolt-glass-border)] shadow-[var(--bolt-glass-shadow)]">
            <div className="px-4 py-2 border-b border-bolt-elements-borderColor text-sm font-semibold text-bolt-elements-textPrimary">
              Ports
            </div>
            {sortedPreviews.map((preview) => (
              <div
                key={preview.port}
                className="flex items-center px-4 py-2 cursor-pointer hover:bg-bolt-elements-item-backgroundActive"
                onClick={() => {
                  setActivePreviewIndex(preview.index);
                  setIsDropdownOpen(false);
                  setHasSelectedPreview(true);
                }}
              >
                <span
                  className={
                    activePreviewIndex === preview.index
                      ? 'text-bolt-elements-item-contentAccent'
                      : 'text-bolt-elements-item-contentDefault group-hover:text-bolt-elements-item-contentActive'
                  }
                >
                  {preview.port}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
);
