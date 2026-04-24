"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/auth-helpers-nextjs";

export default function SpotsAdminList({ searchParams }: { searchParams?: { q?: string } }) {
  const [loading, setLoading] = useState(true);
  const [spots, setSpots] = useState<any[]>([]);
  useEffect(() => {
    const fetchData = async () => {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const q = searchParams?.q || "";
      let query = supabase
        .from("places")
        .select("id, name, category, added_by, group_id, google_rating, created_at")
        .order("created_at", { ascending: false });
      if (q) query = query.ilike("name", `%${q}%`);
      const { data: spotsData } = await query.limit(50);
      setSpots(spotsData || []);
      setLoading(false);
    };
    fetchData();
  }, [searchParams?.q]);

  if (loading) {
    return <div className="p-6 text-center text-gray-400">Loading spots…</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            <th className="text-left p-2">Spot Name</th>
            <th className="text-left p-2">Category</th>
            <th className="text-left p-2">Added By</th>
            <th className="text-left p-2">Group</th>
            <th className="text-left p-2">Google Rating</th>
            <th className="text-left p-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {spots?.map((s: any) => (
            <tr key={s.id} className="border-b">
              <td className="p-2">{s.name || '—'}</td>
              <td className="p-2">{s.category || '—'}</td>
              <td className="p-2">{s.added_by || '—'}</td>
              <td className="p-2">{s.group_id || '—'}</td>
              <td className="p-2">{s.google_rating ?? '—'}</td>
              <td className="p-2">{new Date(s.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
