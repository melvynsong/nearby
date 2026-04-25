"use client";
import AppHeader from "@/components/AppHeader";
import AppFooter from "@/components/AppFooter";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader forceShowPills={true} />
      <div className="flex-1">{children}</div>
      <AppFooter />
    </>
  );
}
