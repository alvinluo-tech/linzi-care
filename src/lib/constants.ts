export type Role = "admin" | "staff" | "customer";

export const STORE_NAME = "林梓精养馆";
export const STORE_BRAND = "林梓精养馆";
export const STORE_POSITIONING = "头疗 · 美容 · 养生";
export const STORE_TAGLINE = "身心归处 · 静养有方";
export const STORE_DESCRIPTION =
  "林梓精养馆——增城新塘新中式轻奢养生空间，以千年古方瑶浴头疗为特色，融古法按摩、美容抗衰与内调外养于一体。";
export const STORE_VISION =
  "健康一个人，幸福一个家，和谐一个社会，强大一个民族。";

/** 门店地址。首页页脚、预约日历事件等需要「顾客真正能导航过去」的地方共用一处。 */
export const STORE_ADDRESS =
  "广州市增城区新塘镇国贸汇 · 林梓·头疗美容养生";

/**
 * 门店营业时区（IANA 名称）。
 *
 * 为什么让它可配置：整套时间语义（时段生成、日营收分桶、"今日客次"、周界计算）
 * 都锚定这一个值。硬编码意味着「开到第二个时区就全错」——而 stores 表里已经
 * 预留了 store_id，多店是被明确规划过的路径。
 *
 * 重要：数据库侧 public.get_available_slots() 同样有硬编码的 'Asia/Shanghai'
 * （见迁移 0020 的说明）。改这里的环境变量时，两边必须一起改，否则前端展示的
 * 时段与后端放行的时段会整体偏移 —— 这也是迁移 0020 要把该值提到 GUC 的原因。
 */
export const STORE_TIMEZONE =
  process.env.NEXT_PUBLIC_STORE_TIMEZONE || "Asia/Shanghai";

/**
 * 门店时区相对 UTC 的偏移，用于把「日期+钟点」字面量拼成 UTC 瞬间。
 * 目前仅支持整点偏移的固定时区（本店 +08:00，无夏令时）。
 * 若未来开到有夏令时的地区，combineStoreDateTime 需要改用 Intl 反查偏移。
 */
export const STORE_TZ_OFFSET = "+08:00";

export const SLOT_STEP_MINUTES = 30;
export const BOOKING_DAYS_AHEAD = 14;
export const CALENDAR_START_HOUR = 8;
export const CALENDAR_END_HOUR = 22;
export const CALENDAR_ROW_PX = 64;

export function roleHome(role: Role | null | undefined): string {
  if (role === "admin") return "/admin";
  if (role === "staff") return "/staff";
  return "/my";
}

/** 把「东八区」的日期 + 时间组合成 UTC ISO 串（用于排班等固定时区场景） */
export function combineStoreDateTime(dateStr: string, timeStr: string): string {
  return new Date(`${dateStr}T${timeStr}:00${STORE_TZ_OFFSET}`).toISOString();
}
