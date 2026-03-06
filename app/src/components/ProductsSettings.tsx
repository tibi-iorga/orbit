"use client";

import React, { useEffect, useState } from "react";
import {
  PencilIcon,
  TrashIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Button, Input, Textarea, Select, Modal, EmptyState, Chip } from "@/components/ui";

interface Product {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  departmentId: string | null;
  feedbackCount: number;
  importCount: number;
  createdAt: string;
  children?: Product[];
}

interface Department {
  id: string;
  name: string;
}

const PLATFORMS = ["Web", "Mobile (iOS)", "Mobile (Android)", "Desktop", "API / Backend"];
const APP_TYPES = ["B2C", "B2B", "Internal tool", "Developer tool", "Other"];

function composeDescription(
  platforms: string[],
  appType: string,
  users: string,
  goal: string
): string | null {
  const parts: string[] = [];
  if (platforms.length) parts.push(platforms.join("/"));
  if (appType) parts.push(appType + " app");
  if (users.trim()) parts.push(`used by ${users.trim()}`);
  const base = parts.join(" ");
  const goalTrimmed = goal.trim();
  if (!base && !goalTrimmed) return null;
  if (!goalTrimmed) return base;
  if (!base) return `Goal: ${goalTrimmed}`;
  return `${base}. Goal: ${goalTrimmed}`;
}

function getProductPath(product: Product, flat: Product[]): string {
  const path: string[] = [];
  let current: Product | undefined = product;
  while (current) {
    path.unshift(current.name);
    current = current.parentId ? flat.find((p) => p.id === current!.parentId) : undefined;
  }
  return path.join(" › ");
}

// ── Add/Edit Modal ─────────────────────────────────────────────────────────

