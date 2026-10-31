import { requestAuthConfig } from "../../../lib/auth/request.js";
import { needsOnboarding } from "../../../lib/auth/profile.js";
import { currentUser } from "../../../lib/auth/server.js";
import { AuthCard, Links, Notice } from "../../auth/ui.js";

import { ProfileForm } from "./form.js";

export async function ProfileScreen({ searchParams }) {
  const config = await requestAuthConfig();
  const params = await searchParams;
  // `?welcome=1` is set by the post-sign-in redirect and only changes the sentence at the top; the
  // form is the same form, because a learner who lands here later edits the same three fields.
  const welcome = params?.welcome === "1";
  const next = "/account/profile";

  if (!config.enabled) {
    return (
      <AuthCard title="Your profile">
        <Notice>{config.reason}</Notice>
        <Links items={[{ href: "/learn", label: "Your drills" }]} />
      </AuthCard>
    );
  }

  const { supabase, user } = await currentUser();
  if (!user) {
    return (
      <AuthCard title="Your profile">
        <Notice>You are signed out. Sign in to edit your profile.</Notice>
        <Links items={[{ href: `/login?next=${encodeURIComponent(next)}`, label: "Sign in" }]} />
      </AuthCard>
    );
  }

  // `id = auth.uid()` is the policy, so this can only return the learner's own row.
  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, linkedin_url")
    .eq("id", user.id)
    .maybeSingle();

  const first = needsOnboarding(profile);
  return (
    <AuthCard
      title={welcome && first ? "Finish your profile" : "Your profile"}
      lede={
        welcome && first
          ? "One thing before your drills: pick the name other learners would see. You can change it any time."
          : "Your username is how you are listed. Everything else is optional, and you can change it any time."
      }
    >
      <ProfileForm
        values={{
          username: profile?.username ?? "",
          display_name: profile?.display_name ?? "",
          linkedin_url: profile?.linkedin_url ?? "",
        }}
        notice={first ? "Your display name is still empty." : null}
      />
      <Links
        items={
          first
            ? [
                { href: "/learn", label: "Skip for now" },
                { href: "/account", label: "Your account" },
              ]
            : [
                { href: "/account", label: "Your account" },
                { href: "/learn", label: "Your drills" },
              ]
        }
      />
    </AuthCard>
  );
}
