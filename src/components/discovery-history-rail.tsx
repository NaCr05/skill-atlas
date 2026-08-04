"use client";

import { Clock3, RotateCcw, X } from "lucide-react";

export interface DiscoveryHistoryItem {
  id: string;
  label: string;
  meta: string;
}

export function DiscoveryHistoryRail({
  title,
  clearLabel,
  removeLabel,
  items,
  onOpen,
  onRemove,
  onClear,
}: {
  title: string;
  clearLabel: string;
  removeLabel: (label: string) => string;
  items: DiscoveryHistoryItem[];
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  if (!items.length) return null;

  return (
    <section className="discovery-history" aria-label={title}>
      <header>
        <span><Clock3 size={13} aria-hidden="true" /> {title}</span>
        <button type="button" onClick={onClear}><RotateCcw size={12} aria-hidden="true" /> {clearLabel}</button>
      </header>
      <div className="discovery-history-track">
        {items.map((item) => (
          <div className="discovery-history-item" key={item.id}>
            <button type="button" className="discovery-history-open" onClick={() => onOpen(item.id)}>
              <strong>{item.label}</strong>
              <small>{item.meta}</small>
            </button>
            <button
              type="button"
              className="discovery-history-remove"
              aria-label={removeLabel(item.label)}
              title={removeLabel(item.label)}
              onClick={() => onRemove(item.id)}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
