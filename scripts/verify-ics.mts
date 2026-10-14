/**
 * 验证 .ics 生成器：格式合规性 + 时间换算正确性。
 * 用法：npx tsx scripts/verify-ics.mts
 */
import { buildAppointmentIcs } from "../src/lib/ics";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// 东八区 10:00 开始 = UTC 02:00
const ics = buildAppointmentIcs({
  serviceName: "姜汤头疗",
  staffName: "林小梓",
  startIso: "2026-10-16T02:00:00.000Z",
  endIso: "2026-10-16T02:45:00.000Z",
  storeName: "林梓精养馆",
  storeAddress: "广州市增城区新塘镇国贸汇",
  bookingRef: "51aa9797-39c2-4a9d-8020-3b7bac5cd2c1",
});

console.log("【生成结果】");
console.log(ics);

console.log("\n【断言】");
check("以 BEGIN:VCALENDAR 开头", ics.startsWith("BEGIN:VCALENDAR"));
check("以 END:VCALENDAR + CRLF 结尾", ics.trimEnd().endsWith("END:VCALENDAR") && ics.endsWith("\r\n"));
check("含 VERSION:2.0", ics.includes("VERSION:2.0"));
check("含 PRODID", ics.includes("PRODID:"));
check("DTSTART 为 UTC 紧凑格式", ics.includes("DTSTART:20261016T020000Z"));
check("DTEND 为 UTC 紧凑格式", ics.includes("DTEND:20261016T024500Z"));
check("UID 含预约单号（防重复导入）", ics.includes("UID:51aa9797-39c2-4a9d-8020-3b7bac5cd2c1@linzi-wellness"));
check("含提前 2 小时提醒", ics.includes("TRIGGER:-PT2H"));
check("LOCATION 含门店地址", ics.includes("LOCATION:"));
check("所有换行均为 CRLF（无裸 LF）", !/(?<!\r)\n/.test(ics));

// 行折叠：每行字节数不超过 75
const lines = ics.split("\r\n");
const tooLong = lines.filter((l) => new TextEncoder().encode(l).length > 75);
check("没有超过 75 字节的行（RFC 5545）", tooLong.length === 0,
  tooLong.length ? `超长行：${tooLong.map((l) => l.slice(0, 40)).join(" | ")}` : undefined);

// 转义：长文本含逗号与中文
const ics2 = buildAppointmentIcs({
  serviceName: "姜汤头疗+头皮排污",
  staffName: "林小梓",
  startIso: "2026-12-31T16:00:00.000Z",
  endIso: "2026-12-31T17:00:00.000Z",
  storeName: "林梓精养馆",
  storeAddress: "广州市增城区新塘镇国贸汇 · 林梓·头疗美容养生",
  bookingRef: "abc-123",
});
check("跨年时间正确（16:00Z = 次日 00:00 东八区）", ics2.includes("DTSTART:20261231T160000Z"));
const descLine = ics2.split("\r\n").find((l) => l.startsWith("DESCRIPTION:"));
check("DESCRIPTION 行内无未转义的裸逗号", !/DESCRIPTION:(?![^\r]*\\,)[^\r]*,/.test(descLine ?? ""),
  descLine);
// 折叠续行以空格开头
const hasContinuation = ics2.split("\r\n").some((l) => l.startsWith(" "));
console.log(`  · 是否触发了行折叠：${hasContinuation}（长文本应有续行）`);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
