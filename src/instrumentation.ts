/**
 * Next.js 服务器启动钩子。
 * 当部署环境需要经出站代理访问 Supabase（如国内自建服务器）时，
 * 设置 OUTBOUND_PROXY 环境变量即可让服务端 fetch 全部走代理；
 * 默认不设置则完全不影响直连部署（如 Vercel）。
 *
 * 排查提示：若本地跑生产构建（next start）后，管理端接口成片返回 503
 * 「暂时无法校验登录状态」，而这在网络代理环境里是**预期**的 ——
 * 服务端进程自己拨不通 Supabase，requireAdmin() 如实上报 503 而不是
 * 谎报 401 把人登出（这正是它该有的行为）。启动时带上代理即可：
 *
 *   set OUTBOUND_PROXY=http://127.0.0.1:7897 && npx next start -p 3002
 *
 * 本钩子启动时会打印一行 [instrumentation] 出站代理已启用 —— 那行日志
 * 就是判断代理有没有真正生效的可靠依据。
 */
export async function register() {
  const proxy = process.env.OUTBOUND_PROXY;
  if (!proxy) {
    console.log(
      "[instrumentation] 未设置 OUTBOUND_PROXY，服务端将直连 Supabase"
    );
    return;
  }
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { setGlobalDispatcher, EnvHttpProxyAgent } = await import("undici");
  setGlobalDispatcher(
    new EnvHttpProxyAgent({
      httpProxy: proxy,
      httpsProxy: proxy,
      // 本机回环流量（如内部健康检查）永不代理
      noProxy: "localhost,127.0.0.1",
    })
  );
  console.log(`[instrumentation] 出站代理已启用: ${proxy}`);
}
