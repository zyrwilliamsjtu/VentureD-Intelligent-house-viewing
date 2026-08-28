// ==== 房源列表数据（v1 · 2026-08-28）====
// 黑客松演示策略：10 套房源各有独立展示数据（名称/价格/朝向/文案），
// 3D 实景共享 0330 点云（worldId 全部指向 w_0330_840483，
// 保证 CLOUD_RULES / tp 表 / agent 网关全命中，不会因坐标规则缺失黑屏）。
// 真正多套重建资产接入时：给 Listing.worldId 换成新世界 id 并在
// scene/coords.ts CLOUD_RULES 登记即可，列表页零改动。

export type RoomPoly = { name: string; poly: [number, number][] }

export interface Listing {
  id: string
  title: string // 小区名
  layout: string // 户型，如「三室一厅」
  area: number // 建筑面积 ㎡
  orientation: string
  floor: string
  price: string // 展示价（万）
  priceNum: number
  tags: string[]
  highlight: string // 一句话卖点（卡片副标题）
  worldId: string // 渲染/agent 用的 world_id（演示期全 0330）
  isReal: boolean // 是否真实重建实景（其余为同管线示意）
  floorplan: RoomPoly[] // mini 户型图 polygon（scene 帧米制；0330 为真实提取）
}

const W = 'w_0330_840483'

// ---- 0330 真实户型（scene_graph.json 程序提取，勿手改）----
export const FLOOR_0330: RoomPoly[] = [
  { name: '厨房', poly: [[-3.238, -3.723], [-3.238, -0.703], [-4.758, -0.703], [-4.758, -1.303], [-5.158, -1.303], [-5.158, -3.723], [-4.458, -3.723]] },
  { name: '卧室3', poly: [[5.132, -4.823], [5.132, -1.953], [2.292, -1.953], [2.292, -4.823], [2.962, -4.823]] },
  { name: '卫生间', poly: [[-5.408, 1.097], [-3.268, 1.097], [-3.268, 2.517], [-5.408, 2.517], [-5.408, 1.507]] },
  { name: '客厅', poly: [[3.362, 0.647], [1.832, 0.647], [1.832, 6.917], [-3.108, 6.917], [-3.108, 0.647], [-3.188, 0.997], [-5.158, 0.997], [-5.158, -0.603], [-3.138, -0.603], [-3.138, -3.723], [-0.268, -3.723], [-0.268, 0.647]] },
  { name: '餐厅', poly: [[1.832, 6.917], [1.832, 3.137], [3.362, 3.137], [3.362, 6.917]] },
  { name: '主卧', poly: [[5.132, 6.917], [1.832, 6.917], [1.832, 3.137], [5.132, 3.137]] },
  { name: '卧室2', poly: [[5.132, 3.137], [5.132, -0.473], [1.832, -0.473], [1.832, 3.137]] },
  { name: '衣帽间', poly: [[1.832, 3.137], [1.832, 0.647], [3.362, 0.647], [3.362, 3.137]] },
  { name: '生活阳台', poly: [[-5.158, 2.517], [-3.268, 2.517], [-3.268, 6.917], [-5.158, 6.917]] },
  { name: '书房', poly: [[5.132, 0.647], [5.132, -1.953], [2.292, -1.953], [2.292, 0.647]] },
]

