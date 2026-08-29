/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			/* ---- Midnight Travel Luxe brand tokens ---- */
  			cinema: 'hsl(var(--cinema))',
  			'surface-dark': 'hsl(var(--surface-dark))',
  			workflow: 'hsl(var(--workflow))',
  			ink: 'hsl(var(--ink))',
  			'on-dark': 'hsl(var(--on-dark))',
  			'muted-dark': 'hsl(var(--muted-dark))',
  			teal: 'hsl(var(--teal))',
  			coral: 'hsl(var(--coral))',
  			/* WhereNova design system tokens (Build 7). rgb(var(--x) / <alpha-value>)
  			   so bg-wn-x/NN etc. actually work -- see docs/wherenova-polish-pass-v3.md
  			   Part A. wn-line/wn-line-2 are the exception: they stay a plain var()
  			   reference to an rgba() literal, since their whole point is a translucent
  			   default with no modifier ever applied to them (see index.css). */
  			'wn-page': 'rgb(var(--wn-page) / <alpha-value>)',
  			'wn-page-2': 'rgb(var(--wn-page-2) / <alpha-value>)',
  			'wn-surface': 'rgb(var(--wn-surface) / <alpha-value>)',
  			'wn-surface-2': 'rgb(var(--wn-surface-2) / <alpha-value>)',
  			'wn-line': 'var(--wn-line)',
  			'wn-line-2': 'var(--wn-line-2)',
  			'wn-text': 'rgb(var(--wn-text) / <alpha-value>)',
  			'wn-text-2': 'rgb(var(--wn-text-2) / <alpha-value>)',
  			'wn-text-3': 'rgb(var(--wn-text-3) / <alpha-value>)',
  			'wn-page-l': 'rgb(var(--wn-page-l) / <alpha-value>)',
  			'wn-page-2-l': 'rgb(var(--wn-page-2-l) / <alpha-value>)',
  			'wn-surface-l': 'rgb(var(--wn-surface-l) / <alpha-value>)',
  			'wn-surface-2-l': 'rgb(var(--wn-surface-2-l) / <alpha-value>)',
  			'wn-line-l': 'rgb(var(--wn-line-l) / <alpha-value>)',
  			'wn-line-2-l': 'rgb(var(--wn-line-2-l) / <alpha-value>)',
  			'wn-text-l': 'rgb(var(--wn-text-l) / <alpha-value>)',
  			'wn-text-2-l': 'rgb(var(--wn-text-2-l) / <alpha-value>)',
  			'wn-text-3-l': 'rgb(var(--wn-text-3-l) / <alpha-value>)',
  			'wn-cyan': 'rgb(var(--wn-cyan) / <alpha-value>)',
  			'wn-cyan-2': 'rgb(var(--wn-cyan-2) / <alpha-value>)',
  			'wn-cyan-bright': 'rgb(var(--wn-cyan-bright) / <alpha-value>)',
  			'wn-coral': 'rgb(var(--wn-coral) / <alpha-value>)',
  			'wn-ink-deep': 'rgb(var(--wn-ink-deep) / <alpha-value>)',
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		fontFamily: {
  			heading: ['var(--font-heading)'],
  			body: ['var(--font-body)'],
  			display: ['var(--font-display)'],
  			mono: ['var(--font-mono)']
  		},
  		keyframes: {
  			'accordion-down': {
  				from: { height: '0' },
  				to: { height: 'var(--radix-accordion-content-height)' }
  			},
  			'accordion-up': {
  				from: { height: 'var(--radix-accordion-content-height)' },
  				to: { height: '0' }
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}
