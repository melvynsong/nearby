"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/auth-helpers-nextjs";

export default function UsersAdminList({ searchParams }: { searchParams?: { q?: string } }) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  // Only need users now
  useEffect(() => {
    const fetchData = async () => {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const q = searchParams?.q || "";
      let query = supabase
        .from("users")
        .select("id, full_name, onboarded, phone_number")
        .in("phone_number", ["97365221", "97100453", "97815336"])
        .order("created_at", { ascending: false });
      if (q) query = query.ilike("full_name", `%${q}%`);
      const { data: usersData } = await query.limit(50);
      setUsers(usersData || []);
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
            <th className="text-left p-2">Onboarded</th>
          </tr>
        </thead>
        <tbody>
          {users?.map((u: any) => (
            <tr key={u.id} className="border-b">
              <td className="p-2">{u.full_name || '—'}</td>
              <td className="p-2">{u.onboarded ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
