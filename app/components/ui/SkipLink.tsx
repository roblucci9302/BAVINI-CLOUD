import { memo } from 'react';

interface SkipLinkProps {
  /** The target element ID to skip to */
  targetId: string;

  /** The text to display in the skip link */
  children: React.ReactNode;
}

/**
 * Accessibility skip link component.
 * Hidden by default, appears on focus to allow keyboard users
 * to skip navigation and go directly to main content.
 */
export const SkipLink = memo(({ targetId, children }: SkipLinkProps) => {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();

    const target = document.getElementById(targetId);

    if (target) {
      target.focus();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <a href={`#${targetId}`} className="skip-link" onClick={handleClick}>
      {children}
    </a>
  );
});

SkipLink.displayName = 'SkipLink';
