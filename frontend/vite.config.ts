import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' 让构建产物可部署在任意子路径（GitHub Pages / 静态目录均可）
// server.proxy：dev 期 /api 转发后端网关（默认本机 8000，可用 env 覆盖）→ 前端同源请求，
// 无跨源/CORS 问题；生产环境同理建议反代同域，或 .env 指定绝对 VITE_API_BASE
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
