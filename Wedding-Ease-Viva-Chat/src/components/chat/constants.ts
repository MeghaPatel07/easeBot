import {
  Sparkles, Calendar, Heart, Lightbulb,
} from 'lucide-react';
import type { Mode } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Supported languages for the language selector
// ─────────────────────────────────────────────────────────────────────────────
export const SUPPORTED_LANGUAGES = [
  { code: 'auto', label: '🌐 Auto-detect' },
  { code: 'en', label: '🇬🇧 English' },
  { code: 'hi', label: '🇮🇳 Hindi' },
  { code: 'gu', label: '🇮🇳 Gujarati' },
  { code: 'es', label: '🇪🇸 Spanish' },
  { code: 'fr', label: '🇫🇷 French' },
  { code: 'ar', label: '🇸🇦 Arabic' },
  { code: 'pt', label: '🇧🇷 Portuguese' },
  { code: 'de', label: '🇩🇪 German' },
  { code: 'zh', label: '🇨🇳 Chinese' },
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
    active: 'bg-[#8A7E72] text-white shadow-sm',
    inactive: 'text-white/60 hover:bg-white/15',
  },
  {
    key: 'planner',
    label: 'Planner',
    description: 'Create timelines, tasks, and organize your wedding',
    icon: Calendar,
    pill: 'bg-[#A17A63]/10 text-[#A17A63]',
    active: 'bg-[#A17A63] text-white shadow-sm',
    inactive: 'text-white/60 hover:bg-white/15',
  },
  {
    key: 'stylist',
    label: 'Stylist',
    description: 'Get aesthetic advice and design inspiration',
    icon: Heart,
    pill: 'bg-mode-stylist/10 text-mode-stylist',
    active: 'bg-[#D4AF37] text-white shadow-sm',
    inactive: 'text-white/60 hover:bg-white/15',
  },
  {
    key: 'knowledge',
    label: 'Knowledge',
    description: 'Get answers to wedding etiquette and planning questions',
    icon: Lightbulb,
    pill: 'bg-mode-knowledge/10 text-mode-knowledge',
    active: 'bg-[#6B5E52] text-white shadow-sm',
    inactive: 'text-white/60 hover:bg-white/15',
  },
];

export const modeConfig = (key: ModeOrAuto): ModeConfig =>
  MODE_CONFIG.find((m) => m.key === key) ?? MODE_CONFIG[0];

// ─────────────────────────────────────────────────────────────────────────────
// Tag presets for conversation organization
// ─────────────────────────────────────────────────────────────────────────────
export const TAG_PRESETS = [
  { name: 'Venue',      color: 'bg-blue-500/15 text-blue-300 border-blue-500/25' },
  { name: 'Catering',   color: 'bg-orange-500/15 text-orange-300 border-orange-500/25' },
  { name: 'Budget',     color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
  { name: 'Style',      color: 'bg-pink-500/15 text-pink-300 border-pink-500/25' },
  { name: 'Attire',     color: 'bg-purple-500/15 text-purple-300 border-purple-500/25' },
  { name: 'Music',      color: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25' },
  { name: 'Flowers',    color: 'bg-rose-500/15 text-rose-300 border-rose-500/25' },
  { name: 'Photo',      color: 'bg-amber-500/15 text-amber-300 border-amber-500/25' },
  { name: 'Guest List', color: 'bg-teal-500/15 text-teal-300 border-teal-500/25' },
  { name: 'Other',      color: 'bg-white/10 text-white/70 border-white/20' },
];

export const getTagStyle = (tagName: string) =>
  TAG_PRESETS.find(t => t.name === tagName)?.color ?? 'bg-white/10 text-white/70 border-white/20';

// ─────────────────────────────────────────────────────────────────────────────
// Markdown to HTML converter for rich text copying
// ─────────────────────────────────────────────────────────────────────────────
export const markdownToHtml = (markdown: string): string => {
  let html = markdown
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
