// ==== 房源列表数据（v2 · 2026-08-28 队友下发 10 套 InteriorGS 真实场景）====
// 10 套户型/面积/世界 id 全部来自真实数据集（floorplans.gen.ts 程序提取，勿手改）；
// 挂牌信息（小区名/价格/朝向/楼层/文案）为演示营销层数据。
// 3D 漫游现状：仅 0330 完成 Aholo LOD 转码 + 后端 scene_graph（isReal=true），
// 其余 9 套点云就绪（plyReady=true）待 LOD 转码，点击以 0330 实景演示。
// 接入新场景三步：队友提供 LOD_META_URL → Listing.viewerUrl 填入 → scene/coords.ts 登记 CLOUD_RULES。

import { SCENE_FLOORS } from './floorplans.gen'

export type RoomPoly = { name: string; poly: [number, number][]; area?: number }

export interface Listing {
  id: string
  title: string // 小区名（营销层）
  layout: string // 户型（真实提取归纳，如「三室两厅」）
  area: number // 套内面积 ㎡（房间 polygon 真实求和）
  orientation: string
  floor: string
  price: string // 展示价（万）
  priceNum: number
  tags: string[]
  highlight: string // 一句话卖点（卡片副标题）
  worldId: string // 真实 world_id（w_XXXX_YYYYYY；agent/scene 用）
  isReal: boolean // 已完成 LOD 转码 + 后端 scene_graph，可直接漫游
  plyReady: boolean // InteriorGS 点云在手（.ply），待 LOD 转码
  floorplan: RoomPoly[] // mini 户型图（真实提取）
}

/** 漫游世界（PI 决策 2：demo 期点云统一 0330；列表 worldId 为真实数据） */
export const WALK_WORLD = 'w_0330_840483'

// ---- 营销层挂牌信息（key = world_id 后缀）----
// 价格按真实面积 × 单价(万/㎡) 定档，仅演示用
const META: Record<string, { title: string; unit: number; orientation: string; floor: string; tags: string[]; highlight: string }> = {
  '0330_840483': {
    title: '阳光里 · 三室一厅',
    unit: 7.2,
    orientation: '南北通透',
    floor: '中楼层 / 18层',
    tags: ['3DGS 实景重建', 'AI 讲解', '满五唯一'],
    highlight: '群核 3DGS 全屋实景重建，AI 管家全程带看讲解',
  },
  '0257_840812': {
    title: '云顶花园 · 三室一厅',
    unit: 8.2,
    orientation: '南北通透',
    floor: '中楼层 / 32层',
    tags: ['电梯房', '学区', '车位充足'],
    highlight: '三代同堂优选，双卫设计，书房可改儿童房',
  },
  '0259_840804': {
    title: '翡翠湾 · 大平层',
    unit: 10.8,
    orientation: '南向采光',
    floor: '高楼层 / 26层',
    tags: ['南北通透', '拎包入住', '近地铁'],
    highlight: '客厅大开间全景采光，主卧套房设计',
  },
  '0295_840492': {
    title: '江畔铭邸 · 江景大宅',
    unit: 11.6,
    orientation: '东南 · 江景',
    floor: '高楼层 / 40层',
    tags: ['一线江景', '大平层', '物业管家'],
    highlight: '270° 采光大横厅，双客厅格局，主卧观江',
  },
  '0309_840544': {
    title: '青年荟 · 精装两居',
    unit: 6.6,
    orientation: '西南',
    floor: '中楼层 / 15层',
    tags: ['近地铁 300m', '精装', '拎包入住'],
    highlight: '通勤友好，紧凑两居，得房率高',
  },
  '0441_840314': {
    title: '和风雅苑 · 两室一厅',
    unit: 6.8,
    orientation: '南北',
    floor: '低楼层 / 11层',
    tags: ['花园小区', '绿化 40%', '安静'],
    highlight: '小区中心位置，推窗见园，全明户型',
  },
  '0469_840829': {
    title: '半山云庐 · 花园洋房',
    unit: 9.5,
    orientation: '南向 · 山景',
    floor: '洋房 / 6层',
    tags: ['洋房', '私家花园', '人车分流'],
    highlight: '纯洋房社区，双书房格局，一梯一户',
  },
  '0755_840824': {
    title: '梧桐小筑 · 阔景一居',
    unit: 7.8,
    orientation: '南向',
    floor: '低楼层 / 6层',
    tags: ['总价低', '精装交付', '近商圈'],
    highlight: '多厅阔景格局，动静分区，厨卫全明',
  },
  '0789_841261': {
    title: '悦城华庭 · 一居室',
    unit: 5.9,
    orientation: '东向',
    floor: '高楼层 / 22层',
    tags: ['低总价', 'LOFT 风', '近产业园'],
    highlight: '迷你户型极致利用，独立厨卫，月供压力小',
  },
  '0836_841149': {
    title: '天际线 · 紧凑三居',
    unit: 7.5,
    orientation: '南向',
    floor: '高楼层 / 30层',
    tags: ['功能三居', '满二', '近学区'],
    highlight: '小面积三房教科书，零走道浪费',
  },
}

// ---- 真实数据 × 营销层合成（0330 置顶：唯一可直接漫游）----
export const LISTINGS: Listing[] = Object.values(SCENE_FLOORS)
  .map((f) => {
    const key = f.worldId.replace('w_', '')
    const m = META[key]
    const priceNum = Math.round((f.area * m.unit) / 2) * 2 // 取偶数万，观感稳定
    return {
      id: `l_${key}`,
      title: m.title,
      layout: f.layout,
      area: f.area,
      orientation: m.orientation,
      floor: m.floor,
      price: priceNum >= 1000 ? `${(priceNum / 1000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}万` : `${priceNum}万`,
      priceNum,
      tags: m.tags,
      highlight: m.highlight,
      worldId: f.worldId,
      isReal: f.worldId === WALK_WORLD,
      plyReady: true,
      floorplan: f.floorplan,
    }
  })
  .sort((a, b) => Number(b.isReal) - Number(a.isReal) || a.priceNum - b.priceNum)

export function listingById(id: string): Listing | undefined {
  return LISTINGS.find((l) => l.id === id)
}
