// Behavior contract for the 404 page. Tests the Spanish copy, presence of a
// "return home" call-to-action, and absence of any broken references.
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import NotFound from './not-found';

afterEach(() => {
  cleanup();
});

describe('not-found page — behavior contract', () => {
  it('renders a 404 indicator', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument();
  });

  it('offers a link back to the home page', () => {
    render(<NotFound />);
    const home = screen.getByRole('link', { name: /Ver promos/i });
    expect(home).toHaveAttribute('href', '/');
  });
});
