"use client";

import { useEffect, useState } from "react";
import {
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

interface Product {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  feedbackCount: number;
  importCount: number;
  createdAt: string;
  children?: Product[];
}

const PLATFORMS = ["Web", "Mobile (iOS)", "Mobile (Android)", "Desktop", "API / Backend"];
const APP_TYPES = ["B2C", "B2B", "Internal tool", "Developer tool", "Other"];

// ── Compose description from guided fields ────────────────────────────────
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

// ── Add/Edit Modal ────────────────────────────────────────────────────────
function ProductModal({
  isOpen,
  editingProduct,
  flatProducts,
  saving,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  editingProduct: Product | null;
  flatProducts: Product[];
  saving: boolean;
  onSave: (data: {
    name: string;
    description: string | null;
    parentId: string | null;
  }) => void;
  onClose: () => void;
}) {
  const [formName, setFormName] = useState("");
  const [formParentId, setFormParentId] = useState<string | null>(null);

  // Description mode: "guided" | "manual"
  const [descMode, setDescMode] = useState<"guided" | "manual">("guided");
  const [formPlatforms, setFormPlatforms] = useState<string[]>([]);
  const [formAppType, setFormAppType] = useState("");
  const [formUsers, setFormUsers] = useState("");
  const [formGoal, setFormGoal] = useState("");
  const [formDescManual, setFormDescManual] = useState("");
  const [improvingGoal, setImprovingGoal] = useState(false);
  const [improveError, setImproveError] = useState<string | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);

  // Check if AI key is configured (once on mount)
  useEffect(() => {
    fetch("/api/settings/ai")
      .then((r) => r.ok ? r.json() : null)
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

  // Populate form when modal opens
  useEffect(() => {
    if (!isOpen) return;
    if (editingProduct) {
      setFormName(editingProduct.name);
      setFormParentId(editingProduct.parentId);
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
      setFormDescManual("");
      setDescMode("guided");
      setFormPlatforms([]);
      setFormAppType("");
      setFormUsers("");
      setFormGoal("");
    }
  }, [isOpen, editingProduct]);

  if (!isOpen) return null;

  const togglePlatform = (p: string) => {
    setFormPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const composedDescription =
    descMode === "guided"
      ? composeDescription(formPlatforms, formAppType, formUsers, formGoal)
      : formDescManual.trim() || null;

  const isValid = formName.trim().length > 0;

  function getProductPath(product: Product, flat: Product[]): string {
    const path: string[] = [];
    let current: Product | undefined = product;
    while (current) {
      path.unshift(current.name);
      current = current.parentId ? flat.find((p) => p.id === current!.parentId) : undefined;
    }
    return path.join(" › ");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black bg-opacity-40" onClick={saving ? undefined : onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            {editingProduct ? "Edit product" : "Add product"}
          </h2>
          <button onClick={onClose} disabled={saving} className="text-gray-400 hover:text-gray-500 disabled:opacity-40">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Product name <span className="text-red-500">*</span>
            </label>
            <input
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {/* Platform */}
          {descMode === "guided" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Platform
                  <span className="ml-1.5 text-xs font-normal text-gray-400">select all that apply</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                        formPlatforms.includes(p)
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* App type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">App type</label>
                <div className="flex flex-wrap gap-2">
                  {APP_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormAppType(formAppType === t ? "" : t)}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                        formAppType === t
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Users */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Who uses it?</label>
                <input
                  value={formUsers}
                  onChange={(e) => setFormUsers(e.target.value)}
                  placeholder="e.g. ~500 small business owners, 10,000+ end users"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              {/* Goal */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-700">Main goal</label>
                  {aiAvailable && (
                    <button
                      type="button"
                      onClick={improveGoal}
                      disabled={improvingGoal || !formGoal.trim()}
                      title={!formGoal.trim() ? "Describe your product goal first — AI will sharpen it for you" : "Rewrite with AI for clarity and impact"}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium border border-gray-300 rounded-md bg-white text-gray-600 hover:border-gray-400 hover:text-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {improvingGoal ? (
                        <>
                          <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                          Improving…
                        </>
                      ) : (
                        <>✦ Improve</>
                      )}
                    </button>
                  )}
                </div>
                <div>
                  <textarea
                    value={formGoal}
                    onChange={(e) => { setFormGoal(e.target.value); setImproveError(null); }}
                    rows={3}
                    placeholder="What is this product trying to achieve? e.g. Help small teams track projects, collaborate in real time, and ship faster."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                  />
                </div>
                {improveError && (
                  <p className="mt-1.5 text-xs text-red-600">{improveError}</p>
                )}
              </div>

              {/* Preview */}
              {composedDescription && (
                <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5">
                  <p className="text-xs text-gray-400 mb-1 uppercase tracking-wide font-medium">AI will see</p>
                  <p className="text-sm text-gray-700">{composedDescription}</p>
                </div>
              )}
            </>
          )}

          {/* Manual description mode */}
          {descMode === "manual" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <button
                  type="button"
                  onClick={() => {
                    setDescMode("guided");
                    setFormDescManual("");
                    setFormPlatforms([]);
                    setFormAppType("");
                    setFormUsers("");
                    setFormGoal("");
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Use guided form instead
                </button>
              </div>
              <textarea
                value={formDescManual}
                onChange={(e) => setFormDescManual(e.target.value)}
                rows={4}
                placeholder="Describe what this product does, who uses it, and its main goal."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              />
            </div>
          )}

          {/* Parent product */}
          {flatProducts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Parent product
                <span className="ml-1.5 text-xs font-normal text-gray-400">optional</span>
              </label>
              <select
                value={formParentId || ""}
                onChange={(e) => setFormParentId(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">None (top level)</option>
                {flatProducts
                  .filter((p) => p.id !== editingProduct?.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {getProductPath(p, flatProducts)}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({ name: formName.trim(), description: composedDescription, parentId: formParentId })
            }
            disabled={!isValid || saving}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : editingProduct ? "Save changes" : "Add product"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Product card (read-only) ──────────────────────────────────────────────
function ProductCard({
  product,
  flatProducts,
  onEdit,
  onDelete,
}: {
  product: Product;
  flatProducts: Product[];
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
}) {
  function getParentName(): string | null {
    if (!product.parentId) return null;
    const parent = flatProducts.find((p) => p.id === product.parentId);
    return parent?.name ?? null;
  }

  const parentName = getParentName();

  return (
    <div className="group flex items-start justify-between gap-3 p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-semibold text-gray-900">{product.name}</p>
        {product.description ? (
          <p className="text-xs text-gray-500 line-clamp-2">{product.description}</p>
        ) : (
          <p className="text-xs text-amber-500 flex items-center gap-1">
            <ExclamationTriangleIcon className="h-3.5 w-3.5 flex-shrink-0" />
            No description — add one to improve AI grouping
          </p>
        )}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {parentName && <span>Parent: {parentName}</span>}
          {parentName && <span>·</span>}
          <span>{product.feedbackCount} {product.feedbackCount === 1 ? "feedback item" : "feedback items"}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(product)}
          className="p-1.5 text-gray-400 hover:text-gray-700 rounded"
          title="Edit product"
        >
          <PencilIcon className="h-4 w-4" />
        </button>
        <button
          onClick={() => onDelete(product)}
          className="p-1.5 text-gray-400 hover:text-red-500 rounded"
          title="Delete product"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function ProductsSettingsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [flatProducts, setFlatProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    fetch("/api/products")
      .then(async (r) => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setProducts(data.tree || []);
        setFlatProducts(data.flat || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditingProduct(null);
    setModalOpen(true);
  }

  function openEdit(product: Product) {
    setEditingProduct(product);
    setModalOpen(true);
  }

  async function handleSave({
    name,
    description,
    parentId,
  }: {
    name: string;
    description: string | null;
    parentId: string | null;
  }) {
    if (!name) return;
    setSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: editingProduct ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingProduct
            ? { id: editingProduct.id, name, description, parentId }
            : { name, description, parentId }
        ),
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
    if (hasChildren) {
      message += "\n\nThis product has child products — delete or reassign them first.";
    } else if (product.feedbackCount > 0) {
      message += `\n\n${product.feedbackCount} feedback items will become unassigned.`;
    }
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

  // Recursively render product tree
  function renderTree(items: Product[], level = 0): React.ReactNode {
    return items.map((product) => (
      <div key={product.id} style={{ marginLeft: level > 0 ? `${level * 20}px` : undefined }}>
        {level > 0 && (
          <div className="relative">
            <div className="absolute -left-4 top-0 bottom-0 w-px bg-gray-200" />
          </div>
        )}
        <ProductCard
          product={product}
          flatProducts={flatProducts}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
        {product.children && product.children.length > 0 && (
          <div className="mt-2 space-y-2 pl-5 border-l border-gray-200">
            {product.children.map((child) => (
              <div key={child.id}>
                <ProductCard
                  product={child}
                  flatProducts={flatProducts}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
                {child.children && child.children.length > 0 && (
                  <div className="mt-2 space-y-2 pl-5 border-l border-gray-200">
                    {renderTree(child.children, level + 2)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    ));
  }

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900">Product Portfolio</h1>
          <p className="text-sm text-gray-500 mt-1">
            Organise your feedback by product. Descriptions help AI assign feedback to the right product.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="flex-shrink-0 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
        >
          Add product
        </button>
      </div>

      {/* Product list */}
      <div className="space-y-2">
        {products.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-gray-200 rounded-lg">
            <p className="text-sm text-gray-500">No products yet.</p>
            <button
              onClick={openAdd}
              className="mt-2 text-sm text-gray-900 font-medium hover:underline"
            >
              Add your first product →
            </button>
          </div>
        ) : (
          renderTree(products)
        )}
      </div>

      {/* Modal */}
      <ProductModal
        isOpen={modalOpen}
        editingProduct={editingProduct}
        flatProducts={flatProducts}
        saving={saving}
        onSave={handleSave}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
