import type { Metadata } from "next";
import "./globals.css";
import { AuthHydrator } from "../features/auth/components/auth-hydrator";

export const metadata: Metadata = {
  title: "Chat App",
  description: "Realtime chat app"
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

