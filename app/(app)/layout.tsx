import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";
import { NavLinks } from "@/components/NavLinks";
import { MobileNav } from "@/components/MobileNav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="bg-background/85 supports-backdrop-filter:bg-background/60 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <MobileNav email={user.email ?? ""} />
            <Link href="/" className="flex items-center gap-2">
              <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md text-xs font-semibold">
                LL
              </span>
              <span className="hidden font-semibold tracking-tight sm:inline">
                Leverage Lab
              </span>
            </Link>
            <NavLinks className="hidden sm:flex" />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground hidden font-mono text-xs md:inline">
              {user.email}
            </span>
            <div className="hidden sm:block">
              <SignOutButton />
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
