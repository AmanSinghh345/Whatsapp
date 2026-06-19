import type { Metadata } from "next";
import "./globals.css";
import { AuthHydrator } from "../features/auth/components/auth-hydrator";

export const metadata: Metadata = {
  title: "AmanTalk",
  description: "Fast, private realtime messaging",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthHydrator>{children}</AuthHydrator>
      </body>
    </html>
  );
}
