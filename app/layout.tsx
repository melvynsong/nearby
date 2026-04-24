import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppFooter from "@/components/AppFooter";
import AppHeader from "@/components/AppHeader";
import { withBasePath } from "@/lib/base-path";
import { isCurrentUserAdminChef } from "@/lib/adminchef";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nearby - Discover good places nearby, together.",
  description: "Nearby helps you find, save, and share useful places around you - from food spots to meetup ideas and local finds.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "256x256" },
    ],
    shortcut: "/favicon.ico",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let isAdminChef = false;
  try {
    isAdminChef = await isCurrentUserAdminChef();
  } catch (e) {
    isAdminChef = false;
  }
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppHeader isAdminChef={isAdminChef} />
        <div className="flex-1">{children}</div>
        <AppFooter />
      </body>
    </html>
  );
}
