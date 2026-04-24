import { requireAdminChef } from "@/lib/adminchef";
import SpotsAdminList from "./SpotsAdminList";
import AdminChefNav from "../AdminChefNav";

export default async function AdminChefSpotsPage({ searchParams }: { searchParams: any }) {
  await requireAdminChef();
  return (
    <div className="min-h-screen p-6">
      <AdminChefNav />
      <SpotsAdminList searchParams={searchParams} />
    </div>
  );
}
