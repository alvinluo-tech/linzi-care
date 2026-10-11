export type Role = "admin" | "staff" | "customer";

export const STORE_NAME = "林梓精养馆";
export const STORE_BRAND = "梓养云";
export const STORE_POSITIONING = "头疗 · 美容 · 养生";
export const STORE_TAGLINE = "身心归处 · 静养有方";
export const STORE_DESCRIPTION =
  "林梓精养馆——增城新塘新中式轻奢养生空间，以千年古方瑶浴头疗为特色，融古法按摩、美容抗衰与内调外养于一体。";
export const STORE_VISION =
  "健康一个人，幸福一个家，和谐一个社会，强大一个民族。";
export const STORE_TIMEZONE = "Asia/Shanghai";
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
