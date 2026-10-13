/**
 * 强制走 IANA 回落路径，验证它与 Intl 路径给出相同结果。
 *
 * 手法：在加载被测模块**之前**把 Intl.DateTimeFormat 换成一个「忽略 timeZone 选项」
 * 的伪装版本 —— 这正是老 WebView / 裁剪版 ICU 的实际行为（不报错，静默用本地时区）。
 * 此时 format.ts 的探测应当识别出异常并切到固定偏移实现，结果必须与主路径一致。
 *
 * 若本测试通过而 verify-format-tz.mts 也通过，说明两条路径等价，兜底可信。
 */
const origDTF = Intl.DateTimeFormat;
// 故意替换全局构造器以模拟降级运行时（老 WebView 忽略 IANA 时区名）
Intl.DateTimeFormat = function masked(locale?: string, opts?: Intl.DateTimeFormatOptions) {
  if (opts && "timeZone" in opts) {
    // 静默丢弃时区（不抛错）—— 这就是老运行时的危险行为本身
    const rest: Intl.DateTimeFormatOptions = { ...opts };
    delete rest.timeZone;
    return new (origDTF as unknown as new (l?: string, o?: object) => Intl.DateTimeFormat)(
      locale,
      rest
    );
  }
  return new (origDTF as unknown as new (l?: string, o?: object) => Intl.DateTimeFormat)(
    locale,
    opts
  );
} as unknown as typeof Intl.DateTimeFormat;

// 探针：确认伪装已生效（若时区仍被尊重，说明替换失败，本测试无意义）
const probeRaw = new origDTF("en-GB", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  hourCycle: "h23",
}).format(new Date(0));
const probeMasked = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  hourCycle: "h23",
}).format(new Date(0));
console.log(`伪装生效检查: 原始=${probeRaw} 伪装后=${probeMasked}`);
if (probeRaw === probeMasked) {
  console.error("✗ 伪装未生效，本测试无法证明回落路径");
  process.exit(1);
}

// 伪装生效后再加载被测模块（模块顶层的探测会看到被伪装后的 Intl）
const { storeDateKey, formatTime, formatDateTime } = await import("../src/lib/format");

const OFFSET_MIN = 8 * 60;
function refParts(value: string) {
  const d = new Date(value);
  const s = new Date(d.getTime() + OFFSET_MIN * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`,
    time: `${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}`,
  };
}

const cases = [
  "2026-10-18T02:00:00Z",
  "2026-10-18T00:00:00Z",
  "2026-10-17T16:00:00Z",
  "2026-12-31T16:30:00Z",
  "2026-01-31T15:59:00Z",
  "2026-06-15T09:15:00Z",
];

let pass = 0;
let fail = 0;
console.log("\n回落路径结果:");
for (const iso of cases) {
  const ref = refParts(iso);
  const got = `${storeDateKey(iso)} ${formatTime(iso)}`;
  const expect = `${ref.date} ${ref.time}`;
  if (got === expect && formatDateTime(iso) === expect) {
    pass++;
    console.log(`  ✓ ${iso}  →  ${got}`);
  } else {
    fail++;
    console.log(`  ✗ ${iso}  得到 ${got} / formatDateTime=${formatDateTime(iso)}  期望 ${expect}`);
  }
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
