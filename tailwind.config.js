/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // 设计语言：白底 + 暖灰按钮 + 蓝紫主色，干净、克制
      colors: {
        ink: {
          900: '#15171c',
          700: '#3b3f4a',
          500: '#6b7280',
          400: '#9aa0ab',
          300: '#c4c9d2',
          200: '#e3e6ec',
          100: '#eef0f4',
          50: '#f7f8fa',
        },
        brand: {
          500: '#4f6ef7',
          600: '#3f5ae0',
          50: '#eef2ff',
        },
      },
      fontFamily: {
        // 单词用衬线体，中文字义用无衬线
        word: ['"Iowan Old Style"', '"Palatino Linotype"', 'Georgia', 'serif'],
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 12px 32px -12px rgba(16,24,40,.12)',
        lift: '0 2px 6px rgba(16,24,40,.06), 0 18px 40px -16px rgba(16,24,40,.18)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .28s cubic-bezier(.22,.61,.36,1) both',
        'pop-in': 'pop-in .2s cubic-bezier(.22,.61,.36,1) both',
      },
    },
  },
  plugins: [],
}
