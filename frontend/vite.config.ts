import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' 让构建产物可部署在任意子路径（GitHub Pages / 静态目录均可）
// server.proxy：dev 期 /api 转发后端网关（默认本机 8000，可用 env 覆盖）→ 前端同源请求，
// 无跨源/CORS 问题；生产环境同理建议反代同域，或 .env 指定绝对 VITE_API_BASE
export default defineConfig({
  base: './',
  plugins: [react()],
  optimizeDeps: {
    // 排除预打包，让 Aholo Viewer 内部的 splat-worker / transcoder-worker
    // 以真实相对路径（/@fs/.../dist/splat-worker.js）被 dev 服务器正常提供；
    // 否则 dev 下 /node_modules/.vite/deps/splat-worker.js 404 → 点云解码失败 → 黑屏
    exclude: ['@manycore/aholo-viewer'],
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      // 后端 TTS 产物挂在 /static/tts/xxx.mp3（相对路径）；dev 期一并代理到网关，
      // 否则前端 new Audio('/static/...') 会打到 5173 端口 404
      '/static': {
        target: process.env.VITE_API_BASE || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
