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
				headline: ['Noto Serif', 'serif'],
				body: ['Inter', 'sans-serif'],
				label: ['Inter', 'sans-serif'],
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
				border:     'hsl(var(--border))',         // #EBE4D9 — warm beige
				input:      'hsl(var(--input))',
				ring:       'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',

				// Brand — Sage green palette
				primary: {
					DEFAULT:   '#A2B29D',                 // sage green
					foreground:'hsl(var(--primary-foreground))',
					container: '#DDE6C7',                 // light sage
					muted:     '#8a9e84',                 // deeper sage (hover / accent)
				},

				// Secondary — slate
				secondary: {
					DEFAULT:   '#4A5568',
					foreground:'hsl(var(--secondary-foreground))',
					container: '#E2E8F0',
				},

				// Status
				destructive: {
					DEFAULT:   'hsl(var(--destructive))',
					foreground:'hsl(var(--destructive-foreground))',
				},

				// Neutral surfaces
				muted: {
					DEFAULT:   'hsl(var(--muted))',
					foreground:'hsl(var(--muted-foreground))',
				},
				accent: {
					DEFAULT:   'hsl(var(--accent))',
					foreground:'hsl(var(--accent-foreground))',
				},
				popover: {
					DEFAULT:   'hsl(var(--popover))',
					foreground:'hsl(var(--popover-foreground))',
				},
				card: {
					DEFAULT:   'hsl(var(--card))',
					foreground:'hsl(var(--card-foreground))',
				},

				// Sidebar
				sidebar: {
					DEFAULT:              'hsl(var(--sidebar-background))',
					foreground:           'hsl(var(--sidebar-foreground))',
					primary:              'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent:               'hsl(var(--sidebar-accent))',
					'accent-foreground':  'hsl(var(--sidebar-accent-foreground))',
					border:               'hsl(var(--sidebar-border))',
					ring:                 'hsl(var(--sidebar-ring))',
				},

				// Surface elevation scale (Material Design 3 / Stitch style)
				surface: {
					DEFAULT:              'hsl(var(--surface))',
					container:            'hsl(var(--surface-container))',
					'container-low':      'hsl(var(--surface-container-low))',
					'container-high':     'hsl(var(--surface-container-high))',
					'container-highest':  'hsl(var(--surface-container-highest))',
				},
				outline: {
					DEFAULT: 'hsl(var(--outline))',
					variant: 'hsl(var(--outline-variant))',
				},

				// AI Mode palette — each mode has a distinct brand colour
				'mode-auto':        '#71717A',   // neutral zinc
				'mode-planner':     '#A2B29D',   // sage (= primary)
				'mode-stylist':     '#D4AF37',   // gold
				'mode-stylist-dark':'#B8860B',   // dark gold (hover / border)
				'mode-therapist':   '#64748B',   // slate blue
				'mode-knowledge':   '#334155',   // deep navy
				'mode-consultant':  '#A87C33',   // warm amber
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
