import { requireAdminChef } from "@/lib/adminchef";
import ChefDashboardData from './ChefDashboardData';
import AdminChefNav from "./AdminChefNav";

export default async function AdminChefDashboardPage() {
  const admin = await requireAdminChef();
  return (
    <div className="min-h-screen p-6">
      <AdminChefNav />
      <h1 className="text-2xl font-bold mb-4">Nearby AdminChef Console</h1>
      <ChefDashboardData admin={admin} />
    </div>
  );
}
