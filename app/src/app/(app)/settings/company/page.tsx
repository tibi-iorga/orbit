"use client";

import React, { useState, useEffect, useCallback } from "react";
import { PlusIcon, PencilIcon, TrashIcon, GlobeAltIcon } from "@heroicons/react/24/outline";
import { ProductsSettings } from "@/components/ProductsSettings";
import { Button, Input, Textarea, Select, Badge, Chip, FormField, Modal, EmptyState, Text, CardRow, CardHeader, LoadingState } from "@/components/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrgProfile {
  id: string;
  name: string;
  description: string | null;
}

interface Department {
  id: string;
  name: string;
  description: string | null;
  _count: { products: number; goals: number };
}

interface Persona {
  id: string;
  name: string;
  description: string | null;
  productIds: string[];
}

interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: "active" | "paused" | "done";
  departmentId: string | null;
  department: { id: string; name: string } | null;
  _count: { opportunities: number };
}

interface Product {
  id: string;
  name: string;
}

type Tab = "profile" | "product-lines" | "departments" | "personas" | "goals";

const TABS: { value: Tab; label: string }[] = [
  { value: "profile", label: "Org Profile" },
  { value: "departments", label: "Departments" },
  { value: "product-lines", label: "Product Lines" },
  { value: "personas", label: "Personas" },
  { value: "goals", label: "Goals" },
];

const GOAL_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  done: "Done",
};

// ─── Org Profile tab ─────────────────────────────────────────────────────────

function ProfileTab() {
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [extractUrl, setExtractUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [showExtract, setShowExtract] = useState(false);

  useEffect(() => {
    fetch("/api/settings/org")
      .then((r) => r.json())
      .then((data: OrgProfile) => {
        setDescription(data.description ?? "");
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (res.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const handleExtract = async () => {
    if (!extractUrl.trim()) return;
    setExtracting(true);
    setExtractError(null);
    try {
      let url = extractUrl.trim();
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      const res = await fetch("/api/settings/org/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (res.ok && data.description) {
        setDescription(data.description);
        setShowExtract(false);
        setExtractUrl("");
      } else {
        setExtractError(data.error || "Could not extract description.");
      }
    } catch {
      setExtractError("Network error. Try again.");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Description */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-sm font-medium text-gray-700">Organisation description</label>
          <button
            onClick={() => { setShowExtract((v) => !v); setExtractError(null); }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <GlobeAltIcon className="h-3.5 w-3.5" />
            Import from website
          </button>
        </div>

        {showExtract && (
          <div className="mb-3 flex gap-2">
            <Input
              value={extractUrl}
              onChange={(e) => setExtractUrl(e.target.value)}
              placeholder="https://yourcompany.com"
              className="flex-1"
            />
            <Button
              onClick={handleExtract}
              disabled={extracting || !extractUrl.trim()}
              loading={extracting}
              size="sm"
              className="whitespace-nowrap"
            >
              Extract
            </Button>
          </div>
        )}
        {extractError && <p className="mb-2 text-xs text-danger">{extractError}</p>}

        <Textarea
          value={description}
          onChange={(e) => { setDescription(e.target.value); setSaved(false); }}
          rows={4}
          placeholder="What does your organisation do? Who do you serve?"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={saving}>
          Save changes
        </Button>
        {saved && <span className="text-sm text-success">Saved</span>}
      </div>
    </div>
  );
}

// ─── Departments tab ──────────────────────────────────────────────────────────

interface FlatProduct { id: string; name: string; departmentId: string | null; }

function DepartmentsTab() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [allProducts, setAllProducts] = useState<FlatProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formProductIds, setFormProductIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/departments").then((r) => r.json()),
      fetch("/api/products").then((r) => r.json()),
    ]).then(([dData, pData]) => {
      setDepartments(dData.departments ?? []);
      setAllProducts(pData.flat ?? []);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null); setFormName(""); setFormDesc(""); setFormProductIds([]); setModalOpen(true);
  }
  function openEdit(d: Department) {
    setEditing(d); setFormName(d.name); setFormDesc(d.description ?? "");
    setFormProductIds(allProducts.filter((p) => p.departmentId === d.id).map((p) => p.id));
    setModalOpen(true);
  }

  const toggleProduct = (id: string) =>
    setFormProductIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const url = editing ? `/api/departments/${editing.id}` : "/api/departments";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName.trim(), description: formDesc.trim() || null }),
      });
      if (!res.ok) return;
      const saved = await res.json();
      const deptId: string = saved.id ?? editing?.id;

      // Determine which products need updating
      const prevProductIds = editing ? allProducts.filter((p) => p.departmentId === editing.id).map((p) => p.id) : [];
      const toAssign = formProductIds.filter((id) => !prevProductIds.includes(id));
      const toUnassign = prevProductIds.filter((id) => !formProductIds.includes(id));
      await Promise.all([
        ...toAssign.map((id) => fetch("/api/products", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, departmentId: deptId }) })),
        ...toUnassign.map((id) => fetch("/api/products", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, departmentId: null }) })),
      ]);

      setModalOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (d: Department) => {
    if (!confirm(`Delete "${d.name}"? Products and goals linked to this department will become unassigned.`)) return;
    await fetch(`/api/departments/${d.id}`, { method: "DELETE" });
    load();
  };

  if (loading) return <LoadingState />;

  return (
    <div className="max-w-2xl space-y-4">
      <CardHeader
        description="Teams or pods that own product lines."
        action={
          <Button size="sm" onClick={openAdd}>
            <PlusIcon className="h-4 w-4" /> Add department
          </Button>
        }
      />

      {departments.length === 0 ? (
        <EmptyState message="No departments yet." />
      ) : (
        <div className="space-y-2">
          {departments.map((d) => (
            <CardRow
              key={d.id}
              actions={
                <>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(d)}><PencilIcon className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(d)} className="hover:text-danger"><TrashIcon className="h-4 w-4" /></Button>
                </>
              }
            >
              <Text variant="title">{d.name}</Text>
              {d.description && <Text variant="caption" className="mt-0.5">{d.description}</Text>}
              <Text variant="caption" color="subtle" className="mt-1">
                {d._count.products} product{d._count.products !== 1 ? "s" : ""} · {d._count.goals} goal{d._count.goals !== 1 ? "s" : ""}
              </Text>
            </CardRow>
          ))}
        </div>
      )}

      <Modal
        title={editing ? "Edit department" : "Add department"}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        saving={saving}
      >
        <FormField label="Name" required>
          <Input value={formName} onChange={(e) => setFormName(e.target.value)} autoFocus placeholder="e.g. Growth Team" />
        </FormField>
        <FormField label="Description" hint="optional">
          <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={2} placeholder="What does this team own or focus on?" />
        </FormField>
        {allProducts.length > 0 && (
          <FormField label="Owns these product lines" hint="optional">
            <div className="flex flex-wrap gap-2">
              {allProducts.map((p) => (
                <Chip key={p.id} selected={formProductIds.includes(p.id)} onClick={() => toggleProduct(p.id)}>
                  {p.name}
                </Chip>
              ))}
            </div>
          </FormField>
        )}
      </Modal>
    </div>
  );
}

