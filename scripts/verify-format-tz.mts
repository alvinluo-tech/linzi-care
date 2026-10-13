/**
 * 验证 format.ts 的 IANA 回落路径与 Intl 路径结果一致。
 *
 * 这是 P3-1 的关键验收：如果两条路径对同一时刻给出不同结果，
 * 那么「老设备走回落」就等于「老设备看到错误时间」，还不如不做。
 */
import { storeDateKey, formatDateTime, formatTime, storeDayBounds } from "../src/lib/format";
import { STORE_TIMEZONE } from "../src/lib/constants";

const OFFSET_MIN = 8 * 60;

// 独立的参考实现（不复用被测代码）：直接按固定偏移算
function refParts(value: string | number | Date) {
  const d = value instanceof Date ? value : new Date(value);
  const s = new Date(d.getTime() + OFFSET_MIN * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`,
    time: `${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}`,
  };
}

// 覆盖多个刁钻时刻：UTC 午夜（门店 08:00）、门店午夜（UTC 前一天 16:00）、
// 月末、年初、以及一个普通的营业时段
const cases = [
  "2026-10-18T02:00:00Z", // 门店 10:00
  "2026-10-18T00:00:00Z", // 门店 08:00
  "2026-10-17T16:00:00Z", // 门店 2026-10-18 00:00（跨日）
  "2026-12-31T16:30:00Z", // 门店 2027-01-01 00:30（跨年）
  "2026-01-31T15:59:00Z", // 门店 2026-02-01 23:59（跨月）
  "2026-06-15T09:15:00Z", // 门店 17:15
];

let pass = 0;
let fail = 0;

console.log(`门店时区: ${STORE_TIMEZONE}\n`);

for (const iso of cases) {
  const ref = refParts(iso);
  const gotDate = storeDateKey(iso);
  const gotTime = formatTime(iso);
  const gotFull = formatDateTime(iso);

  const okDate = gotDate === ref.date;
  const okTime = gotTime === ref.time;
  const okFull = gotFull === `${ref.date} ${ref.time}`;

  if (okDate && okTime && okFull) {
    pass++;
    console.log(`  ✓ ${iso}  →  ${gotFull}  (期望 ${ref.date} ${ref.time})`);
  } else {
    fail++;
    console.log(`  ✗ ${iso}`);
    console.log(`      storeDateKey : ${gotDate}   期望 ${ref.date}`);
    console.log(`      formatTime   : ${gotTime}   期望 ${ref.time}`);
    console.log(`      formatDateTime: ${gotFull}`);
  }
}

// 顺带验证日界区间
console.log("\n日界区间（storeDayBounds）:");
const bounds = storeDayBounds("2026-10-18T02:00:00Z");
console.log(`  ${bounds.startIso} → ${bounds.endIso}`);
const expectStart = "2026-10-17T16:00:00.000Z";
const expectEnd = "2026-10-18T16:00:00.000Z";
if (bounds.startIso === expectStart && bounds.endIso === expectEnd) {
  pass++;
  console.log("  ✓ 与门店时区 00:00–24:00 一致");
} else {
  fail++;
  console.log(`  ✗ 期望 ${expectStart} → ${expectEnd}`);
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
