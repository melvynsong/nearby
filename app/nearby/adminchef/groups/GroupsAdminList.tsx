"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/auth-helpers-nextjs";

export default function GroupsAdminList({ searchParams }: { searchParams?: { q?: string } }) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<any[]>([]);
  const [memberCounts, setMemberCounts] = useState<any>({});
  const [spotCounts, setSpotCounts] = useState<any>({});
  useEffect(() => {
    const fetchData = async () => {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const q = searchParams?.q || "";
      let query = supabase
        .from("groups")
        .select("id, name, owner_id, created_at")
        .order("created_at", { ascending: false });
      if (q) query = query.ilike("name", `%${q}%`);
      const { data: groupsData } = await query.limit(50);
      const groupIds = groupsData?.map((g: any) => g.id) || [];
      const { data: memberships } = await supabase
        .from("group_memberships")
        .select("group_id")
        .in("group_id", groupIds);
      const { data: spots } = await supabase
        .from("places")
        .select("group_id")
        .in("group_id", groupIds);
      const memberCountsObj = memberships?.reduce((acc: any, m: any) => {
        acc[m.group_id] = (acc[m.group_id] || 0) + 1;
        return acc;
      }, {}) || {};
      const spotCountsObj = spots?.reduce((acc: any, s: any) => {
        acc[s.group_id] = (acc[s.group_id] || 0) + 1;
        return acc;
      }, {}) || {};
      setGroups(groupsData || []);
      setMemberCounts(memberCountsObj);
      setSpotCounts(spotCountsObj);
      setLoading(false);
    };
    fetchData();
  }, [searchParams?.q]);

  if (loading) {
    return <div className="p-6 text-center text-gray-400">Loading groups…</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            <th className="text-left p-2">Group Name</th>
            <th className="text-left p-2">Owner</th>
            <th className="text-left p-2">Members</th>
            <th className="text-left p-2">Spots</th>
            <th className="text-left p-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {groups?.map((g: any) => (
            <tr key={g.id} className="border-b">
              <td className="p-2">{g.name}</td>
              <td className="p-2">{g.owner_id || '—'}</td>
              <td className="p-2">{memberCounts[g.id] ?? 0}</td>
              <td className="p-2">{spotCounts[g.id] ?? 0}</td>
              <td className="p-2">{new Date(g.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
