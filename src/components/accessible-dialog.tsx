"use client";

import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
    .filter((element) =>
      !element.hidden &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.getClientRects().length > 0,
    );
}

export function AccessibleDialog({
  className,
  labelledBy,
  describedBy,
  onClose,
  closeDisabled = false,
  initialFocusSelector,
  busy = false,
  children,
}: {
  className: string;
  labelledBy: string;
  describedBy?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  initialFocusSelector?: string;
  busy?: boolean;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);

  useEffect(() => {
    closeRef.current = onClose;
    closeDisabledRef.current = closeDisabled;
  }, [closeDisabled, onClose]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const dialogElement = dialog;
    const returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const preferred = initialFocusSelector
      ? dialogElement.querySelector<HTMLElement>(initialFocusSelector)
      : undefined;
    (preferred || dialogElement).focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!closeDisabledRef.current) {
          event.preventDefault();
          closeRef.current();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = focusableElements(dialogElement);
      if (!focusables.length) {
        event.preventDefault();
        dialogElement.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialogElement.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialogElement.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [initialFocusSelector]);

  function closeFromBackdrop(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !closeDisabled) onClose();
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={closeFromBackdrop}>
      <section
        ref={dialogRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
}
