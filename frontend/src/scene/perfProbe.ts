/** 漫游性能探针：控制台 `[perf]` / `[boot]`。不进契约。 */

export interface GpuProbe {
  vendor: string
  gpu: string
  canvases: number
  software: boolean
}

export function probeGpu(gl: WebGLRenderingContext | WebGL2RenderingContext): GpuProbe {
  const ext = gl.getExtension('WEBGL_debug_renderer_info') as {
    UNMASKED_VENDOR_WEBGL: number
    UNMASKED_RENDERER_WEBGL: number
  } | null
  const vendor = String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR))
  const gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
  const software = /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i.test(gpu)
  return { vendor, gpu, canvases: document.querySelectorAll('canvas').length, software }
}

let hudRenders = 0

export function countHudRender(): void {
  hudRenders += 1
}

export function drainHudRenders(): number {
  const n = hudRenders
  hudRenders = 0
  return n
}

export function classifyPerf(frameMs: number, renderMs: number, jsMs: number, hud: number, software: boolean): string {
  if (software) return '外部/软件光栅（SwiftShader 或 Basic Render）→ 先开 Chrome 硬件加速并重启'
  if (hud > 20) return 'React：WalkHud 60 帧内重绘过多'
  if (renderMs > frameMs * 0.55 && renderMs > 10) return 'GPU/Spark：renderer.render 占主因'
  if (jsMs > 8) return 'JS：主线程（走动/归因/矩阵）偏高'
  if (frameMs > 22 && renderMs < 8 && jsMs < 6) return 'CSS/合成：JS 与 GPU 提交都不贵，像是画布读回/磨砂合成'
  return '未过载（或抖动未进窗口）'
}
