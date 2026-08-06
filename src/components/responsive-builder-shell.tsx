"use client";

import { Copy, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { AccessibleDialog } from "./accessible-dialog";
import { useLanguage } from "./language-provider";

const BUILDER_MEDIA = "(max-width: 1100px)";

function subscribe(callback: () => void) {
  const query = window.matchMedia(BUILDER_MEDIA);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function compactSnapshot() {
  return window.matchMedia(BUILDER_MEDIA).matches;
}

export function ResponsiveBuilderShell({
  labelledBy,
  open,
  onOpen,
  onClose,
  children,
}: {
  labelledBy: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  const compact = useSyncExternalStore(subscribe, compactSnapshot, () => false);
  const desktopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (compact) return;
    let frame = 0;
    const updateAvailableHeight = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const container = desktopRef.current;
        if (!container) return;
        const top = Math.max(18, container.getBoundingClientRect().top);
        const available = Math.max(320, window.innerHeight - top - 18);
        container.style.setProperty("--builder-available-height", `${available}px`);
      });
    };

    updateAvailableHeight();
    window.addEventListener("resize", updateAvailableHeight);
    window.addEventListener("scroll", updateAvailableHeight, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateAvailableHeight);
      window.removeEventListener("scroll", updateAvailableHeight);
    };
  }, [compact]);

  if (!compact) return <div ref={desktopRef} className="responsive-builder-desktop">{children}</div>;

  return (
    <div className="responsive-builder-compact" data-dialog-open={open}>
      <button
        className="button button-primary responsive-builder-trigger"
        type="button"
        aria-hidden={open || undefined}
        tabIndex={open ? -1 : undefined}
        onClick={onOpen}
      >
        <Copy size={16} /> {t("打开调用 Builder", "Open invocation Builder")}
      </button>
      {open && (
        <AccessibleDialog className="responsive-builder-dialog" labelledBy={labelledBy} onClose={onClose} initialFocusSelector="textarea">
          <button className="responsive-builder-close" type="button" onClick={onClose} aria-label={t("关闭调用 Builder", "Close invocation Builder")}><X size={18} /></button>
          {children}
        </AccessibleDialog>
      )}
    </div>
  );
}
