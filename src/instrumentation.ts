/**
 * Next.js 服务器启动钩子。
 * 当部署环境需要经出站代理访问 Supabase（如国内自建服务器）时，
 * 设置 OUTBOUND_PROXY 环境变量即可让服务端 fetch 全部走代理；
 * 默认不设置则完全不影响直连部署（如 Vercel）。
 */
export async function register() {
  const proxy = process.env.OUTBOUND_PROXY;
  if (!proxy) return;
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
