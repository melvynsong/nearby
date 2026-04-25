"use client";
import { useEffect, useState } from "react";
import ChefDashboardData from "@/app/nearby/adminchef/ChefDashboardData";
import UsersAdminList from "@/app/nearby/adminchef/users/UsersAdminList";
import Breadcrumb from "@/components/Breadcrumb";
import AppHeader from "@/components/AppHeader";
import { supabase } from "@/lib/supabase";

export default function ChefPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    async function getUserId() {
      // Try to get from supabase session first
      const { data: sessionData } = await supabase.auth.getSession();
      let id = sessionData?.session?.user?.id || null;
      if (!id && typeof window !== 'undefined') {
        try {
          const reg = localStorage.getItem('nearby_register');
          if (reg) {
            const parsed = JSON.parse(reg);
            id = parsed?.userId || null;
          }
        } catch {}
      }
      setUserId(id);
      setChecked(true);
    }
    getUserId();
  }, []);

  // Always show pills on this page
  const header = <AppHeader forceShowPills />;

  if (!checked) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#f5f6f8]">
        <div className="text-lg text-gray-500">Checking access…</div>
      </main>
    );
  }

  if (userId !== "97100453") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-[#f5f6f8] p-6">
        {header}
        <div className="w-full max-w-2xl mx-auto mt-10">
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Chef Dashboard" }]} />
          <div className="rounded-xl bg-white p-8 shadow border text-center">
            <div className="text-2xl font-bold text-rose-700 mb-2">Access Denied</div>
            <div className="text-gray-600">Sorry, you do not have permission to view the Chef Dashboard.</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#f5f6f8] p-6">
      {header}
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
