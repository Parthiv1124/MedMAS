/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans:  ['Inter', 'system-ui', 'sans-serif'],
        mono:  ['JetBrains Mono', 'monospace'],
      },
      colors: {
        brand: {
          50:  '#eef7ff',
          100: '#d9edff',
          200: '#bce0ff',
          300: '#8ecdff',
          400: '#59b0ff',
          500: '#338dff',
          600: '#1a6ef5',
          700: '#1358e1',
          800: '#1647b6',
          900: '#183f8f',
          950: '#132857',
        },
        teal: {
          50:  '#effefb',
          100: '#c7fff3',
          200: '#90ffe8',
          300: '#51f7d9',
          400: '#1de4c5',
          500: '#05c8ac',
          600: '#00a28e',
          700: '#058173',
          800: '#0a665d',
          900: '#0d544d',
        },
        // Cyber/neon palette
        cyber: {
          cyan:    '#00d4ff',
          violet:  '#8b5cf6',
          green:   '#00ff94',
          amber:   '#ffb300',
          rose:    '#ff3366',
          blue:    '#3b82f6',
          base:    '#050a14',
          surface: '#0c1627',
          surface2:'#112040',
        },
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: { DEFAULT: 'var(--destructive)' },
        border: 'var(--border)',
        input:  'var(--input)',
        ring:   'var(--ring)',
        sidebar: {
          DEFAULT:               'var(--sidebar)',
          foreground:            'var(--sidebar-foreground)',
          primary:               'var(--sidebar-primary)',
          'primary-foreground':  'var(--sidebar-primary-foreground)',
          accent:                'var(--sidebar-accent)',
          'accent-foreground':   'var(--sidebar-accent-foreground)',
          border:                'var(--sidebar-border)',
          ring:                  'var(--sidebar-ring)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      animation: {
        'float':        'float 6s ease-in-out infinite',
        'float-delay':  'float 6s ease-in-out 2s infinite',
        'float-slow':   'float 10s ease-in-out 1s infinite',
        'glow':         'glow 2s ease-in-out infinite alternate',
        'neon-pulse':   'neonPulse 2.5s ease-in-out infinite',
        'scan':         'scanLine 3s linear infinite',
        'orbit':        'orbit 8s linear infinite',
        'slide-up':     'slideUp 0.4s ease-out',
        'slide-in-r':   'slideInRight 0.3s ease-out',
        'slide-in-l':   'slideInLeft 0.3s ease-out',
        'fade-in':      'fadeIn 0.5s ease-out',
        'scale-in':     'scaleIn 0.3s ease-out',
        'shimmer':      'shimmer 2s infinite',
        'typing':       'typing 1.4s infinite',
        'flicker':      'flicker 4s linear infinite',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-20px)' },
        },
        glow: {
          '0%':   { boxShadow: '0 0 20px rgba(0,212,255,0.2)' },
          '100%': { boxShadow: '0 0 50px rgba(0,212,255,0.5)' },
        },
        neonPulse: {
          '0%, 100%': { opacity: '0.7', boxShadow: '0 0 8px rgba(0,212,255,0.4)' },
          '50%':      { opacity: '1',   boxShadow: '0 0 24px rgba(0,212,255,0.8), 0 0 48px rgba(0,212,255,0.3)' },
        },
        scanLine: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
        orbit: {
          '0%':   { transform: 'rotate(0deg) translateX(60px) rotate(0deg)' },
          '100%': { transform: 'rotate(360deg) translateX(60px) rotate(-360deg)' },
        },
        slideUp: {
          '0%':   { opacity: 0, transform: 'translateY(16px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%':   { opacity: 0, transform: 'translateX(20px)' },
          '100%': { opacity: 1, transform: 'translateX(0)' },
        },
        slideInLeft: {
          '0%':   { opacity: 0, transform: 'translateX(-20px)' },
          '100%': { opacity: 1, transform: 'translateX(0)' },
        },
        fadeIn: {
          '0%':   { opacity: 0 },
          '100%': { opacity: 1 },
        },
        scaleIn: {
          '0%':   { opacity: 0, transform: 'scale(0.9)' },
          '100%': { opacity: 1, transform: 'scale(1)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        typing: {
          '0%':   { opacity: 0.2 },
          '20%':  { opacity: 1 },
          '100%': { opacity: 0.2 },
        },
        flicker: {
          '0%, 95%, 100%': { opacity: 1 },
          '96%':           { opacity: 0.6 },
          '97%':           { opacity: 1 },
          '98%':           { opacity: 0.4 },
          '99%':           { opacity: 1 },
        },
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'cyber-grid':
          'linear-gradient(rgba(0,212,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.04) 1px, transparent 1px)',
      },
      backdropBlur: { xs: '2px' },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
