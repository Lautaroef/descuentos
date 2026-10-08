// The route error boundary replaces the bare Next.js 500 page when a server
// render fails (e.g. the database is paused). It must render branded copy and a
// working retry.
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RouteError from './error';

afterEach(() => {
  cleanup();
});

describe('route error boundary', () => {
  it('shows a friendly message and retries on click', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reset = vi.fn();
    render(<RouteError error={new Error('db down')} reset={reset} />);
    expect(screen.getByText('No pudimos cargar las promos.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
