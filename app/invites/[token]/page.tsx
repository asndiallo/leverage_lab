import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// Accepting an invite is a side effect of visiting this URL while signed in as
// the invited email — see accept_property_invite() (0006). Unauthenticated
// visitors are bounced to /login with `next` pointing back here so they land
// right back on this page once signed in (see app/login/page.tsx).
export default async function AcceptInvitePage(props: {
  params: Promise<{ token: string }>;
}) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/invites/${params.token}`)}`);
  }

  const { data: propertyId, error } = await supabase.rpc(
    "accept_property_invite",
    {
      p_token: params.token,
    },
  );

  if (error || !propertyId) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-sm p-8 text-center">
          <h1 className="text-lg font-semibold tracking-tight">
            Invite not valid
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {error?.message ??
              "This invite link is invalid, expired, or already used."}
          </p>
        </Card>
      </main>
    );
  }

  redirect(`/properties/${propertyId}`);
}
