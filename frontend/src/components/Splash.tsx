import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { LISTINGS } from '../data/listings'
import type { Listing } from '../data/listings'

// ==== 高端房产落地页（对齐 LuxeEstate Demo：浅色奢华 · 玻璃拟态搜索卡 · 精选房源 · 顾问团队 · 预约表单）====
// 视觉：Cinzel/Noto Serif SC 衬线标题 + DM Sans 正文；白玻璃吸顶导航；蓝 #0077b6 主按钮 + 金 #ffd700 点缀；
// 整屏实景 Hero → 数据条 → 精选房源卡 → 核心优势 → AI 顾问团 → 预约表单 → 深色页脚。
// 数据：全部来自 LISTINGS（与后端同口径），点卡片直接进入 3D 实景漫游。

const HERO_BG =
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1920&h=1080&fit=crop'

/** 精选卡封面（与 Demo 同源的稳定 Unsplash 图；离线时由 CSS 渐变兜底） */
const CARD_IMG: Record<string, string> = {
  listing_0330_840483:
    'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&h=600&fit=crop',
  listing_0469_840829:
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&h=600&fit=crop',
  listing_0259_840804:
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&h=600&fit=crop',
}

const WHY = [
  {
    icon: '🏠',
    title: '实景漫游',
    desc: '群核 Aholo 3DGS 点云实时渲染，第一人称在房子里自由走动，像真到现场。',
  },
  {
    icon: '🎙️',
    title: 'AI 讲解',
    desc: '进房自动介绍每个空间，客厅、主卧、厨房，像专业销售陪你逐间讲解。',
  },
  {
    icon: '💬',
    title: '语音问答',
    desc: '按住按钮说话，想问什么问什么；不方便说话也可以直接打字。',
  },
  {
    icon: '📊',
    title: '真实数据',
    desc: '五套真实挂牌同口径接入，价格、户型、朝向不串房，问答有据可依。',
  },
]

