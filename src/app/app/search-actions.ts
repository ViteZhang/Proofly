"use server";

import { loadSearchIndex, type SearchItem } from "@/lib/queries/search";

/**
 * 搜索索引。
 *
 * 做成动作而不是页面数据：它挂在顶栏上，做成 layout 的数据就意味着每翻
 * 一页都要把整份索引查一遍、传一遍，而绝大多数翻页里没人会去搜。
 */
export async function fetchSearchIndex(): Promise<SearchItem[]> {
  return loadSearchIndex();
}
