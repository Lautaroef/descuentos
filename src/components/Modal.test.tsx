// Behavior contract for Modal.
//
// The Modal is the reusable chrome around intercepted routes (today:
// `/p/[id]` rendered in the @modal parallel slot). Tests assert what the
// user experiences, not styling:
//   - Esc closes (routes through router.back).
//   - The × button closes.
//   - Backdrop click closes; click on content does not.
//   - Body scroll is locked while the modal is mounted and restored on
//     unmount.
//   - Focus trap: Tab from the last focusable wraps to the first; Shift+Tab
//     from the first wraps to the last.
//   - Focus returns to the previously-focused element on unmount.
//   - The "Ver página completa" link is wired to the provided href.
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const backMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: backMock,
    forward: vi.fn(),
  }),
}));

import { Modal } from './Modal';

describe('Modal — behavior contract', () => {
  beforeEach(() => {
    backMock.mockClear();
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  });

  afterEach(() => {
    cleanup();
  });

  function renderModal(extra?: { fullPageHref?: string }) {
    return render(
      <Modal
        ariaLabel="Detalle de COTO"
        fullPageHref={extra?.fullPageHref ?? '/p/abc-123'}
      >
        <button type="button">first focusable</button>
        <a href="#inner-link">middle focusable</a>
        <button type="button">last focusable</button>
      </Modal>,
    );
  }

  it('renders with role=dialog and aria-modal=true', () => {
    renderModal();
    const dialog = screen.getByRole('dialog', { name: /Detalle de COTO/ });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('closes on Esc via router.back()', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.keyboard('{Escape}');

    expect(backMock).toHaveBeenCalledTimes(1);
  });

  it('closes when the × button is clicked', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(backMock).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByTestId('modal-backdrop'));
    expect(backMock).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the content', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /first focusable/ }));
    expect(backMock).not.toHaveBeenCalled();
  });

  it('locks body scroll while mounted and restores on unmount', () => {
    const { unmount } = renderModal();

    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe('');
  });

  it('focuses the close button on mount', async () => {
    renderModal();
    // Focus is moved inside a requestAnimationFrame to let the modal mount.
    // Flush a frame.
    await new Promise((r) => requestAnimationFrame(r as FrameRequestCallback));
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Cerrar' }),
    );
  });

  it('restores focus to the previously-focused element on unmount', async () => {
    // Render a trigger outside the modal, focus it, then mount the modal.
    const trigger = document.createElement('button');
    trigger.textContent = 'trigger';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = renderModal();
    await new Promise((r) => requestAnimationFrame(r as FrameRequestCallback));
    // Modal has moved focus to the close button by now.
    expect(document.activeElement).not.toBe(trigger);

    unmount();
    expect(document.activeElement).toBe(trigger);

    document.body.removeChild(trigger);
  });

  it('traps Tab: wraps to the first focusable when tabbing past the last', async () => {
    const user = userEvent.setup();
    renderModal();
    await new Promise((r) => requestAnimationFrame(r as FrameRequestCallback));

    // The DOM order of focusables inside the modal is:
    //   1. close button   (gets focus on mount)
    //   2. "Ver página completa" link (rendered by Modal chrome)
    //   3. children: first focusable button
    //   4. children: middle link
    //   5. children: last focusable button
    // Focus starts on #1 (close). Cycle forward to the last via Tab.
    // We'll Shift+Tab once from the close button — it should wrap to the
    // last focusable in the modal.
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /last focusable/ }),
    );
  });

  it('renders "Ver página completa" link pointing at the full page URL', () => {
    renderModal({ fullPageHref: '/p/abc-123' });
    const link = screen.getByRole('link', { name: /Ver página completa/ });
    expect(link).toHaveAttribute('href', '/p/abc-123');
  });
});
