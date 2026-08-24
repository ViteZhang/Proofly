// (app) group layout — app shell (Sidebar + Topbar) is built in slice 0.6.
// For now it simply renders the page.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
