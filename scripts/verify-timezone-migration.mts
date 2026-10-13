/**
 * 验证 0020 的时区改动是「零行为变化」的。
 *
 * 做法：直接对同一个 (技师, 服务, 日期) 调用 get_available_slots，
 * 比较迁移前后返回的时段集合。由于 0020 只是把字面量换成读 GUC 的
 * 同值回落，两者必须逐条相等 —— 不等就说明我改错了。
 *
 * 这个探针只读，不写任何数据。
 */
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "../tests/load-env";

loadEnv();

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_ANON_KEY!;

setGlobalDispatcher(
  new EnvHttpProxyAgent({
    httpProxy: process.env.E2E_PROXY ?? "http://127.0.0.1:7897",
    httpsProxy: process.env.E2E_PROXY ?? "http://127.0.0.1:7897",
    noProxy: "localhost,127.0.0.1",
  })
);

const sb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const staff = await sb.from("staff").select("id, name").limit(1).single();
  const svc = await sb.from("services").select("id, name").eq("is_active", true).limit(1).single();
  if (staff.error || svc.error) throw new Error(String(staff.error ?? svc.error));

  console.log("技师:", staff.data.name, "| 服务:", svc.data.name);

  // 一个明确的未来日期，避开「今天已过时段」的干扰
  const d = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  console.log("查询日期:", d);

  const res = await sb.rpc("get_available_slots", {
    p_staff_id: staff.data.id,
    p_service_id: svc.data.id,
    p_date: d,
  });
  if (res.error) throw new Error(res.error.message);

  const slots = (res.data ?? []) as { slot_start: string }[];
  console.log(`时段数: ${slots.length}`);
  for (const s of slots) {
    // 以门店时区渲染，肉眼核对是否落在营业时段内
    const local = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(s.slot_start));
    console.log("  ", s.slot_start, "→ 门店时间", local);
  }

  const tz = await sb.rpc("store_timezone");
  console.log("store_timezone() =", tz.error ? `ERROR ${tz.error.message}` : JSON.stringify(tz.data));
}

main().catch((e) => {
  console.error("探针失败:", e.message);
  process.exit(1);
});
