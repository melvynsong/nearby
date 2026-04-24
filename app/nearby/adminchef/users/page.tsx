import { requireAdminChef } from "@/lib/adminchef";
import UsersAdminList from "./UsersAdminList";
import AdminChefNav from "../AdminChefNav";

export default async function AdminChefUsersPage({ searchParams }: { searchParams: any }) {
  await requireAdminChef();
  return (
    <div className="min-h-screen p-6">
      <AdminChefNav />
      <UsersAdminList searchParams={searchParams} />
    </div>
  );
}
