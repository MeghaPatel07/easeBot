import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			// ─── Typography ─────────────────────────────────────────────────────────
			fontFamily: {
				headline: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
				body: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
				label: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
			},
			fontSize: {
				// Micro scale — used for labels, badges, timestamps
				'3xs':    ['9px',  { lineHeight: '12px', letterSpacing: '0.01em' }],
				'2xs':    ['10px', { lineHeight: '14px', letterSpacing: '0.005em' }],
				'label':  ['11px', { lineHeight: '16px', letterSpacing: '0.005em' }],
				'caption':['13px', { lineHeight: '18px' }],
				// Standard scale continues as Tailwind defaults (xs=12, sm=14, base=16…)
			},

			// ─── Colors ─────────────────────────────────────────────────────────────
			colors: {
				// Semantic base
				border:     'hsl(var(--border) / <alpha-value>)',         // #EBE4D9 — warm beige
				input:      'hsl(var(--input) / <alpha-value>)',
				ring:       'hsl(var(--ring) / <alpha-value>)',
				background: 'hsl(var(--background) / <alpha-value>)',
				foreground: 'hsl(var(--foreground) / <alpha-value>)',

				// Brand — Bronze (Figma: #A17A63)
				primary: {
					DEFAULT:   'hsl(var(--primary) / <alpha-value>)',
					foreground:'hsl(var(--primary-foreground) / <alpha-value>)',
					container: 'hsl(var(--primary-container) / <alpha-value>)',
					muted:     'hsl(var(--primary-hover) / <alpha-value>)',
					hover:     'hsl(var(--primary-hover) / <alpha-value>)',
					subtle:    'hsl(var(--primary-subtle) / <alpha-value>)',
					light:     'hsl(var(--primary-light) / <alpha-value>)',
					bright:    'hsl(var(--primary-bright) / <alpha-value>)',
				},

				// Secondary — warm rose (Figma: #D6C1C7)
				secondary: {
					DEFAULT:   'hsl(var(--secondary) / <alpha-value>)',
					foreground:'hsl(var(--secondary-foreground) / <alpha-value>)',
					container: 'hsl(var(--secondary-container) / <alpha-value>)',
				},

				// Status
				destructive: {
					DEFAULT:   'hsl(var(--destructive) / <alpha-value>)',
					foreground:'hsl(var(--destructive-foreground) / <alpha-value>)',
					subtle:    'hsl(var(--destructive-subtle) / <alpha-value>)',
				},

				warning: {
					DEFAULT:    'hsl(var(--warning) / <alpha-value>)',
					foreground: 'hsl(var(--warning-foreground) / <alpha-value>)',
					subtle:     'hsl(var(--warning-subtle) / <alpha-value>)',
				},

				success: {
					DEFAULT:    'hsl(var(--success) / <alpha-value>)',
					foreground: 'hsl(var(--success-foreground) / <alpha-value>)',
					subtle:     'hsl(var(--success-subtle) / <alpha-value>)',
				},

				info: {
					DEFAULT:    'hsl(var(--info) / <alpha-value>)',
					foreground: 'hsl(var(--info-foreground) / <alpha-value>)',
					subtle:     'hsl(var(--info-subtle) / <alpha-value>)',
				},

				tag: {
					venue:          'hsl(var(--tag-venue) / <alpha-value>)',
					'venue-fg':     'hsl(var(--tag-venue-fg) / <alpha-value>)',
					catering:       'hsl(var(--tag-catering) / <alpha-value>)',
					'catering-fg':  'hsl(var(--tag-catering-fg) / <alpha-value>)',
					ceremony:       'hsl(var(--tag-ceremony) / <alpha-value>)',
					'ceremony-fg':  'hsl(var(--tag-ceremony-fg) / <alpha-value>)',
					reception:      'hsl(var(--tag-reception) / <alpha-value>)',
					'reception-fg': 'hsl(var(--tag-reception-fg) / <alpha-value>)',
					honeymoon:      'hsl(var(--tag-honeymoon) / <alpha-value>)',
					'honeymoon-fg': 'hsl(var(--tag-honeymoon-fg) / <alpha-value>)',
					guest:          'hsl(var(--tag-guest) / <alpha-value>)',
					'guest-fg':     'hsl(var(--tag-guest-fg) / <alpha-value>)',
					vendor:         'hsl(var(--tag-vendor) / <alpha-value>)',
					'vendor-fg':    'hsl(var(--tag-vendor-fg) / <alpha-value>)',
					music:          'hsl(var(--tag-music) / <alpha-value>)',
					'music-fg':     'hsl(var(--tag-music-fg) / <alpha-value>)',
					flowers:        'hsl(var(--tag-flowers) / <alpha-value>)',
					'flowers-fg':   'hsl(var(--tag-flowers-fg) / <alpha-value>)',
				},

				// Neutral surfaces
				muted: {
					DEFAULT:   'hsl(var(--muted) / <alpha-value>)',
					foreground:'hsl(var(--muted-foreground) / <alpha-value>)',
				},
				accent: {
					DEFAULT:   'hsl(var(--accent) / <alpha-value>)',
					foreground:'hsl(var(--accent-foreground) / <alpha-value>)',
				},
				popover: {
					DEFAULT:   'hsl(var(--popover) / <alpha-value>)',
					foreground:'hsl(var(--popover-foreground) / <alpha-value>)',
				},
				card: {
					DEFAULT:   'hsl(var(--card) / <alpha-value>)',
					foreground:'hsl(var(--card-foreground) / <alpha-value>)',
				},

				// Sidebar
				sidebar: {
					DEFAULT:              'hsl(var(--sidebar-background) / <alpha-value>)',
					foreground:           'hsl(var(--sidebar-foreground) / <alpha-value>)',
					primary:              'hsl(var(--sidebar-primary) / <alpha-value>)',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground) / <alpha-value>)',
					accent:               'hsl(var(--sidebar-accent) / <alpha-value>)',
					'accent-foreground':  'hsl(var(--sidebar-accent-foreground) / <alpha-value>)',
					border:               'hsl(var(--sidebar-border) / <alpha-value>)',
					ring:                 'hsl(var(--sidebar-ring) / <alpha-value>)',
				},

				// Surface elevation scale (Material Design 3 / Stitch style)
				surface: {
					DEFAULT:              'hsl(var(--surface) / <alpha-value>)',
					container:            'hsl(var(--surface-container) / <alpha-value>)',
					'container-low':      'hsl(var(--surface-container-low) / <alpha-value>)',
					'container-high':     'hsl(var(--surface-container-high) / <alpha-value>)',
					'container-highest':  'hsl(var(--surface-container-highest) / <alpha-value>)',
					elevated:             'hsl(var(--card-elevated) / <alpha-value>)',
				},
				// Card elevated surface (replaces raw #0F0D0C in modals/menus)
				'card-elevated':        'hsl(var(--card-elevated) / <alpha-value>)',
				'popover-elevated':     'hsl(var(--card-elevated) / <alpha-value>)',
				'surface-note':         'hsl(var(--surface-note) / <alpha-value>)',
				'surface-popover-alt':  'hsl(var(--surface-popover-alt) / <alpha-value>)',
				'surface-tooltip':      'hsl(var(--surface-tooltip) / <alpha-value>)',
				'surface-toast':        'hsl(var(--surface-toast) / <alpha-value>)',
				'accent-gold':          'hsl(var(--accent-gold) / <alpha-value>)',
				'accent-sage':          'hsl(var(--accent-sage) / <alpha-value>)',

				// Overlay tokens — lightbox/toolbar scrims. Always dark-leaning,
				// even in light mode (cinema-style viewer chrome).
				'overlay-scrim':        'hsl(var(--overlay-scrim) / <alpha-value>)',
				'overlay-surface':      'hsl(var(--overlay-surface) / <alpha-value>)',
				'overlay-border':       'hsl(var(--overlay-border) / <alpha-value>)',
				'overlay-text':         'hsl(var(--overlay-text) / <alpha-value>)',
				outline: {
					DEFAULT: 'hsl(var(--outline) / <alpha-value>)',
					variant: 'hsl(var(--outline-variant) / <alpha-value>)',
				},

				// Category / status palette — used by timeline, planner, budget, progress.
				// All referenced via `cat.*` tokens so light/dark toggle works.
				cat: {
					budget:           'hsl(var(--cat-budget) / <alpha-value>)',
					'budget-fg':      'hsl(var(--cat-budget-fg) / <alpha-value>)',
					'budget-deep':    'hsl(var(--cat-budget-deep) / <alpha-value>)',
					'budget-darker':  'hsl(var(--cat-budget-darker) / <alpha-value>)',
					timeline:         'hsl(var(--cat-timeline) / <alpha-value>)',
					'timeline-fg':    'hsl(var(--cat-timeline-fg) / <alpha-value>)',
					'timeline-soft':  'hsl(var(--cat-timeline-soft) / <alpha-value>)',
					'timeline-deep':  'hsl(var(--cat-timeline-deep) / <alpha-value>)',
					milestone:        'hsl(var(--cat-milestone) / <alpha-value>)',
					'milestone-fg':   'hsl(var(--cat-milestone-fg) / <alpha-value>)',
					planner:          'hsl(var(--cat-planner) / <alpha-value>)',
					'planner-fg':     'hsl(var(--cat-planner-fg) / <alpha-value>)',
					stylist:          'hsl(var(--cat-stylist) / <alpha-value>)',
					knowledge:        'hsl(var(--cat-knowledge) / <alpha-value>)',
					auto:             'hsl(var(--cat-auto) / <alpha-value>)',
				},

				// AI Mode palette — aliases onto the category tokens above
				'mode-auto':              'hsl(var(--cat-auto) / <alpha-value>)',
				'mode-planner':           'hsl(var(--cat-planner) / <alpha-value>)',
				'mode-stylist':           'hsl(var(--cat-stylist) / <alpha-value>)',
				'mode-stylist-dark':      'hsl(var(--primary-hover) / <alpha-value>)',
				'mode-knowledge':         'hsl(var(--cat-knowledge) / <alpha-value>)',
				'mode-auto-active':       'hsl(var(--mode-auto-active) / <alpha-value>)',
				'mode-stylist-active':    'hsl(var(--mode-stylist-active) / <alpha-value>)',
				'mode-knowledge-active':  'hsl(var(--mode-knowledge-active) / <alpha-value>)',
			},

			// ─── Shadows ────────────────────────────────────────────────────────────
			boxShadow: {
				subtle:        'var(--shadow-sm)',
				elevated:      'var(--shadow-md)',
				floating:      'var(--shadow-lg)',
				modal:         'var(--shadow-modal)',
				dropdown:      'var(--shadow-dropdown)',
				'dropdown-sm': 'var(--shadow-dropdown-sm)',
				glass:         'var(--shadow-glass)',
				card:          'var(--shadow-card)',
				'glow-brand':  'var(--shadow-glow-brand)',
				'input-focus': 'var(--shadow-input-focus)',
				'card-hover':  'var(--shadow-card-hover)',
			},

			// ─── Gradients ──────────────────────────────────────────────────────────
			backgroundImage: {
				'grad-brand-bloom': 'var(--grad-brand-bloom)',
				'grad-sidebar':     'var(--grad-sidebar)',
				'grad-sidebar-chip':'var(--grad-sidebar-chip)',
			},

			// ─── Border Radius ───────────────────────────────────────────────────────
			borderRadius: {
				sm:   'calc(var(--radius) - 4px)',
				md:   'calc(var(--radius) - 2px)',
				lg:   'var(--radius)',
				xl:   'calc(var(--radius) + 4px)',
				'2xl':'1rem',
				'3xl':'1.5rem',
			},

			// ─── Animations ──────────────────────────────────────────────────────────
			keyframes: {
				'accordion-down': {
					from: { height: '0' },
					to:   { height: 'var(--radix-accordion-content-height)' },
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to:   { height: '0' },
				},
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up':   'accordion-up 0.2s ease-out',
			},
		}
	},
	plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
