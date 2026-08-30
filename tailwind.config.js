/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // === GOLD VARIANT ===
        gold: {
          primary: '#D4A017',
          light: '#FFD700',
          dark: '#A07810',
          glow: '#FFE066',
        },
        // === LEMON VARIANT ===
        lemon: {
          primary: '#B5E23D',
          light: '#D4FF4A',
          dark: '#8AB52A',
          glow: '#CAFF3A',
        },
        // === SHARED APP COLORS ===
        app: {
          bg: '#0A0B0F',
          card: '#121419',
          cardHover: '#17191F',
          border: 'rgba(0, 212, 255, 0.15)',
          borderGold: 'rgba(212, 160, 23, 0.25)',
          borderLemon: 'rgba(181, 226, 61, 0.25)',
          text: '#FFFFFF',
          textMuted: '#94A3B8',
          textDim: '#64748B',
          success: '#10B981',
          error: '#EF4444',
          warning: '#F59E0B',
          cyan: '#00D4FF',
        },
        // Logo icon colors
        logo: {
          black: '#0D0D0D',
          goldAccent: '#C8960C',
          lemonAccent: '#FFFFFF',
        }
      },
      fontFamily: {
        inter: ['var(--font-inter)'],
        dm: ['var(--font-dm)'],
      },
      backgroundImage: {
        'gold-gradient': 'radial-gradient(ellipse at center, #E8B820 0%, #C49015 40%, #A07810 100%)',
        'lemon-gradient': 'radial-gradient(ellipse at center, #C8F050 0%, #B0D830 40%, #90B820 100%)',
        'app-gradient': 'linear-gradient(135deg, #0A0B0F 0%, #121419 50%, #0A0B0F 100%)',
        'card-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
        'hero-radial': 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0,212,255,0.15), transparent)',
        'gold-hero-radial': 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(212,160,23,0.2), transparent)',
        'lemon-hero-radial': 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(181,226,61,0.2), transparent)',
        'shimmer': 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%)',
      },
      animation: {
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 2.5s linear infinite',
        'spin-slow': 'spin 8s linear infinite',
        'bounce-subtle': 'bounceSubtle 2s ease-in-out infinite',
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.5s ease-out forwards',
        'slide-in-right': 'slideInRight 0.4s ease-out forwards',
        'count-up': 'countUp 0.3s ease-out forwards',
        'orbit': 'orbit 4s linear infinite',
        'trail-fade': 'trailFade 0.5s ease-out forwards',
        'plane-fly': 'planeFly 4.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite',
        'text-shine': 'textShine 3s linear infinite',
        'breathe': 'breathe 4s ease-in-out infinite',
        'stagger-in': 'staggerIn 0.4s ease-out forwards',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0,212,255,0.3), 0 0 40px rgba(0,212,255,0.1)' },
          '50%': { boxShadow: '0 0 40px rgba(0,212,255,0.6), 0 0 80px rgba(0,212,255,0.2)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        bounceSubtle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(30px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        orbit: {
          '0%': { transform: 'rotate(0deg) translateX(60px) rotate(0deg)' },
          '100%': { transform: 'rotate(360deg) translateX(60px) rotate(-360deg)' },
        },
        trailFade: {
          '0%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.5)' },
        },
        textShine: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        breathe: {
          '0%, 100%': { opacity: '0.7', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.02)' },
        },
        staggerIn: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        planeFly: {
          '0%': { transform: 'translate(0, 0) rotate(0deg)' },
          '25%': { transform: 'translate(55px, -40px) rotate(15deg)' },
          '50%': { transform: 'translate(0, -70px) rotate(0deg)' },
          '75%': { transform: 'translate(-55px, -40px) rotate(-15deg)' },
          '100%': { transform: 'translate(0, 0) rotate(0deg)' },
        },
      },
      boxShadow: {
        'gold-glow': '0 0 30px rgba(212, 160, 23, 0.4), 0 0 60px rgba(212, 160, 23, 0.15)',
        'gold-glow-sm': '0 0 15px rgba(212, 160, 23, 0.5)',
        'lemon-glow': '0 0 30px rgba(181, 226, 61, 0.4), 0 0 60px rgba(181, 226, 61, 0.15)',
        'lemon-glow-sm': '0 0 15px rgba(181, 226, 61, 0.5)',
        'cyan-glow': '0 0 30px rgba(0, 212, 255, 0.4)',
        'card': '0 4px 24px rgba(0, 0, 0, 0.4)',
        'card-hover': '0 8px 40px rgba(0, 0, 0, 0.6)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
      },
      backdropBlur: {
        xs: '2px',
      },
      screens: {
        'xs': '375px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },
    },
  },
  plugins: [],
}
