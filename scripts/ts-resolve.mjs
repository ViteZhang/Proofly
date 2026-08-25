// Node 能直接跑 .ts（只做类型剥离），但 ESM 要求写全扩展名，
// 而应用里的 import 都是省略扩展名的。这个钩子补上 .ts。
// 只给 scripts/ 下的脚本用，Next 自己的打包不经过这里。
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
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