const AGENTS = [
  {
    name: '小房 · 讲解官',
    role: 'AI 置业讲解',
    desc: '进房自动讲解，把每个空间的亮点讲给你听。',
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

const FOOT_COLS: Array<{ title: string; links: string[] }> = [
  { title: '房源', links: ['在售房源', '实景漫游', '精选推荐', '预约看房'] },
  { title: '服务', links: ['AI 讲解', '一键带看', '语音问答', '贷款咨询'] },
  { title: '关于', links: ['项目介绍', '技术方案', '联系我们', '隐私政策'] },
]

function FeaturedCard({ l, onPick }: { l: Listing; onPick: (l: Listing) => void }) {
  const img = CARD_IMG[l.id]
  return (
    <button className="prop-card" onClick={() => onPick(l)}>
      <div className="prop-media">
        {img && <img src={img} alt={l.title} loading="lazy" />}
        <span className={`prop-badge${l.isReal ? '' : ' ghost'}`}>
          {l.isReal ? '实景 3DGS' : '点云就绪'}
        </span>
      </div>
      <div className="prop-body">
        <span className="prop-loc mono">上海 · {l.community}</span>
        <h3 className="prop-name">{l.title}</h3>
        <p className="prop-highlight">{l.highlight}</p>
        <div className="prop-meta">
          <span>{l.layout}</span>
          <span>{l.area}㎡</span>
          <span>{l.orientation}</span>
          <span>{l.floor}</span>
        </div>
        <div className="prop-foot">
          <span className="prop-price">
            <b>{l.price}</b>
            <i>{(l.priceNum / l.area).toFixed(1)}万/㎡</i>
          </span>
          <span className="prop-go">进入实景 →</span>
        </div>
      </div>
    </button>
  )
}

export function Splash() {
  const enterList = useAppStore((s) => s.enterList)
  const selectListing = useAppStore((s) => s.selectListing)
  const showToast = useAppStore((s) => s.showToast)
  const setFilters = useAppStore((s) => s.setFilters)

  const [layout, setLayout] = useState('all')
  const [price, setPrice] = useState('all')

  const featured = LISTINGS.slice(0, 3)

  const onPick = (l: Listing) => {
    selectListing(l)
    const canvas = document.querySelector('canvas')
    void canvas?.requestPointerLock()
    showToast(l.title, 'AI 管家已就位，随时讲解')
  }

  const onSearch = () => {
    setFilters({ layout, price })
    enterList()
  }

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="splash landing">
      <nav className="land-nav">
        <div className="land-logo">
          <span className="land-logo-mark">房</span>
          <span className="land-logo-text">
            AI 代看房<i>VentureD</i>
          </span>
        </div>
        <div className="land-menu">
          <a onClick={() => scrollTo('tour')}>实景预览</a>
          <a onClick={() => scrollTo('listings')}>精选房源</a>
          <a onClick={() => scrollTo('why')}>核心优势</a>
          <a onClick={() => scrollTo('agents')}>顾问团队</a>
          <a onClick={() => scrollTo('contact')}>预约看房</a>
        </div>
        <button className="land-cta" onClick={enterList}>
          开始看房
        </button>
      </nav>

      <section className="land-hero" id="tour">
        <div className="hero-bg" style={{ backgroundImage: `url(${HERO_BG})` }} />
        <div className="hero-shade" />
        <div className="hero-inner">
          <div className="hero-badge">
            <span className="hero-dot" />
            AI 实景看房 · 群核 Aholo 3DGS 实时渲染
          </div>
          <h1>
            足不出户
            <br />
            <span className="gold-accent">实景看房</span>
          </h1>
          <p className="hero-sub">
            真实点云第一人称漫游，AI 置业顾问随行讲解。五套真实户型，价格口径不串房，信任看得见。
          </p>

          <form
            className="glass-card search-card"
            onSubmit={(e) => {
              e.preventDefault()
              onSearch()
            }}
          >
            <div className="search-fields">
              <div className="search-field">
                <label>位置</label>
                <select defaultValue="上海">
                  <option value="上海">上海</option>
                </select>
              </div>
              <div className="search-field">
                <label>户型</label>
                <select value={layout} onChange={(e) => setLayout(e.target.value)}>
                  <option value="all">全部户型</option>
                  <option value="三室一厅">三室一厅</option>
                  <option value="四室一厅">四室一厅</option>
                </select>
              </div>
              <div className="search-field">
                <label>价格</label>
                <select value={price} onChange={(e) => setPrice(e.target.value)}>
                  <option value="all">全部价格</option>
                  <option value="lt300">300万以下</option>
                  <option value="300-450">300-450万</option>
                  <option value="gt450">450万以上</option>
                </select>
              </div>
              <button className="btn-primary search-submit" type="submit">
                搜索房源
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="land-stats">
        <div className="stat-item">
          <div className="stat-num">
            {LISTINGS.length} 套<i>真实户型</i>
          </div>
          <div className="stat-label">Real Listings</div>
        </div>
        <div className="stat-item">
          <div className="stat-num">
            3DGS<i>实时渲染</i>
          </div>
          <div className="stat-label">Aholo Rendering</div>
        </div>
        <div className="stat-item">
          <div className="stat-num">
            24h<i>AI 答疑</i>
          </div>
          <div className="stat-label">AI Consultant</div>
        </div>
        <div className="stat-item">
          <div className="stat-num">
            1:1<i>实景还原</i>
          </div>
          <div className="stat-label">Cloud Reproduction</div>
        </div>
      </section>

      <section className="land-section" id="listings">
        <div className="section-head">
          <div>
            <div className="section-kicker mono">Featured Listings</div>
            <h2>精选房源</h2>
          </div>
          <button className="section-more" onClick={enterList}>
            查看全部 {LISTINGS.length} 套 →
          </button>
        </div>
        <div className="prop-grid">
          {featured.map((l) => (
            <FeaturedCard key={l.id} l={l} onPick={onPick} />
          ))}
        </div>
      </section>

      <section className="land-section alt" id="why">
        <div className="section-head">
          <div>
            <div className="section-kicker mono">Why Choose Us</div>
            <h2>为什么选择 AI 代看房</h2>
          </div>
        </div>
        <div className="why-grid">
          {WHY.map((w) => (
            <div className="why-card" key={w.title}>
              <div className="why-icon">{w.icon}</div>
              <h3>{w.title}</h3>
              <p>{w.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="land-section" id="agents">
        <div className="section-head">
          <div>
            <div className="section-kicker mono">Our Team</div>
            <h2>你的 AI 置业顾问团</h2>
          </div>
        </div>
        <div className="agent-grid">
          {AGENTS.map((a) => (
            <div className="agent-card" key={a.name}>
              <span className="agent-avatar">{a.icon}</span>
              <div className="agent-role mono">{a.role}</div>
              <h3>{a.name}</h3>
              <p>{a.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="land-section alt" id="contact">
        <div className="contact-wrap">
          <div className="contact-info">
            <div className="section-kicker mono">Get in Touch</div>
            <h3>
              预约一对一
              <br />
              线上实景看房
            </h3>
            <p>
              留下您的联系方式，AI 置业顾问会为您安排专属带看。支持语音与文字提问，全程 24
              小时在线。
            </p>
            <div className="contact-line">
              <span className="contact-ico">🎙️</span>
              <div>
                <b>AI 管家在线</b>
                <span>进房即讲解 · 按住按钮提问</span>
              </div>
            </div>
            <div className="contact-line">
              <span className="contact-ico">📍</span>
              <div>
                <b>上海 · 五套真实房源</b>
                <span>翡翠云邸 / 星河湾 / 翠湖天地 / 玉兰公馆 / 云栖雅苑</span>
              </div>
            </div>
            <div className="contact-line">
              <span className="contact-ico">⚡</span>
              <div>
                <b>48h 黑客松 Demo</b>
                <span>群核 Aholo 3DGS × MOSS 大模型 × 多层语义识别</span>
              </div>
            </div>
          </div>

          <form
            className="contact-form"
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
            <button className="btn-primary form-submit" type="submit">
              提交预约
            </button>
            <p className="form-note mono">提交即表示同意顾问与您联系 · 数据仅用于本次咨询</p>
          </form>
        </div>
      </section>

      <footer className="land-foot">
        <div className="foot-grid">
          <div className="foot-brand">
            <h3>AI 代看房 · VentureD</h3>
            <p>真实点云实景漫游 + AI 置业顾问，让看房这件事，打开网页就能完成。</p>
          </div>
          {FOOT_COLS.map((col) => (
            <div className="foot-col" key={col.title}>
              <h4>{col.title}</h4>
              {col.links.map((link) => (
                <a key={link} onClick={() => scrollTo('tour')}>
                  {link}
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className="foot-bottom">
          <span>© 2026 AI 代看房 · VentureD. All rights reserved.</span>
          <span>群核 Aholo 3DGS · MOSS 大模型 · 隐私政策 · 服务条款</span>
        </div>
      </footer>
    </div>
  )
}
