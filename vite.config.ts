import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite 配置：纯前端单页应用，构建产物直接丢到 Netlify
export default defineConfig({
  plugins: [react()],
  // 用相对路径，Netlify 上无论部署在根目录还是子路径都能跑
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    outDir: 'dist',
    // 词书 JSON 体量较大，放宽 chunk 体积告警阈值
    chunkSizeWarningLimit: 2000,
  },
})
