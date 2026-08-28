// ==== 房源实景素材映射（用户提供的效果图 / 平面图）====
// 图片放在 frontend/public/assets，运行时以 /assets/xxx.jpg 访问。
// 命名按 sceneId（= worldId 去掉 w_ 前缀）：0330=翡翠云邸 · 0309=玉兰公馆 · 0836=云栖雅苑。
// 尚未提供的房源返回 undefined，前端回退到 Unsplash 占位图 / 点云生成的 SVG 户型图。

/** 效果图（首页精选卡 + 列表卡封面） */
export const HOUSE_EFFECT: Record<string, string> = {
  listing_0330_840483: '/assets/0330-effect.jpg',
  listing_0309_840544: '/assets/0309-effect.jpg',
  listing_0836_841149: '/assets/0836-effect.jpg',
}

/** 平面图（列表卡户型图，替代点云 SVG 示意） */
export const HOUSE_FLOOR: Record<string, string> = {
  listing_0330_840483: '/assets/0330-floor.jpg',
  listing_0309_840544: '/assets/0309-floor.jpg',
  listing_0836_841149: '/assets/0836-floor.jpg',
}
