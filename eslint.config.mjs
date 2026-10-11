import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 本项目采用「挂载后异步拉取数据」的标准模式：
      // effect 内调用 async load()，setState 都发生在 Promise 回调中，
      // 该规则的静态分析会误报，降级为警告。
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Supabase Edge Functions 为 Deno 代码，不参与 Next.js lint
    "supabase/**",
  ]),
]);

export default eslintConfig;
