// Shared display helpers for the Notes feature. Kept framework-agnostic (no JSX)
// so both the sidebar list and the notes-home gallery render categories and
// timestamps identically. JSX-returning helpers (highlightMatch, getBodySnippet)
// stay local to their consumers.
import type { Timestamp } from 'firebase/firestore';

export const CATEGORY_COLORS: Record<string, string> = {
  venue: 'bg-tag-venue/20 text-tag-venue-fg',
  catering: 'bg-tag-catering/20 text-tag-catering-fg',
  decor: 'bg-cat-timeline/20 text-cat-timeline-fg',
  attire: 'bg-cat-milestone/20 text-cat-milestone-fg',
  guest_list: 'bg-tag-guest/20 text-tag-guest-fg',
  ceremony: 'bg-tag-ceremony/20 text-tag-ceremony-fg',
  reception: 'bg-tag-reception/20 text-tag-reception-fg',
  honeymoon: 'bg-tag-honeymoon/20 text-tag-honeymoon-fg',
  budget: 'bg-success/20 text-success-subtle',
  vendor: 'bg-tag-vendor/20 text-tag-vendor-fg',
  general: 'bg-foreground/10 text-foreground/60 [.light_&]:bg-foreground/[0.06] [.light_&]:text-foreground/70',
};

type DateLike = Date | Timestamp | { toDate: () => Date } | null | undefined;

export const timeAgo = (date: DateLike): string => {
  if (!date) return 'just now';
  const d = typeof (date as any).toDate === 'function' ? (date as any).toDate() : (date as Date);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/** Milliseconds for sorting, tolerant of Firestore Timestamp | Date | missing. */
export const toMillis = (date: DateLike): number => {
  if (!date) return 0;
  if (typeof (date as any).toMillis === 'function') return (date as any).toMillis();
  if (typeof (date as any).toDate === 'function') return (date as any).toDate().getTime();
  if (date instanceof Date) return date.getTime();
  return 0;
};
