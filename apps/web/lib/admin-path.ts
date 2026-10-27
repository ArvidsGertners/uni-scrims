// Without ADMIN_URL the admin area lives under /admin (§5.13): it has its own sidebar, keeps the menu
// button on desktops and never shows the what's new dialog (§5.31). Safe for client components.
export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
