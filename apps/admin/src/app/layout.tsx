import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vima Admin — Platform Administration',
  description: 'Manage tenants, services, and platform operations',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background font-sans antialiased">{children}</body>
    </html>
  );
}
