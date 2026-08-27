import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' 让构建产物可部署在任意子路径（GitHub Pages / 静态目录均可）
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, host: true },
})
