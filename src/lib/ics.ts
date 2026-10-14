/**
 * 预约凭单 → 手机系统日历事件（.ics）
 *
 * 为什么做这一步：预约成功后顾客拿到的是网页上的票券，但人真正不会忘的是
 * 手机日历里那条提醒。站内推送要授权、要装 PWA，门槛都比一个下载文件高，
 * 而 .ics 在 iOS / Android / 微信内置浏览器里都是原生支持的。
 *
 * 时间格式踩坑：.ics 里的 DTSTART 必须带时区或写成 UTC（Z 结尾）。
 * 我们库里存的是 UTC ISO 串，直接去掉分隔符就是合法的 UTC 写法，
 * 日历 App 会自己换算成顾客所在时区显示——绝不要在这里手算东八区偏移，
 * 那会让跨时区看日历的顾客（例如出差在外）看到错误的本地时间。
 */

/** 把 ISO 串转成 .ics 的 UTC 紧凑格式：2026-10-16T02:00:00.000Z → 20261016T020000Z */
function toIcsUtc(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

/**
 * .ics 是「一行一个字段」的纯文本格式，字段内不能出现裸换行。
 * 逗号、分号、反斜杠与换行都必须转义，否则日历 App 会解析失败或截断文本。
 */
function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * 折叠超过 75 字节的行：RFC 5545 的硬性要求，超长行要以 CRLF + 空格续行。
 * 中文字符 UTF-8 下占 3 字节，长项目名很容易越线，所以按字节数切而不是按字符数。
 */
function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const chunks: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const chSize = new TextEncoder().encode(ch).length;
    // 续行以空格开头，本身占 1 字节，所以每段控制在 74 以内
    if (size + chSize > 74) {
      chunks.push(current);
      current = ch;
      size = chSize;
    } else {
      current += ch;
      size += chSize;
    }
  }
  if (current) chunks.push(current);
  return chunks.join("\r\n ");
}

export interface IcsInput {
  serviceName: string;
  staffName: string;
  /** 时段起始时间（UTC ISO 串） */
  startIso: string;
  /** 时段结束时间（UTC ISO 串） */
  endIso: string;
  storeName: string;
  storeAddress?: string;
  /** 预约单号，作为事件 UID 的组成部分，保证同一单重复导入不会产生重复事件 */
  bookingRef: string;
}

export function buildAppointmentIcs(input: IcsInput): string {
  const {
    serviceName,
    staffName,
    startIso,
    endIso,
    storeName,
    storeAddress,
    bookingRef,
  } = input;

  const description = [
    `调理项目：${serviceName}`,
    `执操技师：${staffName}`,
    storeAddress ? `门店地址：${storeAddress}` : null,
    "",
    "建议提前 10 分钟到店，品一杯香茗，静候调养。",
  ]
    .filter((l) => l !== null)
    .join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LINZI WELLNESS//Booking//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${bookingRef}@linzi-wellness`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${toIcsUtc(startIso)}`,
    `DTEND:${toIcsUtc(endIso)}`,
    `SUMMARY:${escapeIcsText(`${serviceName} · ${storeName}`)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    storeAddress ? `LOCATION:${escapeIcsText(storeAddress)}` : null,
    // 提前 2 小时提醒：与站内推送的时间点保持一致
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(`还有 2 小时到店：${serviceName}`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => l !== null);

  // 收尾 CRLF：部分日历 App（尤其 Outlook）对缺少结尾换行的文件解析不稳
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** 触发浏览器下载 .ics 文件 */
export function downloadAppointmentIcs(
  input: IcsInput & { fileName?: string }
): void {
  const blob = new Blob([buildAppointmentIcs(input)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = input.fileName ?? "林梓精养馆-预约.ics";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 立即 revoke 会让部分浏览器来不及取文件，延后一帧更稳
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
