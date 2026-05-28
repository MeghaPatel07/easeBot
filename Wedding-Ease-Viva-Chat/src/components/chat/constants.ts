import {
  Sparkles, Calendar, Heart, Lightbulb,
} from 'lucide-react';
import type { Mode } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Supported languages for the language selector
// ─────────────────────────────────────────────────────────────────────────────
export const SUPPORTED_LANGUAGES = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'ar', label: 'Arabic' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'de', label: 'German' },
  { code: 'zh', label: 'Chinese' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Mode configuration — single source of truth for labels, icons, colours
// ─────────────────────────────────────────────────────────────────────────────
export type ModeOrAuto = Mode | 'auto';

export interface ModeConfig {
  key: ModeOrAuto;
  label: string;
  description: string;
  icon: React.ElementType;
  pill: string;       // pill badge on AI messages
  active: string;     // selector button when selected
  inactive: string;   // selector button when not selected
}

export const MODE_CONFIG: ModeConfig[] = [
  {
    key: 'auto',
    label: 'Auto',
    description: 'Let TheWeddingBot choose the best approach for you',
    icon: Sparkles,
    pill: 'bg-mode-auto/10 text-mode-auto',
    active: 'bg-mode-auto-active text-primary-foreground shadow-sm',
    inactive: 'text-foreground/60 hover:bg-foreground/15',
  },
  {
    key: 'planner',
    label: 'Planner',
    description: 'Create timelines, tasks, and organize your wedding',
    icon: Calendar,
    pill: 'bg-primary/10 text-primary',
    active: 'bg-primary text-primary-foreground shadow-sm',
    inactive: 'text-foreground/60 hover:bg-foreground/15',
  },
  {
    key: 'stylist',
    label: 'Stylist',
    description: 'Get aesthetic advice and design inspiration',
    icon: Heart,
    pill: 'bg-mode-stylist/10 text-mode-stylist',
    active: 'bg-mode-stylist-active text-primary-foreground shadow-sm',
    inactive: 'text-foreground/60 hover:bg-foreground/15',
  },
  {
    key: 'knowledge',
    label: 'Knowledge',
    description: 'Get answers to wedding etiquette and planning questions',
    icon: Lightbulb,
    pill: 'bg-mode-knowledge/10 text-mode-knowledge',
    active: 'bg-mode-knowledge-active text-primary-foreground shadow-sm',
    inactive: 'text-foreground/60 hover:bg-foreground/15',
  },
];

export const modeConfig = (key: ModeOrAuto): ModeConfig =>
  MODE_CONFIG.find((m) => m.key === key) ?? MODE_CONFIG[0];

// ─────────────────────────────────────────────────────────────────────────────
// Tag presets for conversation organization
// ─────────────────────────────────────────────────────────────────────────────
export const TAG_PRESETS = [
  { name: 'Venue',      color: 'bg-tag-venue/15 text-tag-venue-fg border-tag-venue/25' },
  { name: 'Catering',   color: 'bg-tag-catering/15 text-tag-catering-fg border-tag-catering/25' },
  { name: 'Budget',     color: 'bg-success/15 text-success-subtle border-success/25' },
  { name: 'Style',      color: 'bg-cat-timeline/15 text-cat-timeline-fg border-cat-timeline/25' },
  { name: 'Attire',     color: 'bg-cat-milestone/15 text-cat-milestone-fg border-cat-milestone/25' },
  { name: 'Music',      color: 'bg-tag-music/15 text-tag-music-fg border-tag-music/25' },
  { name: 'Flowers',    color: 'bg-tag-flowers/15 text-tag-flowers-fg border-tag-flowers/25' },
  { name: 'Photo',      color: 'bg-cat-budget/15 text-cat-budget-fg border-cat-budget/25' },
  { name: 'Guest List', color: 'bg-tag-guest/15 text-tag-guest-fg border-tag-guest/25' },
  { name: 'Other',      color: 'bg-foreground/10 text-foreground/70 border-foreground/20' },
];

export const getTagStyle = (tagName: string) =>
  TAG_PRESETS.find(t => t.name === tagName)?.color ?? 'bg-foreground/10 text-foreground/70 border-foreground/20';

// ─────────────────────────────────────────────────────────────────────────────
// Markdown to HTML converter for rich text copying
// ─────────────────────────────────────────────────────────────────────────────
export const markdownToHtml = (markdown: string): string => {
  const html = markdown
    .split('\n\n')
    .map(block => {
      block = block
        .replace(/\*\*(.*?)\*\*|__(.*?)__/g, '<strong>$1$2</strong>')
        .replace(/(?<!\*)\*(.*?)(?<!\*)\*|(?<!_)_(.*?)(?<!_)_/g, '<em>$1$2</em>')
        .replace(/`([^`]+)`/g, '<code style="background-color: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-family: monospace;">$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #B8860B; text-decoration: underline;">$1</a>')
        .replace(/^### (.*?)$/gm, '<h3 style="font-weight: bold; font-size: 1.1em; margin: 0.5em 0;">$1</h3>')
        .replace(/^## (.*?)$/gm, '<h2 style="font-weight: bold; font-size: 1.3em; margin: 0.5em 0;">$1</h2>')
        .replace(/^# (.*?)$/gm, '<h1 style="font-weight: bold; font-size: 1.5em; margin: 0.5em 0;">$1</h1>')
        .replace(/^\* (.*?)$/gm, '<li>$1</li>')
        .replace(/^\- (.*?)$/gm, '<li>$1</li>')
        .replace(/^> (.*?)$/gm, '<blockquote style="border-left: 3px solid #ccc; padding-left: 10px; margin: 10px 0; color: #666;">$1</blockquote>');

      if (block.includes('<li>')) {
        block = '<ul style="margin: 10px 0; padding-left: 20px;">' + block + '</ul>';
      }

      if (block && !block.match(/^<[hp]/)) {
        block = '<p style="margin: 10px 0; line-height: 1.5;">' + block + '</p>';
      }

      return block;
    })
    .join('');

  return `<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6;">${html}</body></html>`;
};