// ─── Personas tab ─────────────────────────────────────────────────────────────

function PersonasTab() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Persona | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formProductIds, setFormProductIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/personas").then((r) => r.json()),
      fetch("/api/products").then((r) => r.json()),
    ]).then(([pData, prodData]) => {
      setPersonas(pData.personas ?? []);
      setProducts(prodData.flat ?? []);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() { setEditing(null); setFormName(""); setFormDesc(""); setFormProductIds([]); setModalOpen(true); }
  function openEdit(p: Persona) { setEditing(p); setFormName(p.name); setFormDesc(p.description ?? ""); setFormProductIds(p.productIds); setModalOpen(true); }

  const toggleProduct = (id: string) =>
    setFormProductIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const url = editing ? `/api/personas/${editing.id}` : "/api/personas";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName.trim(), description: formDesc.trim() || null, productIds: formProductIds }),
      });
      if (res.ok) { setModalOpen(false); load(); }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Persona) => {
    if (!confirm(`Delete "${p.name}"?`)) return;
    await fetch(`/api/personas/${p.id}`, { method: "DELETE" });
    load();
  };

  if (loading) return <LoadingState />;

  return (
    <div className="max-w-2xl space-y-4">
      <CardHeader
        description="User types and their working patterns. Used as AI context."
        action={
          <Button size="sm" onClick={openAdd}>
            <PlusIcon className="h-4 w-4" /> Add persona
          </Button>
        }
      />

      {personas.length === 0 ? (
        <EmptyState message="No personas yet." description="Add user types to give AI context about who uses your products." />
      ) : (
        <div className="space-y-2">
          {personas.map((p) => {
            const linkedProducts = products.filter((prod) => p.productIds.includes(prod.id));
            return (
              <CardRow
                key={p.id}
                actions={
                  <>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><PencilIcon className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(p)} className="hover:text-danger"><TrashIcon className="h-4 w-4" /></Button>
                  </>
                }
              >
                <Text variant="title">{p.name}</Text>
                {p.description && <Text variant="caption" clamp={2} className="mt-0.5">{p.description}</Text>}
                {linkedProducts.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {linkedProducts.map((prod) => <Badge key={prod.id}>{prod.name}</Badge>)}
                  </div>
                )}
              </CardRow>
            );
          })}
        </div>
      )}

      <Modal
        title={editing ? "Edit persona" : "Add persona"}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        saving={saving}
      >
        <FormField label="Name" required>
          <Input value={formName} onChange={(e) => setFormName(e.target.value)} autoFocus placeholder="e.g. Operations Manager" />
        </FormField>
        <FormField label="Description & quirks" hint="optional">
          <Textarea
            value={formDesc}
            onChange={(e) => setFormDesc(e.target.value)}
            rows={3}
            placeholder="How do they work? What are their constraints, habits, or pain points?"
          />
        </FormField>
        {products.length > 0 && (
          <FormField label="Uses these products" hint="optional">
            <div className="flex flex-wrap gap-2">
              {products.map((prod) => (
                <Chip
                  key={prod.id}
                  selected={formProductIds.includes(prod.id)}
                  onClick={() => toggleProduct(prod.id)}
                >
                  {prod.name}
                </Chip>
              ))}
            </div>
          </FormField>
        )}
      </Modal>
    </div>
  );
}

