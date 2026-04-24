"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/auth-helpers-nextjs";

export default function UsersAdminList({ searchParams }: { searchParams?: { q?: string } }) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [groupCounts, setGroupCounts] = useState<any>({});
  const [spotCounts, setSpotCounts] = useState<any>({});
  useEffect(() => {
    const fetchData = async () => {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const q = searchParams?.q || "";
      let query = supabase
        .from("profiles")
        .select("id, full_name, phone_last4, created_at")
        .order("created_at", { ascending: false });
      if (q) query = query.ilike("full_name", `%${q}%`);
      const { data: usersData } = await query.limit(50);
      const userIds = usersData?.map((u: any) => u.id) || [];
      const { data: memberships } = await supabase
        .from("group_memberships")
        .select("user_id")
        .in("user_id", userIds);
      const { data: spots } = await supabase
        .from("places")
        .select("added_by")
        .in("added_by", userIds);
      const groupCountsObj = memberships?.reduce((acc: any, m: any) => {
        acc[m.user_id] = (acc[m.user_id] || 0) + 1;
        return acc;
      }, {}) || {};
      const spotCountsObj = spots?.reduce((acc: any, s: any) => {
        acc[s.added_by] = (acc[s.added_by] || 0) + 1;
        return acc;
      }, {}) || {};
      setUsers(usersData || []);
      setGroupCounts(groupCountsObj);
      setSpotCounts(spotCountsObj);
      setLoading(false);
    };
    fetchData();
  }, [searchParams?.q]);

  if (loading) {
    return <div className="p-6 text-center text-gray-400">Loading users…</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            <th className="text-left p-2">Full Name</th>
            <th className="text-left p-2">Phone Last 4</th>
            <th className="text-left p-2">Groups Joined</th>
            <th className="text-left p-2">Spots Added</th>
            <th className="text-left p-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {users?.map((u: any) => (
            <tr key={u.id} className="border-b">
              <td className="p-2">{u.full_name || '—'}</td>
              <td className="p-2">•••{u.phone_last4}</td>
              <td className="p-2">{groupCounts[u.id] ?? 0}</td>
              <td className="p-2">{spotCounts[u.id] ?? 0}</td>
              <td className="p-2">{new Date(u.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
