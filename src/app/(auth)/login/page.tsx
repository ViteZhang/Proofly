import { LoginForm } from "./LoginForm";

// 服务端读取 searchParams（Next 16 为 Promise），把过期标记传给客户端表单。
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <LoginForm expired={error === "expired"} />;
}
