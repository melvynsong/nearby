import { requireAdminChef } from "@/lib/adminchef";
import GroupsAdminList from "./GroupsAdminList";
import AdminChefNav from "../AdminChefNav";

export default async function AdminChefGroupsPage({ searchParams }: { searchParams: any }) {
  await requireAdminChef();
  return (
    <div className="min-h-screen p-6">
      <AdminChefNav />
      <GroupsAdminList searchParams={searchParams} />
    </div>
  );
}
