// Admin-only gate. Wraps engine control panel + brain. Non-admins get bounced to /dashboard.
import { createFileRoute, Outlet, redirect, Link } from "@tanstack/react-router";
import { getMyRoles } from "@/lib/deriv-oauth.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const roles = await getMyRoles();
    if (!roles.isAdmin) throw redirect({ to: "/dashboard" });
    return { roles };
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card/40">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2 text-sm">
          <span className="font-semibold text-primary">Admin</span>
          <Link to="/admin" className="text-muted-foreground hover:text-foreground [&.active]:text-foreground">Engine</Link>
          <Link to="/admin/brain" className="text-muted-foreground hover:text-foreground [&.active]:text-foreground">Brain</Link>
          <span className="ml-auto text-xs text-muted-foreground">Sensitive controls · owner/admin only</span>
        </div>
      </div>
      <Outlet />
    </div>
  );
}
