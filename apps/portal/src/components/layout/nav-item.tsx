'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItemProps {
  href: string;
  label: string;
  icon: React.ReactNode;
}

export function NavItem({ href, label, icon }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`
        flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
        ${
          isActive
            ? 'bg-accent-muted text-accent border-l-2 border-accent pl-[10px]'
            : 'text-text-secondary hover:text-text-primary hover:bg-background-elevated'
        }
      `}
      aria-current={isActive ? 'page' : undefined}
    >
      <span className="w-5 h-5 flex-shrink-0">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