// ─── Goals tab ────────────────────────────────────────────────────────────────

function GoalsTab() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formDept, setFormDept] = useState("");
  const [formStatus, setFormStatus] = useState("active");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/goals").then((r) => r.json()),
      fetch("/api/departments").then((r) => r.json()),
    ]).then(([gData, dData]) => {
      setGoals(gData.goals ?? []);
      setDepartments(dData.departments ?? []);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() { setEditing(null); setFormTitle(""); setFormDesc(""); setFormDept(""); setFormStatus("active"); setModalOpen(true); }
  function openEdit(g: Goal) { setEditing(g); setFormTitle(g.title); setFormDesc(g.description ?? ""); setFormDept(g.departmentId ?? ""); setFormStatus(g.status); setModalOpen(true); }

  const handleSave = async () => {
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      const url = editing ? `/api/goals/${editing.id}` : "/api/goals";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: formTitle.trim(), description: formDesc.trim() || null, departmentId: formDept || null, status: formStatus }),
      });
      if (res.ok) { setModalOpen(false); load(); }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (g: Goal) => {
    if (!confirm(`Delete "${g.title}"? Opportunities linked to this goal will become unassigned.`)) return;
    await fetch(`/api/goals/${g.id}`, { method: "DELETE" });
    load();
  };

  if (loading) return <LoadingState />;

  return (
    <div className="max-w-2xl space-y-4">
      <CardHeader
        description="Strategic goals at company or department level. Link opportunities to goals."
        action={
          <Button size="sm" onClick={openAdd}>
            <PlusIcon className="h-4 w-4" /> Add goal
          </Button>
        }
      />

      {goals.length === 0 ? (
        <EmptyState message="No goals yet." description="Add strategic goals to link opportunities to company outcomes." />
      ) : (
        <div className="space-y-2">
          {goals.map((g) => (
            <CardRow
              key={g.id}
              actions={
                <>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(g)}><PencilIcon className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(g)} className="hover:text-danger"><TrashIcon className="h-4 w-4" /></Button>
                </>
              }
            >
              <div className="flex items-center gap-2 flex-wrap">
                <Text variant="title">{g.title}</Text>
                <Badge variant={g.status as "active" | "paused" | "done"}>{GOAL_STATUS_LABELS[g.status]}</Badge>
              </div>
              {g.description && <Text variant="caption" clamp={2} className="mt-0.5">{g.description}</Text>}
              <Text variant="caption" color="subtle" className="mt-1">
                {g.department ? g.department.name : "Company-wide"} · {g._count.opportunities} opportunit{g._count.opportunities !== 1 ? "ies" : "y"}
              </Text>
            </CardRow>
          ))}
        </div>
      )}

      <Modal
        title={editing ? "Edit goal" : "Add goal"}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        saving={saving}
      >
        <FormField label="Title" required>
          <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} autoFocus placeholder="e.g. Reduce onboarding time by 30%" />
        </FormField>
        <FormField label="Description" hint="optional">
          <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={2} placeholder="More context on the goal and how it will be measured." />
        </FormField>
        <FormField label="Department" hint="optional — leave blank for company-wide">
          <Select value={formDept} onChange={(e) => setFormDept(e.target.value)}>
            <option value="">Company-wide</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Status">
          <div className="flex gap-2">
            {(["active", "paused", "done"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setFormStatus(s)}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${formStatus === s ? "bg-brand text-white border-brand" : "bg-surface text-content-muted border-border-strong hover:border-content-subtle"}`}>
                {GOAL_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </FormField>
      </Modal>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompanySettingsPage() {
  const [tab, setTab] = useState<Tab>("profile");
  const [orgName, setOrgName] = useState<string>("");

  useEffect(() => {
    fetch("/api/settings/org")
      .then((r) => r.json())
      .then((data) => { if (data?.name) setOrgName(data.name); })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{orgName || "Your Company"}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Strategic context that helps AI interpret your feedback and generate better insights.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-x-6">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium ${
                tab === t.value
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "profile" && <ProfileTab />}
      {tab === "departments" && <DepartmentsTab />}
      {tab === "product-lines" && <ProductsSettings />}
      {tab === "personas" && <PersonasTab />}
      {tab === "goals" && <GoalsTab />}
    </div>
  );
}
