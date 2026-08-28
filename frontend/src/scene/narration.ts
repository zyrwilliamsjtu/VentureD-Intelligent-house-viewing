import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import { agentChat, getSessionId, loadScene } from '../services/agent'
import { playTts } from './agentActions'

// ==== 进房主动讲解（SPEC §3.1 event=enter_room / §3.4 narration）====
// 订阅 store.player.room_id（视口 200ms 节流发布的房间归因，点云系 polygon 判定），
// 房间切换后防抖 700ms 触发一次 agentChat(event='enter_room')，回答走 toast + TTS。
// 每房间每会话只讲一次（Set 去重，防止来回踱步刷屏）；失败静默，绝不打断漫游。
// 注意：未对拍世界 room_id 恒为 null（WORKLOG D3 恒等降级）→ 本 hook 自然不触发。

const DEBOUNCE_MS = 700

export function useRoomNarration(): void {
  const entered = useAppStore((s) => s.entered)

  useEffect(() => {
    if (!entered) return
    const narrated = new Set<string>()
    let timer: number | null = null
    let alive = true

    const unsub = useAppStore.subscribe((s, prev) => {
      const room = s.player?.room_id ?? null
      if (room === (prev.player?.room_id ?? null)) return // 只关心房间切换
      if (timer) window.clearTimeout(timer)
      if (!room) return // 走出房间（走廊/归因失败）：不触发

      // 防抖：门口晃动不算进房；期间房间又变了则作废
      timer = window.setTimeout(() => {
        timer = null
        if (!alive) return
        const st = useAppStore.getState()
        const p = st.player
        if (!p || p.room_id !== room || narrated.has(room)) return
        narrated.add(room)
        void (async () => {
          try {
            const res = await agentChat({
              session_id: getSessionId(),
              world_id: p.world_id,
              user_text: null,
              player_position: p.position,
              player_facing: p.facing,
              room_id: room,
              event: 'enter_room',
            })
            if (!alive || !res.reply_text) return
            const scene = await loadScene(p.world_id)
            const name = scene?.rooms.find((r) => r.id === room)?.name ?? '当前房间'
            st.showToast(name, res.reply_text)
            playTts(res.tts_url)
          } catch {
            /* 讲解失败静默：不影响漫游与对话 */
          }
        })()
      }, DEBOUNCE_MS)
    })

    return () => {
      alive = false
      if (timer) window.clearTimeout(timer)
      unsub()
    }
  }, [entered])
}
