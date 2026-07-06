"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { NavLinks } from "@/components/NavLinks";
import SignOutButton from "@/components/SignOutButton";

export function MobileNav({ email }: { email: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="icon"
        className="sm:hidden"
        aria-label="Open navigation"
        onClick={() => setOpen(true)}
      >
        <Menu className="size-4" />
      </Button>
      <SheetContent side="left" className="flex w-64 flex-col p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle>Leverage Lab</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-1 p-3">
          <NavLinks className="flex-col items-stretch" onNavigate={() => setOpen(false)} />
        </div>
        <div className="flex items-center justify-between gap-3 border-t p-4">
          <span className="truncate text-xs text-muted-foreground">{email}</span>
          <SignOutButton />
        </div>
      </SheetContent>
    </Sheet>
  );
}
