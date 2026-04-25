"use client";
import ChefDashboardData from "@/app/nearby/adminchef/ChefDashboardData";
import UsersAdminList from "@/app/nearby/adminchef/users/UsersAdminList";

export default function ChefPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#f5f6f8] p-6">
      <div className="w-full max-w-5xl mx-auto">
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
