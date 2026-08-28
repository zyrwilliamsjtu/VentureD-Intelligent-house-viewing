import { useEffect, useState } from 'react'
import { getSessionId } from '../services/agent'
import { agentRecommend, type RecommendResult } from '../services/recommend'
import { WORLD_LISTINGS, type WorldListing } from '../scene/worlds'
import { useAppStore } from '../store/useAppStore'

export function RecommendAsk({
  open,
  onClose,
  onOpenDetail,
}: {
  open: boolean
  onClose: () => void
  onOpenDetail: (listing: WorldListing) => void
}) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RecommendResult | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const resetAsk = () => {
    setResult(null)
    setQ('')
  }

  const send = async () => {
    const text = q.trim()
    if (!text || busy) return
    setBusy(true)
    setResult(null)
    try {
      const body = await agentRecommend(text, getSessionId())
      setResult(body)
      if (!body.listing_id && body.reason) {
        useAppStore.getState().showToast('小驻', body.reason)
      }
    } catch {
      useAppStore.getState().showToast('小驻暂时开小差了', '换个说法试试')
    } finally {
      setBusy(false)
    }
  }

  const listing = result?.listing_id
    ? WORLD_LISTINGS.find((w) => w.listing_id === result.listing_id) ?? null
    : null

  return (
    <div className="ld-overlay" onClick={onClose} role="presentation">
      <div
        className="rq-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rq-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ld-head">
          <div>
            <h2 id="rq-title">问问小驻</h2>
            <div className="ld-code">说需求，小驻从实景房源里挑一套</div>
          </div>
          <button type="button" className="ld-close" onClick={onClose} aria-label="关闭">
            关闭
          </button>
        </header>
        <div className="rq-body">
          <label className="hl-field hl-grow">
            <span>您想找什么样的房子</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void send()
              }}
              placeholder="例如：我想要有书房的"
              disabled={busy}
            />
          </label>
          <button type="button" className="splash-btn rq-send" onClick={() => void send()} disabled={busy || !q.trim()}>
            {busy ? '小驻在想…' : '发送'}
          </button>
          {result?.listing_id && listing ? (
            <div className="rq-hit">
              <div className="rq-hit-name">
                {result.title ?? listing.title}
                {result.code || listing.code ? ` · ${result.code ?? listing.code}` : ''}
              </div>
              <p>{result.reason}</p>
              <div className="rq-actions">
                <button type="button" className="splash-btn rq-detail" onClick={() => onOpenDetail(listing)}>
                  查看详情
                </button>
                <button type="button" className="hl-clear" onClick={resetAsk}>
                  重新提问
                </button>
              </div>
            </div>
          ) : result && !result.listing_id ? (
            <p className="rq-guide">{result.reason}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
