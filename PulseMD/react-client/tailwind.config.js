export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        clinic: {
          blue: '#0284c7',
          green: '#0f8f83',
          mint: '#ecfdf5',
          ink: '#0f172a'
        }
      },
      boxShadow: {
        soft: '0 14px 35px rgba(15, 23, 42, 0.08)'
      }
    }
  },
  plugins: []
};
