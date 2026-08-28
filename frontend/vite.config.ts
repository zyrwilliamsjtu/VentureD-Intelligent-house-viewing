import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, searchForWorkspaceRoot, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** InteriorGS 数据盘（未入库）。dev 只读映射 ply；生产请配 VITE_SPLAT_URL_* / VITE_SPLAT_BASE（# 待确认对象存储）。 */
const INTERIORGS_SCENES = 'E:/科研/ventureD_data/interiorgs/scenes'

function serveInteriorGsPly(): Plugin {
  return {
    name: 'serve-interiorgs-ply',
    configureServer(server) {
      console.info('[ply] InteriorGS mapping', INTERIORGS_SCENES)
      // 必须在 html-fallback 之前截获：fetch Accept 含 */* 时 Vite 会把未知路径当成 SPA 回 index.html
      server.middlewares.use((req, res, next) => {
        const raw = (req.originalUrl ?? req.url ?? '').split('?')[0]
        const m = raw.match(/(?:^|\/)ply\/([^/]+)\.ply$/)
        if (!m) {
          next()
          return
        }
        const sceneDir = decodeURIComponent(m[1])
        const file = path.join(INTERIORGS_SCENES, sceneDir, '3dgs_compressed.ply')
        if (!fs.existsSync(file)) {
          console.warn('[ply] 404', sceneDir, file)
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(`ply not found: ${sceneDir}/3dgs_compressed.ply`)
          return
        }
        const stat = fs.statSync(file)
        console.info('[ply] GET', sceneDir, stat.size)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/octet-stream')
        res.setHeader('Content-Length', String(stat.size))
        res.setHeader('Cache-Control', 'no-store')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

// base: './' 让构建产物可部署在任意子路径（GitHub Pages / 静态目录均可）
// server.proxy：dev 期 /api 转发后端网关（默认本机 8000，可用 env 覆盖）→ 前端同源请求，
// 无跨源/CORS 问题；生产环境同理建议反代同域，或 .env 指定绝对 VITE_API_BASE
export default defineConfig({
  base: './',
  plugins: [react(), serveInteriorGsPly()],
  server: {
    port: 5173,
    host: true,
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), INTERIORGS_SCENES],
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/static': {
        target: process.env.VITE_API_BASE || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
