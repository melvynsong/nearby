"use client";
import AppHeader from "@/components/AppHeader";
import AppFooter from "@/components/AppFooter";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <div className="flex-1">{children}</div>
      <AppFooter />
    </>
  );
}
