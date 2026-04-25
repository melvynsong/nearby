"use client";

import { useEffect, useState } from "react";
import ChefDashboardData from "@/app/nearby/adminchef/ChefDashboardData";
import UsersAdminList from "@/app/nearby/adminchef/users/UsersAdminList";
import Breadcrumb from "@/components/Breadcrumb";
import { supabase } from "@/lib/supabase";


export default function ChefPage() {
  const [checking, setChecking] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkAccess() {
      try {
        let phone = null;
        // Try to get from localStorage first
        if (typeof window !== 'undefined') {
          const reg = localStorage.getItem('nearby_register');
          if (reg) {
            const parsed = JSON.parse(reg);
            phone = parsed?.userId || parsed?.phone4 || parsed?.phone || null;
          }
        }
        // If not found, try Supabase session
        if (!phone) {
          const { data: sessionData } = await supabase.auth.getSession();
          const user = sessionData?.session?.user;
          if (user) {
            // Try to fetch profile by user.id
            const { data: profile } = await supabase
              .from('profiles')
              .select('phone_number, phone_last4')
              .eq('id', user.id)
              .maybeSingle();
            phone = profile?.phone_number || profile?.phone_last4 || null;
          }
        }
        // Accept if phone number or last4 matches
        if (phone === '97100453' || phone === '+6597100453' || phone === '0453' || phone === '9710' || phone?.endsWith('0453')) {
          setHasAccess(true);
        } else {
          setHasAccess(false);
        }
      } catch (e) {
        setError('Could not check access.');
      } finally {
        setChecking(false);
      }
    }
    checkAccess();
  }, []);


  if (checking) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#f5f6f8]">
        <div className="text-lg text-gray-500">Checking access…</div>
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
