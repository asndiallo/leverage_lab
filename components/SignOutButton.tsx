"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={signOut}
      className="text-muted-foreground"
    >
      <LogOut className="size-4" />
      Sign out
    </Button>
  );
}
