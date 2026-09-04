/**
 * 把数据库抛出来的错误码翻成人话。
 *
 * 单独放在这里而不是和 server action 放一起：那个文件是 "use server"，
 * 里面只能导出 async 函数。
 */
export function adminError(msg: string): string {
  if (msg.includes("NOT_ADMIN")) return "你不是管理员";
  if (msg.includes("BAD_COUNT")) return "张数要在 1 到 200 之间";
  if (msg.includes("BAD_REASON")) return "理由必填";
  if (msg.includes("BAD_NAME")) return "名称不能为空";
  if (msg.includes("BAD_CREDITS")) return "面额要大于 0";
  if (msg.includes("NOT_FOUND")) return "找不到这个批次或码";
  if (msg.includes("ALREADY_REVOKED")) return "这一批已经作废过了";
  if (msg.includes("NAME_MISMATCH")) return "批次名对不上";
  return "没成功，再试一次";
}
