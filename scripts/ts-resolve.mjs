// Node 能直接跑 .ts（只做类型剥离），但 ESM 要求写全扩展名，
// 而应用里的 import 都是省略扩展名的。这个钩子补上 .ts。
// 只给 scripts/ 下的脚本用，Next 自己的打包不经过这里。
//
// 顺带把 tsconfig 里的 `@/*` 别名也翻译成 src/ 下的真实路径，
// 否则脚本一引应用模块就炸在别名上。
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

const SRC = pathToFileURL(path.resolve(import.meta.dirname, "..", "src") + "/").href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      specifier = SRC + specifier.slice(2);
    } else if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
      return nextResolve(specifier, context);
    }
    try {
      return nextResolve(specifier, context);
    } catch (e) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        try {
          return nextResolve(specifier + ext, context);
        } catch {
          // 试下一个
        }
      }
      throw e;
    }
  },
});
