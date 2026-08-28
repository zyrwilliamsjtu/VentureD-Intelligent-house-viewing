import type { CameraAction, ChatRequest, ChatResponse, TourScript } from '../../types/api'
import { loadRepoHouse, loadRepoScene, getLoadedHouse } from './data'

export { REPO_HOUSE_ID, loadRepoHouse, loadRepoScene } from './data'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ==== Mock 问答（AI 讲解已下线，仅保留接口形状给 api.ts / 未来 Agent 联调）====
// 话术全部来自仓库 mock scene_graph 的 story_card / selling_points，不再硬编码房源

const NAV_RE = /(带我去|带我去看看|去.{0,4}看看|看看.{0,3}吧|去.{0,3}逛)/

export async function mockSendChat(req: ChatRequest): Promise<ChatResponse> {
  const t0 = performance.now()
  await sleep(250 + Math.random() * 300)

  const house = getLoadedHouse() ?? (await loadRepoHouse())
  const text = req.text?.trim() ?? ''

  if (!text) {
    return {
      asr_text: '',
      reply_text: '您可以说「这套房多大」，或让我带您去任意房间逛逛~',
      actions: [],
      source: 'mock',
      elapsed_ms: Math.round(performance.now() - t0),
    }
  }

  // 房间导航：命中房间名（带或都不带导航动词）
  const zone = house.zones.find((z) => text.includes(z.label))
  if (zone && (NAV_RE.test(text) || text.length <= 6)) {
    const actions: CameraAction[] = [
      { type: 'fly_to_zone', zone_id: zone.id },
      { type: 'highlight', target: zone.id, duration_ms: 6000 },
    ]
    return {
      asr_text: text,
      reply_text: `好的，带您去${zone.label}。${zone.story_card}`,
      actions,
      source: 'mock-zone-nav',
      elapsed_ms: Math.round(performance.now() - t0),
    }
  }

  // 物体聚焦：命中物体短标签
  const obj = house.objects.find((o) => o.tag && text.includes(o.tag))
  if (obj) {
    return {
      asr_text: text,
      reply_text: `${obj.class}${obj.tag ? `（${obj.tag}）` : ''}在${house.zones.find((z) => z.id === obj.zone_id)?.label ?? '屋内'}。`,
      actions: [
        { type: 'focus_object', object_id: obj.id },
        { type: 'highlight', target: obj.id, duration_ms: 4000 },
      ],
      source: 'mock-object',
      elapsed_ms: Math.round(performance.now() - t0),
    }
  }

  // 面积 / 总价等元信息
  if (/面积|多大|多少平/.test(text)) {
    return {
      asr_text: text,
      reply_text: `${house.meta.title}，建面 ${house.meta.area} 平，${house.meta.orientation}，${house.meta.price}。`,
      actions: [{ type: 'overview' }],
      source: 'mock-meta',
      elapsed_ms: Math.round(performance.now() - t0),
    }
  }

  return {
    asr_text: text,
    reply_text: '这个问题我记下来啦。您可以问我房间面积，或让我带您去任意房间看看~',
    actions: [],
    source: 'mock-fallback',
    elapsed_ms: Math.round(performance.now() - t0),
  }
}

// ==== Mock 带看脚本：由仓库 tour_path + timeline 生成（30 秒模拟参数同源）====
// timeline 仅根目录 w_mock_001 有；0330 真实场景降级为单段欢迎语
export async function mockGetTour(): Promise<TourScript> {
  const house = getLoadedHouse() ?? (await loadRepoHouse())
  const { timeline } = await loadRepoScene()

  const segments = (timeline?.segments ?? []).map((seg, i) => {
    const zone = house.zones.find((z) => house.tour_path[i] === z.id) ?? null
    const tpId = seg.tp_id
    void tpId
    return {
      index: i,
      zone_id: zone?.id ?? house.tour_path[i] ?? 'room_living',
      text: i === 0
        ? `欢迎来到${house.meta.title}，${house.meta.area} 平${house.meta.orientation}。接下来带您把全屋走一遍。`
        : (zone?.story_card ?? seg.note),
      actions: zone
        ? ([
            { type: 'fly_to_zone', zone_id: zone.id },
            { type: 'set_tour_index', index: i },
          ] as CameraAction[])
        : [],
      audio: null,
    }
  })

  return { segments }
}
