import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { House } from '../types/api'

// ==== 极简漫游 HUD：房源信息 · 当前房间 · Agent 占位 · 操作提示 ====

function lockCanvas() {
  const canvas = document.querySelector('canvas')
  void canvas?.requestPointerLock()
}

function AgentStub() {
  const showToast = useAppStore((s) => s.showToast)
  return (
    <button
      className="agent-stub"
      onClick={() => showToast('AI 讲解 · 待接入', 'Agent 就绪后连接 /api/agent（SPEC v2.0）')}
      title="后续接入 Agent"
    >
      <span className="dot" />
      AI 讲解 · 待接入
    </button>
  )
}

function CenterToast() {
  const toast = useAppStore((s) => s.toast)
  const [visible, setVisible] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!toast) return
    setVisible(true)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setVisible(false), 2200)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [toast?.key])

  if (!toast || !visible) return null
  return (
    <div className="center-toast" key={toast.key}>
      <div className="ct-title">{toast.text}</div>
      {toast.sub && <div className="ct-sub">{toast.sub}</div>}
    </div>
  )
}

export function WalkHud() {
  const house = useAppStore((s) => s.house) as House | null
  const currentZone = useAppStore((s) => s.currentZone)
  const locked = useAppStore((s) => s.pointerLocked)
  const zone = house?.zones.find((z) => z.id === currentZone) ?? null

  return (
    <div className="walk-hud">
      {/* 左上：房源信息 */}
      <div className="hud-tl">
        <div className="house-chip">
          {house ? house.meta.title : '场景加载中…'}
          {house && <span className="meta">{house.meta.area}㎡ · {house.meta.floor}层</span>}
        </div>
        <div className="badge-placeholder">LOD 流式 · 体素碰撞 · 点击传送</div>
      </div>

      {/* 右上：当前房间 + Agent 占位 */}
      <div className="hud-tr">
        <div className="room-chip">{zone ? zone.label : '自由漫游'}</div>
        <AgentStub />
      </div>

      {/* 进房提示 */}
      <CenterToast />

      {/* 传送准星（锁定时显示，点击视线落点瞬移） */}
      {locked && <div className="crosshair" />}

      {/* 底部操作提示 */}
      <div className="hint-bar">
        <span><b>W A S D</b> 移动</span>
        <span><b>鼠标</b> 视角</span>
        <span><b>点击</b> 传送</span>
        <span><b>Shift</b> 快走</span>
        <span><b>ESC</b> 释放鼠标</span>
      </div>

      {/* 未锁定时的恢复层 */}
      {!locked && (
        <div className="resume-overlay" onClick={lockCanvas}>
          <div className="resume-card">
            <div className="resume-title">点击继续漫游</div>
            <div className="resume-sub">WASD 移动 · 鼠标控制视角 · ESC 暂停</div>
          </div>
        </div>
      )}
    </div>
  )
}
