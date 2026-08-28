import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import { agentChat, getSessionId, loadScene } from '../services/agent'
import { fetchNarration } from '../services/narration'
import { listingIdForWorld } from './worlds'
import { playTts } from './agentActions'

// 进房讲解：优先 GET /api/agent/narration（story_card + selling_points）；
// 失败/404 回落 chat event=enter_room。带看中跳过，避免与 tour 双讲。
// 每房间每会话只讲一次（前端 Set）；未对拍世界 room_id=null 不触发。

const DEBOUNCE_MS = 700

export function useRoomNarration(worldId: string): void {
  const entered = useAppStore((s) => s.entered)

  useEffect(() => {
    if (!entered) return
    const narrated = new Set<string>()
    let timer: number | null = null
    let alive = true

    const unsub = useAppStore.subscribe((s, prev) => {
      const room = s.player?.room_id ?? null
      if (room === (prev.player?.room_id ?? null)) return
      if (timer) window.clearTimeout(timer)
      if (s.tourActive) return
      if (!room) return

      timer = window.setTimeout(() => {
        timer = null
        if (!alive) return
        const st = useAppStore.getState()
        const p = st.player
        if (!p || st.tourActive || p.room_id !== room || narrated.has(room)) return

        void (async () => {
          try {
            const sid = getSessionId()
            let text = ''
            let tts: string | null | undefined
            let source: 'narration' | 'enter_room' = 'narration'
            try {
              const nar = await fetchNarration({
                worldId: p.world_id,
                roomId: room,
                sessionId: sid,
                listingId: listingIdForWorld(p.world_id),
              })
              if (nar?.reply_text) {
                text = nar.reply_text
                tts = nar.tts_url
              }
            } catch (e) {
              console.warn('[narration] GET 失败 → 回落 enter_room', e)
            }
            if (!text) {
              source = 'enter_room'
              const res = await agentChat({
                session_id: sid,
                world_id: p.world_id,
                user_text: null,
                player_position: p.position,
                player_facing: p.facing,
                room_id: room,
                event: 'enter_room',
              })
              text = res.reply_text ?? ''
              tts = res.tts_url
            }
            if (!alive || !text) return
            narrated.add(room)
            const scene = await loadScene(p.world_id)
            const name = scene?.rooms.find((r) => r.id === room)?.name ?? '当前房间'
            st.showToast(name, text)
            playTts(tts)
            console.info('[narration] %s %s via %s', p.world_id, room, source)
          } catch {
            /* 讲解失败静默 */
          }
        })()
      }, DEBOUNCE_MS)
    })

    return () => {
      alive = false
      if (timer) window.clearTimeout(timer)
      unsub()
    }
  }, [entered, worldId])
}
