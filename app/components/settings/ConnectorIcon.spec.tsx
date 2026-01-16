import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ConnectorIcon } from './ConnectorIcon';

describe('ConnectorIcon', () => {
  describe('known icons', () => {
    it('should render supabase icon', () => {
      const { container } = render(<ConnectorIcon icon="supabase" />);

      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render github icon', () => {
      const { container } = render(<ConnectorIcon icon="github" />);

      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render netlify icon', () => {
      const { container } = render(<ConnectorIcon icon="netlify" />);

      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('fallback icon', () => {
    it('should render fallback icon for unknown connector', () => {
      const { container } = render(<ConnectorIcon icon="unknown" />);

      expect(container.querySelector('.i-ph\\:plug')).toBeInTheDocument();
    });

    it('should have fallback background styling', () => {
      const { container } = render(<ConnectorIcon icon="unknown" />);
      const wrapper = container.firstChild as HTMLElement;

      expect(wrapper).toHaveClass('bg-bolt-elements-background-depth-2');
    });
  });

  describe('className prop', () => {
    it('should apply custom className to known icon', () => {
      const { container } = render(<ConnectorIcon icon="github" className="w-8 h-8" />);
      const wrapper = container.firstChild as HTMLElement;

      expect(wrapper).toHaveClass('w-8');
      expect(wrapper).toHaveClass('h-8');
    });

    it('should apply custom className to fallback icon', () => {
      const { container } = render(<ConnectorIcon icon="unknown" className="w-10 h-10" />);
      const wrapper = container.firstChild as HTMLElement;

      expect(wrapper).toHaveClass('w-10');
      expect(wrapper).toHaveClass('h-10');
    });
  });

  describe('all connector icons', () => {
    const connectorIds = ['supabase', 'netlify', 'github'];

    it.each(connectorIds)('should render %s icon without error', (iconId) => {
      const { container } = render(<ConnectorIcon icon={iconId} />);

      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });
});
