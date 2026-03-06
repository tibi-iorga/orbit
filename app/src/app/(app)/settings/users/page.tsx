"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Input, Select } from "@/components/ui";

type Role = "owner" | "admin" | "editor" | "viewer";

type Member = {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt: string;
};

type Invitation = {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  createdAt: string;
};

type AccessData = {
  members: Member[];
  invitations: Invitation[];
};

const inviteRoleOptions: Array<{ value: Exclude<Role, "owner">; label: string; help: string }> = [
  { value: "viewer", label: "Viewer", help: "Can view feedback and actions." },
  { value: "editor", label: "Editor", help: "Can create and edit feedback and actions." },
  { value: "admin", label: "Admin", help: "Can manage people, access, and settings." },
];

const memberRoleOptions: Array<{ value: Role; label: string }> = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Viewer" },
];

function roleBadgeClass(role: Role): string {
  switch (role) {
    case "owner":
      return "bg-purple-100 text-purple-700 border-purple-200";
    case "admin":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "editor":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function UsersSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<AccessData>({ members: [], invitations: [] });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<Role, "owner">>("viewer");
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState("");

  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function loadData() {
    setError("");
    const res = await fetch("/api/users/invitations");
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Failed to load access settings");
    }
    const body: AccessData = await res.json();
    setData(body);
  }

  useEffect(() => {
    loadData().catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const sortedMembers = useMemo(
    () => [...data.members].sort((a, b) => a.email.localeCompare(b.email)),
    [data.members]
  );

  async function handleInvite() {
    setInviteSuccess("");
    setError("");
    setInviteSaving(true);
    try {
      const res = await fetch("/api/users/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not send invite");

      setInviteEmail("");
      setInviteRole("viewer");
      setInviteSuccess("Invite sent. Ask your teammate to sign in with the same email address.");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send invite");
    } finally {
      setInviteSaving(false);
    }
  }

  async function updateMemberRole(member: Member, role: Role) {
    const actionId = `member-role-${member.userId}`;
    setBusyAction(actionId);
    setError("");
    try {
      const res = await fetch("/api/users/invitations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "member", userId: member.userId, role }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not update role");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update role");
    } finally {
      setBusyAction(null);
    }
  }

  async function updateInviteRole(invitation: Invitation, role: Exclude<Role, "owner">) {
    const actionId = `invite-role-${invitation.id}`;
    setBusyAction(actionId);
    setError("");
    try {
      const res = await fetch("/api/users/invitations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "invitation", invitationId: invitation.id, role }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not update invite");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update invite");
    } finally {
      setBusyAction(null);
    }
  }

  async function removeMember(member: Member) {
    if (!confirm(`Remove access for ${member.email}?`)) return;
    const actionId = `member-remove-${member.userId}`;
    setBusyAction(actionId);
    setError("");
    try {
      const res = await fetch(`/api/users/invitations?userId=${encodeURIComponent(member.userId)}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not remove member");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove member");
    } finally {
      setBusyAction(null);
    }
  }

  async function revokeInvite(invitation: Invitation) {
    if (!confirm(`Revoke invite for ${invitation.email}?`)) return;
    const actionId = `invite-remove-${invitation.id}`;
    setBusyAction(actionId);
    setError("");
    try {
      const res = await fetch(`/api/users/invitations?invitationId=${encodeURIComponent(invitation.id)}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not revoke invite");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke invite");
    } finally {
      setBusyAction(null);
    }
  }

  if (loading) return <p className="text-sm text-content-muted">Loading access settings...</p>;

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">People and Access</h1>
        <p className="mt-1 text-sm text-gray-500">
          Invite teammates, set what they can do, and remove access when needed.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Invite a teammate</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            They will get access as soon as they sign in with the same email address.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-content mb-1">Email address</label>
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="name@company.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-content mb-1">Role</label>
            <Select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Exclude<Role, "owner">)}
            >
              {inviteRoleOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </div>
        </div>

        <p className="text-xs text-content-muted">
          {inviteRoleOptions.find((r) => r.value === inviteRole)?.help}
        </p>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleInvite}
            loading={inviteSaving}
            disabled={inviteSaving || !inviteEmail.trim()}
          >
            Send invite
          </Button>
          {inviteSuccess && <span className="text-sm text-success">{inviteSuccess}</span>}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Current team</h2>
          <p className="text-sm text-gray-500 mt-0.5">These people can currently access this workspace.</p>
        </div>

        {sortedMembers.length === 0 ? (
          <p className="text-sm text-gray-500">No members yet.</p>
        ) : (
          <div className="space-y-2">
            {sortedMembers.map((member) => {
              const isBusy = busyAction === `member-role-${member.userId}` || busyAction === `member-remove-${member.userId}`;
              return (
                <div key={member.userId} className="border border-gray-200 rounded-lg px-4 py-3 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{member.name || member.email}</p>
                    <p className="text-xs text-gray-500 truncate">{member.email}</p>
                    <p className="text-xs text-gray-400 mt-1">Joined {formatDate(member.createdAt)}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${roleBadgeClass(member.role)}`}>
                      {member.role}
                    </span>
                    <Select
                      value={member.role}
                      disabled={isBusy}
                      onChange={(e) => updateMemberRole(member, e.target.value as Role)}
                      className="w-auto py-1.5"
                    >
                      {memberRoleOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </Select>
                    <Button variant="danger" size="sm" onClick={() => removeMember(member)} disabled={isBusy}>
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Pending invites</h2>
          <p className="text-sm text-gray-500 mt-0.5">Invites waiting for people to sign in.</p>
        </div>

        {data.invitations.length === 0 ? (
          <p className="text-sm text-gray-500">No pending invites.</p>
        ) : (
          <div className="space-y-2">
            {data.invitations.map((invitation) => {
              const isBusy = busyAction === `invite-role-${invitation.id}` || busyAction === `invite-remove-${invitation.id}`;
              return (
                <div key={invitation.id} className="border border-gray-200 rounded-lg px-4 py-3 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{invitation.email}</p>
                    <p className="text-xs text-gray-400 mt-1">Expires {formatDate(invitation.expiresAt)}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${roleBadgeClass(invitation.role)}`}>
                      {invitation.role}
                    </span>
                    <Select
                      value={invitation.role}
                      disabled={isBusy}
                      onChange={(e) => updateInviteRole(invitation, e.target.value as Exclude<Role, "owner">)}
                      className="w-auto py-1.5"
                    >
                      {inviteRoleOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </Select>
                    <Button variant="danger" size="sm" onClick={() => revokeInvite(invitation)} disabled={isBusy}>
                      Revoke
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
