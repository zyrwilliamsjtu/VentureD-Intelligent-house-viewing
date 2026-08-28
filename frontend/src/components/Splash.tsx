import { useAppStore } from '../store/useAppStore'
import { LISTINGS } from '../data/listings'
import type { Listing } from '../data/listings'

// ==== 高端房产落地页：玻璃拟态房源卡 · 实景预览 · 精选房源 · 顾问团队 · 预约表单 ====
// 信任感 + 高级感：深色背景上的磨砂玻璃卡片、衬线标题、克制的金色点缀。

const AGENTS = [
  {
    name: '小房 · 讲解官',
    role: 'AI 置业讲解',
    desc: '进房自动讲解，客厅、主卧、厨房，把每个空间的亮点讲给你听。',
    icon: '讲',
  },
  {
    name: '小房 · 带看向导',
    role: '全屋带看',
    desc: '一键带看，按动线逐房间走，想停就停，想去哪瞬移到哪。',
    icon: '带',
  },
  {
    name: '小房 · 答疑顾问',
    role: '24h 在线答疑',
    desc: '价格、户型、朝向、家具，文字或语音问，都按真实挂牌口径回答。',
    icon: '答',
  },
]

function FeaturedCard({ l, onPick }: { l: Listing; onPick: (l: Listing) => void }) {
  return (
    <button className="glass-card prop-card" onClick={() => onPick(l)}>
      <div className="prop-top">
        <span className="prop-badge mono">{l.isReal ? '实景 3DGS' : '点云就绪'}</span>
        <span className="prop-price">
          <b>{l.price}</b>
          <i>{(l.priceNum / l.area).toFixed(1)}万/㎡</i>
        </span>
      </div>
      <div className="prop-plan mono">
        <span>{l.layout}</span>
        <span>{l.area}㎡</span>
        <span>{l.orientation}</span>
      </div>
      <h3 className="prop-name">{l.title}</h3>
      <p className="prop-highlight">{l.highlight}</p>
      <div className="prop-foot">
        <span className="mono">进入实景 →</span>
        <span className="mono">{l.floor}</span>
      </div>
    </button>
  )
}

export function Splash() {
  const enterList = useAppStore((s) => s.enterList)
  const selectListing = useAppStore((s) => s.selectListing)
  const showToast = useAppStore((s) => s.showToast)

  const featured = LISTINGS.slice(0, 3)

  const onPick = (l: Listing) => {
    selectListing(l)
    const canvas = document.querySelector('canvas')
    void canvas?.requestPointerLock()
    showToast(l.title, 'AI 管家已就位，随时讲解')
  }

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="splash landing">
      <nav className="land-nav">
        <div className="land-logo">
          <span className="land-logo-mark">房</span>
          <span className="land-logo-text">AI 代看房</span>
        </div>
        <div className="land-menu mono">
          <a onClick={() => scrollTo('tour')}>实景预览</a>
          <a onClick={() => scrollTo('listings')}>精选房源</a>
          <a onClick={() => scrollTo('agents')}>顾问团队</a>
          <a onClick={() => scrollTo('contact')}>预约看房</a>
        </div>
        <button className="land-cta" onClick={enterList}>
          开始看房
        </button>
      </nav>

      <section className="land-hero" id="tour">
        <div className="hero-copy">
          <div className="hero-kicker mono">群核 Aholo 实时 3D 渲染 × AI 置业顾问</div>
          <h1>
            足不出户
            <br />
            <em>实景</em>看房
          </h1>
          <p className="hero-sub">
            真实点云第一人称漫游，AI 顾问随行讲解。五套真实户型，价格口径不串房，信任看得见。
          </p>
          <div className="hero-actions">
            <button className="hero-btn primary" onClick={enterList}>
              立即看房
            </button>
            <button className="hero-btn ghost" onClick={() => scrollTo('contact')}>
              预约带看
            </button>
          </div>
          <div className="hero-stats mono">
            <span>5 套真实户型</span>
            <span>3DGS 实时渲染</span>
            <span>24h AI 答疑</span>
          </div>
        </div>

        <div className="glass-preview">
          <div className="preview-glow" />
          <div className="preview-badge mono">● 实时点云 · 第一人称</div>
          <div className="preview-stage">
            <span className="preview-hint">进入实景漫游</span>
            <button className="preview-play" onClick={enterList} aria-label="进入实景漫游">
              ▶
            </button>
          </div>
          <div className="preview-meta mono">
            <span>翡翠云邸 · 三室一厅</span>
            <span>120.1㎡ · 430万</span>
          </div>
        </div>
      </section>

      <section className="land-section" id="listings">
        <div className="section-head">
          <div>
            <div className="section-kicker mono">Featured Listings</div>
            <h2>精选房源</h2>
          </div>
          <button className="section-more mono" onClick={enterList}>
            查看全部 5 套 →
          </button>
        </div>
        <div className="prop-grid">
          {featured.map((l) => (
            <FeaturedCard key={l.id} l={l} onPick={onPick} />
          ))}
        </div>
      </section>

      <section className="land-section" id="agents">
        <div className="section-head">
          <div>
            <div className="section-kicker mono">Agent Team</div>
            <h2>你的 AI 置业顾问团</h2>
          </div>
        </div>
        <div className="agent-grid">
          {AGENTS.map((a) => (
            <div className="glass-card agent-card" key={a.name}>
              <span className="agent-avatar">{a.icon}</span>
              <div className="agent-role mono">{a.role}</div>
              <h3>{a.name}</h3>
              <p>{a.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="land-section" id="contact">
        <div className="section-head">
          <div>
            <div className="section-kicker mono">Book a Tour</div>
            <h2>预约一对一看房</h2>
          </div>
        </div>
        <form
          className="glass-card contact-form"
          onSubmit={(e) => {
            e.preventDefault()
            showToast('预约已提交', 'AI 置业顾问稍后与您联系')
          }}
        >
          <div className="form-row">
            <label>
              <span className="mono">姓名</span>
              <input required placeholder="您的称呼" />
            </label>
            <label>
              <span className="mono">手机号</span>
              <input required placeholder="方便顾问联系您" />
            </label>
          </div>
          <label>
            <span className="mono">意向房源</span>
            <select defaultValue="">
              <option value="" disabled>
                选择一套房源
              </option>
              {LISTINGS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title} · {l.price}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mono">留言</span>
            <textarea rows={3} placeholder="想了解什么？例如：首付比例、周边配套…" />
          </label>
          <button className="form-submit" type="submit">
            提交预约
          </button>
          <p className="form-note mono">提交即表示同意顾问与您联系 · 数据仅用于本次咨询</p>
        </form>
      </section>

      <footer className="land-foot mono">
        <span>AI 代看房 · VentureD</span>
        <span>群核 Aholo 3DGS · MOSS 大模型 · © 2026</span>
      </footer>
    </div>
  )
}
