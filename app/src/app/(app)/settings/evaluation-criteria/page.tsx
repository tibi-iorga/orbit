"use client";

import { useEffect, useState } from "react";
import type { Dimension } from "@/types";
import { useDebounce } from "@/lib/useDebounce";
import { Button, Input, Select, EmptyState } from "@/components/ui";

const CONFIRM_PHRASE = "i want to delete this";
const ARCHIVE_PHRASE = "archive";

function InfoIcon({ tip }: { tip: string }) {
  return (
    <span className="relative group inline-flex items-center ml-1">
      <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-gray-300 text-white text-[9px] font-bold leading-none cursor-default select-none">
        i
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-64 rounded bg-gray-800 px-2.5 py-1.5 text-xs text-white leading-snug opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg whitespace-normal">
        {tip}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
      </span>
    </span>
  );
}

interface DeleteModalState {
  dimension: Dimension;
  scoredCount: number;
}

export default function EvaluationCriteriaPage() {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [archiveModal, setArchiveModal] = useState<Dimension | null>(null);
  const [archiveInput, setArchiveInput] = useState("");
  const [archiving, setArchiving] = useState(false);

  function load() {
    fetch("/api/dimensions")
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.error || `Server returned ${r.status}`);
        }
        return r.json();
      })
      .then(setDimensions)
      .catch((error) => {
        console.error("Error loading dimensions:", error);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function save(id: string, patch: Partial<Dimension>) {
    await fetch("/api/dimensions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    load();
  }

  const debouncedSave = useDebounce(save, 500);

  function updateLocal(id: string, patch: Partial<Dimension>) {
    setDimensions((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d))
    );
  }

  async function add() {
    await fetch("/api/dimensions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", type: "scale", weight: 1, tag: "", direction: "benefit" }),
    });
    load();
  }

  async function confirmArchive() {
    if (!archiveModal) return;
    setArchiving(true);
    await fetch("/api/dimensions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: archiveModal.id, archived: true }),
    });
    setArchiveModal(null);
    setArchiving(false);
    load();
  }

  async function restore(id: string) {
    await fetch("/api/dimensions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, archived: false }),
    });
    load();
  }

  async function openDeleteModal(dimension: Dimension) {
    // Probe the API to get the scored count (sends confirmed: false, always returns 400 with count)
    const res = await fetch(`/api/dimensions?id=${encodeURIComponent(dimension.id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: false }),
    });
    const data = await res.json();
    setDeleteInput("");
    setDeleteModal({ dimension, scoredCount: data.scoredCount ?? 0 });
  }

  async function confirmDelete() {
    if (!deleteModal) return;
    setDeleting(true);
    await fetch(`/api/dimensions?id=${encodeURIComponent(deleteModal.dimension.id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
    });
    setDeleteModal(null);
    setDeleting(false);
    load();
  }

  const active = dimensions.filter((d) => !d.archived);
  const archived = dimensions.filter((d) => d.archived);
  const totalWeight = active.reduce((sum, d) => sum + d.weight, 0);

  if (loading) return <p className="text-content-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-content">Evaluation Criteria</h1>
        <p className="text-sm text-content-muted mt-1">
          Define what matters to your team. Score each opportunity against these dimensions to surface the most important work.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-6">
          <button
            type="button"
            onClick={() => setActiveTab("active")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "active"
                ? "border-content text-content"
                : "border-transparent text-content-muted hover:text-content"
            }`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("archived")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "archived"
                ? "border-content text-content"
                : "border-transparent text-content-muted hover:text-content"
            }`}
          >
            Archived
            {archived.length > 0 && (
              <span className="ml-1.5 rounded-full bg-surface-subtle px-2 py-0.5 text-xs text-content-muted">
                {archived.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Active tab */}
      {activeTab === "active" && (
        <>
          {active.length === 0 ? (
            <EmptyState
              message="No criteria yet"
              description={"Add dimensions that reflect your team's priorities — e.g. \"Carer impact\", \"Dev complexity\", \"Ops effort\"."}
              action={<Button size="sm" onClick={add}>Add your first dimension</Button>}
            />
          ) : (
            <div className="shadow-sm ring-1 ring-border ring-opacity-5 rounded-lg">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-surface-muted">
                  <tr>
                    <th className="py-3 pl-4 pr-3 text-left text-xs font-medium text-content-muted">
                      <span className="inline-flex items-center">
                        Dimension
                        <InfoIcon tip="What you're measuring, e.g. 'Dev complexity' or 'Carer impact'" />
                      </span>
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-content-muted whitespace-nowrap">
                      <span className="inline-flex items-center">
                        Answer type
                        <InfoIcon tip="How scorers will answer: a 1–3 scale or a simple Yes/No question" />
                      </span>
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-content-muted">
                      <span className="inline-flex items-center">
                        Direction
                        <InfoIcon tip="Whether a higher score (or Yes) is good or bad for this dimension" />
                      </span>
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-content-muted">
                      <span className="inline-flex items-center">
                        Importance
                        <InfoIcon tip="How much this dimension contributes to the overall score relative to others" />
                      </span>
                    </th>
                    <th className="relative py-3 pl-3 pr-4">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {active.map((d) => {
                    const pct = totalWeight > 0 ? Math.round((d.weight / totalWeight) * 100) : 0;
                    return (
                      <tr key={d.id} className="hover:bg-surface-muted/50">
                        {/* Name */}
                        <td className="py-2 pl-4 pr-3">
                          <Input
                            value={d.name}
                            onChange={(e) => {
                              updateLocal(d.id, { name: e.target.value });
                              if (e.target.value.trim()) {
                                debouncedSave(d.id, { name: e.target.value });
                              }
                            }}
                            onBlur={(e) => {
                              if (e.target.value.trim()) {
                                save(d.id, { name: e.target.value.trim() });
                              }
                            }}
                            placeholder="e.g. Carer impact"
                            className={`py-1 font-medium bg-transparent ${d.name.trim() ? "border-transparent hover:border-border-strong" : "border-danger"}`}
                          />
                        </td>

                        {/* Answer type */}
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Select
                            value={d.type}
                            onChange={(e) => {
                              const type = e.target.value as "yesno" | "scale";
                              updateLocal(d.id, { type });
                              save(d.id, { type });
                            }}
                            className="w-36 py-1.5"
                          >
                            <option value="scale">1 – 3 scale</option>
                            <option value="yesno">Yes / No</option>
                          </Select>
                        </td>

                        {/* Direction */}
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Select
                            value={d.direction}
                            onChange={(e) => {
                              const direction = e.target.value as "benefit" | "cost";
                              updateLocal(d.id, { direction });
                              save(d.id, { direction });
                            }}
                            className="w-36 py-1.5"
                          >
                            {d.type === "yesno" ? (
                              <>
                                <option value="benefit">Yes = good</option>
                                <option value="cost">Yes = bad</option>
                              </>
                            ) : (
                              <>
                                <option value="benefit">↑ Good</option>
                                <option value="cost">↓ Bad</option>
                              </>
                            )}
                          </Select>
                        </td>

                        {/* Importance */}
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Select
                              value={d.weight}
                              onChange={(e) => {
                                const weight = parseFloat(e.target.value);
                                updateLocal(d.id, { weight });
                                save(d.id, { weight });
                              }}
                              className="w-36 py-1.5"
                            >
                              <option value="1">Low</option>
                              <option value="2">Medium</option>
                              <option value="3">High</option>
                            </Select>
                            <span className="text-xs text-content-subtle">{pct}%</span>
                          </div>
                        </td>

                        {/* Archive */}
                        <td className="pl-3 pr-4 py-2 text-right whitespace-nowrap">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => { setArchiveInput(""); setArchiveModal(d); }}
                            disabled={!d.name.trim()}
                            title={!d.name.trim() ? "Add a name before archiving" : undefined}
                          >
                            Archive
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

                      <div className="bg-surface-muted px-4 py-3 border-t border-border">
                <Button type="button" variant="ghost" size="sm" onClick={add}>
                  + Add dimension
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Archived tab */}
      {activeTab === "archived" && (
        <>
          {archived.length === 0 ? (
            <EmptyState
              message="No archived dimensions"
              description="Archived dimensions are hidden from scoring but their historical scores are preserved."
            />
          ) : (
            <div className="shadow-sm ring-1 ring-border ring-opacity-5 rounded-lg">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-surface-muted">
                  <tr>
                    <th className="py-3 pl-4 pr-3 text-left text-xs font-medium text-content-muted">
                      Dimension
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-content-muted whitespace-nowrap">
                      Answer type
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-content-muted">
                      Direction
                    </th>
                    <th className="relative py-3 pl-3 pr-4">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {archived.map((d) => (
                    <tr key={d.id} className="hover:bg-surface-muted/50">
                      <td className="py-3 pl-4 pr-3 text-sm font-medium text-content-muted">
                        {d.name || <span className="italic text-content-subtle">Unnamed</span>}
                      </td>
                      <td className="px-3 py-3 text-sm text-content-subtle whitespace-nowrap">
                        {d.type === "scale" ? "1 – 3 scale" : "Yes / No"}
                      </td>
                      <td className="px-3 py-3 text-sm text-content-subtle whitespace-nowrap">
                        {d.type === "yesno"
                          ? d.direction === "benefit" ? "Yes = good" : "Yes = bad"
                          : d.direction === "benefit" ? "↑ Good" : "↓ Bad"}
                      </td>
                      <td className="pl-3 pr-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <Button type="button" variant="ghost" size="sm" onClick={() => restore(d.id)}>
                            Restore
                          </Button>
                          <Button type="button" variant="danger" size="sm" onClick={() => openDeleteModal(d)}>
                            Delete permanently
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Archive confirmation modal */}
      {archiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-brand/40 backdrop-blur-[1px]" onClick={() => !archiving && setArchiveModal(null)} />
          <div className="relative bg-surface rounded-xl shadow-2xl ring-1 ring-border w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-semibold text-content">
              Archive &ldquo;{archiveModal.name || "Unnamed"}&rdquo;?
            </h2>
            <p className="text-sm text-content-muted">
              This dimension will be hidden from scoring panels. Existing scores on all opportunities are preserved and will still contribute to their combined scores.
            </p>
            <p className="text-sm text-content-muted">
              You can restore it at any time from the Archived tab.
            </p>
            <div className="space-y-1">
              <label className="block text-sm text-content-muted">
                Type <span className="font-mono font-semibold text-content">{ARCHIVE_PHRASE}</span> to confirm
              </label>
              <Input
                type="text"
                value={archiveInput}
                onChange={(e) => setArchiveInput(e.target.value)}
                placeholder={ARCHIVE_PHRASE}
                disabled={archiving}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <Button type="button" variant="ghost" onClick={() => setArchiveModal(null)} disabled={archiving}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={confirmArchive}
                disabled={archiveInput !== ARCHIVE_PHRASE || archiving}
                loading={archiving}
              >
                {archiving ? "Archiving…" : "Archive"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-brand/40 backdrop-blur-[1px]" onClick={() => !deleting && setDeleteModal(null)} />
          <div className="relative bg-surface rounded-xl shadow-2xl ring-1 ring-border w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-semibold text-content">
              Permanently delete &ldquo;{deleteModal.dimension.name || "Unnamed"}&rdquo;?
            </h2>

            {deleteModal.scoredCount > 0 ? (
              <div className="rounded-md bg-danger-bg border border-danger/20 p-3">
                <p className="text-sm text-danger font-medium">
                  {deleteModal.scoredCount}{" "}
                  {deleteModal.scoredCount === 1 ? "opportunity has" : "opportunities have"} scores
                  recorded for this dimension.
                </p>
                <p className="text-sm text-danger mt-1">
                  Those scores will be silently dropped from combined score calculations. This cannot be undone.
                </p>
              </div>
            ) : (
              <p className="text-sm text-content-muted">
                No opportunities have been scored on this dimension yet. This cannot be undone.
              </p>
            )}

            <div className="space-y-1">
              <label className="block text-sm text-content-muted">
                Type{" "}
                <span className="font-mono font-semibold text-content">{CONFIRM_PHRASE}</span>{" "}
                to confirm
              </label>
              <Input
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                placeholder={CONFIRM_PHRASE}
                disabled={deleting}
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <Button type="button" variant="ghost" onClick={() => setDeleteModal(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={confirmDelete}
                disabled={deleteInput !== CONFIRM_PHRASE || deleting}
                loading={deleting}
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