function ProductModal({
  isOpen,
  editingProduct,
  flatProducts,
  departments,
  saving,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  editingProduct: Product | null;
  flatProducts: Product[];
  departments: Department[];
  saving: boolean;
  onSave: (data: { name: string; description: string | null; parentId: string | null; departmentId: string | null }) => void;
  onClose: () => void;
}) {
  const [formName, setFormName] = useState("");
  const [formParentId, setFormParentId] = useState<string | null>(null);
  const [formDepartmentId, setFormDepartmentId] = useState<string | null>(null);
  const [descMode, setDescMode] = useState<"guided" | "manual">("guided");
  const [formPlatforms, setFormPlatforms] = useState<string[]>([]);
  const [formAppType, setFormAppType] = useState("");
  const [formUsers, setFormUsers] = useState("");
  const [formGoal, setFormGoal] = useState("");
  const [formDescManual, setFormDescManual] = useState("");
  const [improvingGoal, setImprovingGoal] = useState(false);
  const [improveError, setImproveError] = useState<string | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);

  useEffect(() => {
    fetch("/api/settings/ai")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.keySource !== "none") setAiAvailable(true); })
      .catch(() => {});
  }, []);

  async function improveGoal() {
    if (!formGoal.trim() || improvingGoal) return;
    setImprovingGoal(true);
    setImproveError(null);
    try {
      const res = await fetch("/api/ai/improve-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: formGoal }),
      });
      const data = await res.json();
      if (res.ok && data.improved) {
        setFormGoal(data.improved);
      } else {
        setImproveError(data.error || "AI couldn't improve this — try rephrasing and try again.");
      }
    } catch {
      setImproveError("Couldn't reach AI. Check your connection and try again.");
    } finally {
      setImprovingGoal(false);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    if (editingProduct) {
      setFormName(editingProduct.name);
      setFormParentId(editingProduct.parentId);
      setFormDepartmentId(editingProduct.departmentId);
      if (editingProduct.description) {
        setFormDescManual(editingProduct.description);
        setDescMode("manual");
      } else {
        setFormDescManual("");
        setDescMode("guided");
        setFormPlatforms([]);
        setFormAppType("");
        setFormUsers("");
        setFormGoal("");
      }
    } else {
      setFormName("");
      setFormParentId(null);
      setFormDepartmentId(null);
      setFormDescManual("");
      setDescMode("guided");
      setFormPlatforms([]);
      setFormAppType("");
      setFormUsers("");
      setFormGoal("");
    }
  }, [isOpen, editingProduct]);

  const togglePlatform = (p: string) =>
    setFormPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const composedDescription =
    descMode === "guided"
      ? composeDescription(formPlatforms, formAppType, formUsers, formGoal)
      : formDescManual.trim() || null;

  const isValid = formName.trim().length > 0;

  return (
    <Modal
      title={editingProduct ? "Edit product" : "Add product"}
      open={isOpen}
      onClose={onClose}
      saving={saving}
      onSave={() => onSave({ name: formName.trim(), description: composedDescription, parentId: formParentId, departmentId: formDepartmentId })}
      saveLabel={editingProduct ? "Save changes" : "Add product"}
      className="max-h-[90vh]"
    >
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-content mb-1.5">
            Product name <span className="text-danger">*</span>
          </label>
          <Input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && isValid && !saving) {
                e.preventDefault();
                onSave({ name: formName.trim(), description: composedDescription, parentId: formParentId });
              }
            }}
            placeholder="e.g. iOS App, Admin Dashboard, API"
            autoFocus
          />
        </div>

        {descMode === "guided" && (
          <>
            <div>
              <label className="block text-sm font-medium text-content mb-1.5">
                Platform
                <span className="ml-1.5 text-xs font-normal text-content-subtle">select all that apply</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => (
                  <Chip key={p} selected={formPlatforms.includes(p)} onClick={() => togglePlatform(p)}>{p}</Chip>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-content mb-1.5">App type</label>
              <div className="flex flex-wrap gap-2">
                {APP_TYPES.map((t) => (
                  <Chip key={t} selected={formAppType === t} onClick={() => setFormAppType(formAppType === t ? "" : t)}>{t}</Chip>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-content mb-1.5">Who uses it?</label>
              <Input
                value={formUsers}
                onChange={(e) => setFormUsers(e.target.value)}
                placeholder="e.g. ~500 small business owners, 10,000+ end users"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-content">Main goal</label>
                {aiAvailable && (
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={improveGoal}
                    loading={improvingGoal}
                    disabled={improvingGoal || !formGoal.trim()}
                    title={!formGoal.trim() ? "Describe your product goal first — AI will sharpen it for you" : "Rewrite with AI for clarity and impact"}
                  >
                    ✦ Improve
                  </Button>
                )}
              </div>
              <Textarea
                value={formGoal}
                onChange={(e) => { setFormGoal(e.target.value); setImproveError(null); }}
                rows={3}
                placeholder="What is this product trying to achieve? e.g. Help small teams track projects, collaborate in real time, and ship faster."
              />
              {improveError && <p className="mt-1.5 text-xs text-danger">{improveError}</p>}
            </div>

            {composedDescription && (
              <div className="rounded-lg bg-surface-muted border border-border px-3 py-2.5">
                <p className="text-xs text-content-subtle mb-1 uppercase tracking-wide font-medium">AI will see</p>
                <p className="text-sm text-content">{composedDescription}</p>
              </div>
            )}
          </>
        )}

        {descMode === "manual" && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-content">Description</label>
              <button
                type="button"
                onClick={() => { setDescMode("guided"); setFormDescManual(""); setFormPlatforms([]); setFormAppType(""); setFormUsers(""); setFormGoal(""); }}
                className="text-xs text-content-subtle hover:text-content underline"
              >
                Use guided form instead
              </button>
            </div>
            <Textarea
              value={formDescManual}
              onChange={(e) => setFormDescManual(e.target.value)}
              rows={4}
              placeholder="Describe what this product does, who uses it, and its main goal."
            />
          </div>
        )}

        {flatProducts.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-content mb-1.5">
              Parent product
              <span className="ml-1.5 text-xs font-normal text-content-subtle">optional</span>
            </label>
            <Select value={formParentId || ""} onChange={(e) => setFormParentId(e.target.value || null)}>
              <option value="">None (top level)</option>
              {flatProducts.filter((p) => p.id !== editingProduct?.id).map((p) => (
                <option key={p.id} value={p.id}>{getProductPath(p, flatProducts)}</option>
              ))}
            </Select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-content mb-1.5">
            Managed by
            <span className="ml-1.5 text-xs font-normal text-content-subtle">optional</span>
          </label>
          {departments.length === 0 ? (
            <p className="text-sm text-content-subtle">No departments yet. Add them in <span className="font-medium">Settings → Company → Departments</span>.</p>
          ) : (
            <Select value={formDepartmentId || ""} onChange={(e) => setFormDepartmentId(e.target.value || null)}>
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Product card ───────────────────────────────────────────────────────────

function ProductCard({
  product,
  flatProducts,
  departments,
  isChild,
  onEdit,
  onDelete,
}: {
  product: Product;
  flatProducts: Product[];
  departments: Department[];
  isChild?: boolean;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
}) {
  const parentName =
    !isChild && product.parentId
      ? flatProducts.find((p) => p.id === product.parentId)?.name ?? null
      : null;
  const departmentName = product.departmentId
    ? departments.find((d) => d.id === product.departmentId)?.name ?? null
    : null;

  return (
    <div className="group flex items-start justify-between gap-3 p-4 border border-border rounded-lg hover:border-border-strong transition-colors">
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-semibold text-content">{product.name}</p>
        {product.description ? (
          <p className="text-xs text-content-muted line-clamp-2">{product.description}</p>
        ) : (
          <p className="text-xs text-warning flex items-center gap-1">
            <ExclamationTriangleIcon className="h-3.5 w-3.5 flex-shrink-0" />
            No description — add one to improve AI grouping
          </p>
        )}
        {(parentName || departmentName) && (
          <div className="flex items-center gap-2 text-xs text-content-subtle">
            {parentName && <span>Parent: {parentName}</span>}
            {parentName && departmentName && <span>·</span>}
            {departmentName && <span>Managed by {departmentName}</span>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" onClick={() => onEdit(product)} title="Edit product">
          <PencilIcon className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(product)} title="Delete product" className="hover:text-danger hover:bg-danger-bg">
          <TrashIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Main reusable component ────────────────────────────────────────────────

export function ProductsSettings() {
  const [products, setProducts] = useState<Product[]>([]);
  const [flatProducts, setFlatProducts] = useState<Product[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    Promise.all([
      fetch("/api/products").then(async (r) => { if (!r.ok) throw new Error(`Server returned ${r.status}`); return r.json(); }),
      fetch("/api/departments").then((r) => r.ok ? r.json() : { departments: [] }),
    ])
      .then(([prodData, deptData]) => {
        setProducts(prodData.tree || []);
        setFlatProducts(prodData.flat || []);
        setDepartments(deptData.departments || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function openEdit(product: Product) { setEditingProduct(product); setModalOpen(true); }

  async function handleSave({ name, description, parentId, departmentId }: { name: string; description: string | null; parentId: string | null; departmentId: string | null }) {
    if (!name) return;
    setSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: editingProduct ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingProduct ? { id: editingProduct.id, name, description, parentId, departmentId } : { name, description, parentId, departmentId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to save product");
        return;
      }
      setModalOpen(false);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(product: Product) {
    const hasChildren = flatProducts.some((p) => p.parentId === product.id);
    let message = `Delete "${product.name}"?`;
    if (hasChildren) message += "\n\nThis product has child products — delete or reassign them first.";
    else if (product.feedbackCount > 0) message += `\n\n${product.feedbackCount} feedback items will become unassigned.`;
    if (!confirm(message)) return;
    try {
      const res = await fetch(`/api/products?id=${encodeURIComponent(product.id)}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to delete product");
        return;
      }
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete product");
    }
  }

  function renderTree(items: Product[], isChild = false): React.ReactNode {
    return items.map((product) => (
      <div key={product.id}>
        <ProductCard
          product={product}
          flatProducts={flatProducts}
          departments={departments}
          isChild={isChild}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
        {product.children && product.children.length > 0 && (
          <div className="mt-2 ml-4 pl-4 border-l-2 border-border space-y-2">
            {renderTree(product.children, true)}
          </div>
        )}
      </div>
    ));
  }

  if (loading) return <p className="text-sm text-content-muted">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-content-muted">Organise your feedback by product. Descriptions help AI assign feedback to the right product.</p>
        <Button
          type="button"
          size="sm"
          className="flex-shrink-0"
          onClick={() => { setEditingProduct(null); setModalOpen(true); }}
        >
          Add product
        </Button>
      </div>

      <div className="space-y-2">
        {products.length === 0 ? (
          <EmptyState
            message="No products yet."
            action={
              <Button variant="secondary" size="sm" onClick={() => { setEditingProduct(null); setModalOpen(true); }}>
                Add your first product
              </Button>
            }
          />
        ) : (
          renderTree(products)
        )}
      </div>

      <ProductModal isOpen={modalOpen} editingProduct={editingProduct} flatProducts={flatProducts}
        departments={departments} saving={saving} onSave={handleSave} onClose={() => setModalOpen(false)} />
    </div>
  );
}