// ---- 示意户型模板（矩形组合，程序化观感，非真实测绘）----
const T1: RoomPoly[] = [ // 一室一厅
  { name: '客厅', poly: [[0, 0], [4.2, 0], [4.2, 3.6], [0, 3.6]] },
  { name: '卧室', poly: [[0, 3.6], [4.2, 3.6], [4.2, 7.2], [0, 7.2]] },
  { name: '厨房', poly: [[4.2, 0], [6.6, 0], [6.6, 2.2], [4.2, 2.2]] },
  { name: '卫生间', poly: [[4.2, 2.2], [6.6, 2.2], [6.6, 3.6], [4.2, 3.6]] },
]
const T2: RoomPoly[] = [ // 两室一厅
  { name: '客厅', poly: [[0, 0], [4.6, 0], [4.6, 4.2], [0, 4.2]] },
  { name: '主卧', poly: [[4.6, 0], [8.2, 0], [8.2, 4.2], [4.6, 4.2]] },
  { name: '卧室2', poly: [[0, 4.2], [3.8, 4.2], [3.8, 7.6], [0, 7.6]] },
  { name: '厨房', poly: [[4.6, 4.2], [6.8, 4.2], [6.8, 6.0], [4.6, 6.0]] },
  { name: '卫生间', poly: [[3.8, 4.2], [4.6, 4.2], [4.6, 6.0], [3.8, 6.0]] },
  { name: '阳台', poly: [[4.6, 6.0], [8.2, 6.0], [8.2, 7.6], [4.6, 7.6]] },
]
const T3: RoomPoly[] = [ // 三室两厅
  { name: '客厅', poly: [[0, 0], [5.0, 0], [5.0, 4.0], [0, 4.0]] },
  { name: '餐厅', poly: [[5.0, 0], [8.6, 0], [8.6, 4.0], [5.0, 4.0]] },
  { name: '主卧', poly: [[0, 4.0], [3.6, 4.0], [3.6, 7.8], [0, 7.8]] },
  { name: '卧室2', poly: [[3.6, 4.0], [6.2, 4.0], [6.2, 7.8], [3.6, 7.8]] },
  { name: '卧室3', poly: [[6.2, 4.0], [8.6, 4.0], [8.6, 7.8], [6.2, 7.8]] },
  { name: '厨房', poly: [[8.6, 0], [10.6, 0], [10.6, 2.4], [8.6, 2.4]] },
  { name: '卫生间', poly: [[8.6, 2.4], [10.6, 2.4], [10.6, 4.0], [8.6, 4.0]] },
]
const T4: RoomPoly[] = [ // 四室两厅
  { name: '客厅', poly: [[0, 0], [5.4, 0], [5.4, 4.4], [0, 4.4]] },
  { name: '餐厅', poly: [[5.4, 0], [9.0, 0], [9.0, 4.4], [5.4, 4.4]] },
  { name: '主卧', poly: [[0, 4.4], [3.4, 4.4], [3.4, 8.4], [0, 8.4]] },
  { name: '卧室2', poly: [[3.4, 4.4], [6.0, 4.4], [6.0, 8.4], [3.4, 8.4]] },
  { name: '卧室3', poly: [[6.0, 4.4], [9.0, 4.4], [9.0, 6.4], [6.0, 6.4]] },
  { name: '书房', poly: [[6.0, 6.4], [9.0, 6.4], [9.0, 8.4], [6.0, 8.4]] },
  { name: '厨房', poly: [[9.0, 0], [11.2, 0], [11.2, 2.6], [9.0, 2.6]] },
  { name: '卫生间', poly: [[9.0, 2.6], [11.2, 2.6], [11.2, 4.4], [9.0, 4.4]] },
]

/** 镜像（左右翻转）让同模板派生出不同朝向观感 */
function mirror(rooms: RoomPoly[]): RoomPoly[] {
  const xs = rooms.flatMap((r) => r.poly.map((p) => p[0]))
  const maxX = Math.max(...xs)
  return rooms.map((r) => ({ name: r.name, poly: r.poly.map(([x, y]) => [maxX - x, y] as [number, number]) }))
}

