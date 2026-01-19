import { memo } from 'react';
import { classNames } from '~/utils/classNames';

export interface PanelHeaderProps {
  className?: string;
  children: React.ReactNode;
}

export const PanelHeader = memo(({ className, children }: PanelHeaderProps) => {
  return (
    <div
      className={classNames(
        'flex items-center gap-2 bg-[var(--bolt-bg-panel,#0f0f11)] text-bolt-elements-textSecondary border-b border-bolt-elements-borderColor px-3.5 py-2.5 min-h-[38px] text-xs font-semibold uppercase tracking-[0.5px]',
        className,
      )}
    >
      {children}
    </div>
  );
});
