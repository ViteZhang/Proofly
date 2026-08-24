import { LoginForm } from "./LoginForm";

// 邮箱 + 密码 登录 / 注册。已登录访问 /login 由 proxy 重定向到首页。
export default function LoginPage() {
  return <LoginForm />;
}