export const LISTINGS: Listing[] = [
  {
    id: 'l_sunshine_0330',
    title: '阳光里 · 两室一厅',
    layout: '三室两厅',
    area: 120.1,
    orientation: '南北通透',
    floor: '中楼层 / 18层',
    price: '868万',
    priceNum: 868,
    tags: ['3DGS 实景重建', 'AI 讲解', '满五唯一'],
    highlight: '群核 3DGS 全屋实景重建，AI 管家全程带看讲解',
    worldId: W,
    isReal: true,
    floorplan: FLOOR_0330,
  },
  {
    id: 'l_villa_01', title: '翡翠湾 · 大平层', layout: '四室两厅', area: 168.5,
    orientation: '南向采光', floor: '高楼层 / 26层', price: '1,680万', priceNum: 1680,
    tags: ['南北通透', '拎包入住', '近地铁'],
    highlight: '客厅 5.4m 开间，全景落地窗，主卧套房设计',
    worldId: W, isReal: false, floorplan: T4,
  },
  {
    id: 'l_cozy_02', title: '梧桐小筑 · 一居室', layout: '一室一厅', area: 52.3,
    orientation: '南向', floor: '低楼层 / 6层', price: '328万', priceNum: 328,
    tags: ['总价低', '精装交付', '近商圈'],
    highlight: '刚需上车盘，动静分区，厨卫全明',
    worldId: W, isReal: false, floorplan: mirror(T1),
  },
  {
    id: 'l_family_03', title: '云顶花园 · 三居室', layout: '三室两厅', area: 128.0,
    orientation: '南北通透', floor: '中楼层 / 32层', price: '1,020万', priceNum: 1020,
    tags: ['电梯房', '学区', '车位充足'],
    highlight: '三代同堂优选，双卫设计，书房可改儿童房',
    worldId: W, isReal: false, floorplan: mirror(T3),
  },
  {
    id: 'l_modern_04', title: '江畔铭邸 · 江景三居', layout: '三室两厅', area: 139.6,
    orientation: '东南 · 江景', floor: '高楼层 / 40层', price: '1,560万', priceNum: 1560,
    tags: ['一线江景', '大平层', '物业管家'],
    highlight: '270° 采光大横厅，主卧观江阳台',
    worldId: W, isReal: false, floorplan: T3,
  },
  {
    id: 'l_young_05', title: '青年荟 · 精装两居', layout: '两室一厅', area: 78.4,
    orientation: '西南', floor: '中楼层 / 15层', price: '516万', priceNum: 516,
    tags: ['近地铁 300m', '精装', '拎包入住'],
    highlight: '通勤友好，双卧朝南，得房率 81%',
    worldId: W, isReal: false, floorplan: mirror(T2),
  },
  {
    id: 'l_classic_06', title: '和风雅苑 · 两居室', layout: '两室一厅', area: 86.9,
    orientation: '南北', floor: '低楼层 / 11层', price: '589万', priceNum: 589,
    tags: ['花园小区', '绿化 40%', '安静'],
    highlight: '小区中心位置，推窗见园，全明户型',
    worldId: W, isReal: false, floorplan: T2,
  },
  {
    id: 'l_pent_07', title: '天际线 · 顶层复式', layout: '四室两厅', area: 196.2,
    orientation: '南北 · 露台', floor: '顶层 / 28层', price: '2,150万', priceNum: 2150,
    tags: ['复式', '私家露台', '视野无遮挡'],
    highlight: '双层挑高 5.8m，60㎡ 空中露台赠面积',
    worldId: W, isReal: false, floorplan: T4,
  },
  {
    id: 'l_start_08', title: '悦城华庭 · 一居室', layout: '一室一厅', area: 46.8,
    orientation: '东向', floor: '高楼层 / 22层', price: '289万', priceNum: 289,
    tags: ['低总价', 'LOFT 风', '近产业园'],
    highlight: '迷你户型极致利用，独立厨卫，月供压力小',
    worldId: W, isReal: false, floorplan: T1,
  },
  {
    id: 'l_garden_09', title: '半山云庐 · 花园洋房', layout: '三室两厅', area: 145.7,
    orientation: '南向 · 山景', floor: '洋房 / 4层', price: '1,380万', priceNum: 1380,
    tags: ['洋房', '私家花园', '人车分流'],
    highlight: '一梯一户，30㎡ 南向私家花园，纯洋房社区',
    worldId: W, isReal: false, floorplan: mirror(T3),
  },
]

export function listingById(id: string): Listing | undefined {
  return LISTINGS.find((l) => l.id === id)
}
