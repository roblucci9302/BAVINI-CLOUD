import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnimatedPlaceholder } from './AnimatedPlaceholder';

describe('AnimatedPlaceholder', () => {
  it('should not render when chatStarted is true', () => {
    const { container } = render(<AnimatedPlaceholder chatStarted={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render when chatStarted is false', () => {
    render(<AnimatedPlaceholder chatStarted={false} />);
    expect(screen.getByText('Décrivez votre projet...')).toBeInTheDocument();
  });

  it('should have aria-hidden attribute', () => {
    const { container } = render(<AnimatedPlaceholder chatStarted={false} />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('should hide when textarea has content', async () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    const textareaRef = { current: textarea };

    const { container } = render(<AnimatedPlaceholder chatStarted={false} textareaRef={textareaRef} />);

    expect(container.firstChild).not.toBeNull();

    textarea.value = 'hello';
    fireEvent.input(textarea);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });

    document.body.removeChild(textarea);
  });

  it('should show again when textarea is cleared', async () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    const textareaRef = { current: textarea };

    const { container } = render(<AnimatedPlaceholder chatStarted={false} textareaRef={textareaRef} />);

    textarea.value = 'hello';
    fireEvent.input(textarea);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });

    textarea.value = '';
    fireEvent.input(textarea);

    await waitFor(() => {
      expect(container.firstChild).not.toBeNull();
    });

    document.body.removeChild(textarea);
  });
});
