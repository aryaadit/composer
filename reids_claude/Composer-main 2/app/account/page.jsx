'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The standalone /account route is deprecated — account settings now
 * live in the SideMenu drawer on the home screen. Bounce anyone who
 * still hits this URL back to home.
 */
export default function AccountPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/');
  }, [router]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center">
      <div className="w-8 h-8 border-3 border-[var(--mango)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
