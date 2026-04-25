"use client";
import { useEffect, useState } from "react";
import ChefDashboardData from "@/app/nearby/adminchef/ChefDashboardData";
import UsersAdminList from "@/app/nearby/adminchef/users/UsersAdminList";
import Breadcrumb from "@/components/Breadcrumb";
import { supabase } from "@/lib/supabase";

export default function AdminChefPage() {
  const [checking, setChecking] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkAccess() {
      try {
        let userId = null;
        // Try to get from localStorage first
        if (typeof window !== 'undefined') {
          const reg = localStorage.getItem('nearby_register');
          if (reg) {
            const parsed = JSON.parse(reg);
            userId = parsed?.userId || null;
          }
        }
        // If not found, try Supabase session
        if (!userId) {
          const { data: sessionData } = await supabase.auth.getSession();
          userId = sessionData?.session?.user?.id || null;
        }
        if (!userId) {
          setHasAccess(false);
          setChecking(false);
          return;
        }
        // Check nearby_admins for chef role
        const { data: adminRow, error: adminErr } = await supabase
          .from('nearby_admins')
          .select('admin_role, is_active')
          .eq('user_id', userId)
          .eq('admin_role', 'chef')
          .eq('is_active', true)
          .maybeSingle();
        setHasAccess(!!adminRow);
      } catch (e) {
        setError('Could not check admin access.');
      } finally {
        setChecking(false);
      }
    }
    checkAccess();
  }, []);

  if (checking) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#f5f6f8]">
        <div className="text-lg text-gray-500">Checking admin access…</div>
      </main>
    );
  }

  if (!hasAccess) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-[#f5f6f8] p-6">
        <div className="w-full max-w-2xl mx-auto mt-10">
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Chef Dashboard" }]} />
          <div className="rounded-xl bg-white p-8 shadow border text-center">
            <div className="text-2xl font-bold text-rose-700 mb-2">Access Denied</div>
            <div className="text-gray-600">Sorry, you do not have permission to view the Chef Dashboard.</div>
            {error && <div className="text-xs text-gray-400 mt-2">{error}</div>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#f5f6f8] p-6">
      <div className="w-full max-w-5xl mx-auto mt-10">
        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Chef Dashboard" }]} />
        <h1 className="text-3xl font-bold text-neutral-800 mb-6">Chef Dashboard</h1>
        <ChefDashboardData admin={true} />
        <div className="mt-10">
          <h2 className="text-2xl font-semibold mb-4">All Users</h2>
          <UsersAdminList />
        </div>
      </div>
    </main>
  );
}
