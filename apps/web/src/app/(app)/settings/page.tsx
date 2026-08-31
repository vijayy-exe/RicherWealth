"use client";

import { useState } from "react";
import { Shield, ShieldAlert, Key, LogOut } from "lucide-react";

import { useUser, authFetch } from "@/hooks/useUser";
import { usePasskeys, useRegisterPasskey, useDeletePasskey } from "@/hooks/usePasskeys";
import { Button, Card, Badge, Input } from "@richer/ui";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const { data: user, refetch } = useUser();
  const router = useRouter();
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<"profile" | "security" | "preferences">("profile");

  const { data: passkeys } = usePasskeys();
  const registerPasskey = useRegisterPasskey();
  const deletePasskey = useDeletePasskey();
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  const handleRegisterPasskey = async () => {
    setPasskeyError(null);
    try {
      await registerPasskey.mutateAsync(undefined);
    } catch (err) {
      setPasskeyError(err instanceof Error ? err.message : "Failed to register passkey");
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Account Settings</h1>
        <Button variant="ghost" onClick={() => void handleSignOut()} leftIcon={<LogOut size={16} />}>
          Sign out
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Nav */}
        <div className="w-full md:w-64 flex flex-col gap-2 shrink-0">
          {[
            { id: "profile", label: "Profile" },
            { id: "security", label: "Security & MFA" },
            { id: "preferences", label: "Preferences" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1">
          {activeTab === "profile" && (
            <Card className="flex flex-col gap-6">
              <h2 className="text-lg font-semibold border-b border-[var(--color-border-subtle)] pb-4">Profile Details</h2>
              <div className="flex flex-col gap-4 max-w-md">
                <Input label="Email address" value={user.email} disabled hint="To change your email, contact support." />
                <Input label="Full name" defaultValue={user.name || ""} />
                <Button className="w-fit">Save Changes</Button>
              </div>
            </Card>
          )}

          {activeTab === "security" && (
            <div className="flex flex-col gap-6">
              <Card className="flex flex-col gap-6">
                <div className="flex items-start justify-between border-b border-[var(--color-border-subtle)] pb-4">
                  <div>
                    <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
                      Two-Factor Authentication (TOTP)
                      {user.mfaEnabled ? <Badge variant="gain">Enabled</Badge> : <Badge variant="outline">Disabled</Badge>}
                    </h2>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      Add an extra layer of security to your account using an authenticator app.
                    </p>
                  </div>
                  {user.mfaEnabled ? (
                    <Shield className="text-[var(--color-gain)]" size={32} />
                  ) : (
                    <ShieldAlert className="text-[var(--color-text-muted)]" size={32} />
                  )}
                </div>
                <div>
                  <Button variant={user.mfaEnabled ? "danger" : "primary"}>
                    {user.mfaEnabled ? "Disable 2FA" : "Set up 2FA"}
                  </Button>
                </div>
              </Card>

              <Card className="flex flex-col gap-6">
                <div className="flex items-start justify-between border-b border-[var(--color-border-subtle)] pb-4">
                  <div>
                    <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
                      Passkeys
                      <Badge variant="accent">New</Badge>
                    </h2>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      Sign in securely with your face, fingerprint, or device PIN.
                    </p>
                  </div>
                  <Key className="text-[var(--color-accent)]" size={32} />
                </div>

                {passkeys && passkeys.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {passkeys.map((pk) => (
                      <div
                        key={pk.id}
                        className="flex items-center justify-between px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)]"
                      >
                        <div>
                          <p className="text-sm font-medium">{pk.name}</p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {pk.lastUsedAt
                              ? `Last used ${new Date(pk.lastUsedAt).toLocaleDateString()}`
                              : `Added ${new Date(pk.createdAt).toLocaleDateString()}`}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void deletePasskey.mutate(pk.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {passkeyError && (
                  <p role="alert" className="text-sm text-[var(--color-loss)]">
                    {passkeyError}
                  </p>
                )}

                <div>
                  <Button
                    variant="outline"
                    isLoading={registerPasskey.isPending}
                    onClick={() => void handleRegisterPasskey()}
                  >
                    Register new passkey
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {activeTab === "preferences" && (
            <Card className="flex flex-col gap-6">
              <h2 className="text-lg font-semibold border-b border-[var(--color-border-subtle)] pb-4">App Preferences</h2>
              <div className="flex flex-col gap-4 max-w-md">
                <Input label="Base Currency" value={user.baseCurrency} disabled hint="Determines how your overall net worth is displayed." />
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
