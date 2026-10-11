/** 分类 → 适合场景（纯 UI 文案层，不涉及数据库） */
export const SCENE_TAGS: Record<string, string> = {
  头疗养生: "失眠多梦 · 用脑过度",
  身体舒缓: "久坐酸痛 · 深度放松",
  美容抗衰: "暗沉松弛 · 焕亮气色",
  草本泡浴: "手脚冰凉 · 祛湿驱寒",
  特色调理: "肩颈僵硬 · 通络活络",
};

export function sceneTagFor(category: string | null): string | null {
  if (!category) return null;
  return SCENE_TAGS[category] ?? null;
}

/** 选时间环节的「氛围预览」：把选时段变成选场景 */
export function slotMoodLabel(iso: string): string {
  const hour = new Date(iso).getHours();
  if (hour < 12) return "晨间时段 · 元气开场，一天从放松开始";
  if (hour < 17) return "午后时段 · 光线安静，适合深度舒缓";
  return "晚间时段 · 睡前放松，助你安然入眠";
}
