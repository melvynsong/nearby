"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/auth-helpers-nextjs";

export default function ChefDashboardData({ admin }: { admin: any }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({});
  useEffect(() => {
    const fetchData = async () => {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { count: groupCount } = await supabase.from("groups").select("id", { count: "exact", head: true });
      const { count: membershipCount } = await supabase.from("group_memberships").select("id", { count: "exact", head: true });
      const { count: spotCount } = await supabase.from("places").select("id", { count: "exact", head: true });
      const { data: recentMembers } = await supabase
        .from("users")
        .select("id, full_name, onboarded, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      const { data: recentSpots } = await supabase
        .from("places")
        .select("id, name, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      setData({ groupCount, membershipCount, spotCount, recentMembers, recentSpots });
      setLoading(false);
    };
    fetchData();
  }, []);

  if (loading) {
    return <div className="p-6 text-center text-gray-400">Loading dashboard…</div>;
  }

  const { groupCount, membershipCount, spotCount, recentMembers, recentSpots } = data;

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-xl bg-white p-6 shadow-sm border">
        <div className="text-lg font-semibold mb-2">Total Groups</div>
        <div className="text-3xl font-bold">{groupCount ?? '-'}</div>
      </div>
      <div className="rounded-xl bg-white p-6 shadow-sm border">
        <div className="text-lg font-semibold mb-2">Total Memberships</div>
        <div className="text-3xl font-bold">{membershipCount ?? '-'}</div>
      </div>
      <div className="rounded-xl bg-white p-6 shadow-sm border">
        <div className="text-lg font-semibold mb-2">Total Spots</div>
        <div className="text-3xl font-bold">{spotCount ?? '-'}</div>
      </div>
      <div className="rounded-xl bg-white p-6 shadow-sm border md:col-span-2 lg:col-span-1">
        <div className="text-lg font-semibold mb-2">Recently Joined Members</div>
        <ul className="space-y-1">
          {recentMembers?.map((m: any) => (
            <li key={m.id} className="flex justify-between">
              <span>{m.full_name || '—'}</span>
              <span className="text-xs text-gray-500">•••{m.phone_last4} · {new Date(m.created_at).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-white p-6 shadow-sm border md:col-span-2 lg:col-span-1">
        <div className="text-lg font-semibold mb-2">Recently Added Spots</div>
        <ul className="space-y-1">
          {recentSpots?.map((s: any) => (
            <li key={s.id} className="flex justify-between">
              <span>{s.name || '—'}</span>
              <span className="text-xs text-gray-500">{new Date(s.created_at).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}