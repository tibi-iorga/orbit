"use client";

import { useEffect, useState } from "react";

interface Product {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  featureCount: number;
  importCount: number;
  createdAt: string;
  children?: Product[];
}

export default function ProductsSettingsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [flatProducts, setFlatProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newParentId, setNewParentId] = useState<string | null>(null);

  function load() {
    fetch("/api/products")
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || `Server returned ${r.status}`);
        }
        return r.json();
      })
      .then((data) => {
        setProducts(data.tree || []);
        setFlatProducts(data.flat || []);
      })
      .catch((err) => {
        console.error("Error loading products:", err);
        setProducts([]);
        setFlatProducts([]);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function update(id: string, patch: Partial<Product>) {
    try {
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.error || "Failed to update product");
        return;
      }
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update product");
    }
  }

  async function add() {
    if (!newName.trim()) return;
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || null,
          parentId: newParentId || null,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        let errorMessage = "Failed to create product";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        alert(errorMessage);
        return;
      }

      const data = await res.json();
      setNewName("");
      setNewDescription("");
      setNewParentId(null);
      setShowAddForm(false);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create product");
    }
  }

  async function remove(id: string) {
    const product = flatProducts.find((p) => p.id === id);
    if (!product) return;
    const hasChildren = flatProducts.some((p) => p.parentId === id);
    let message = `Delete "${product.name}"?`;
    if (hasChildren) {
      message += " This product has child products. Delete or reassign them first.";
    } else if (product.featureCount > 0) {
      message += ` This will remove ${product.featureCount} features and ${product.importCount} imports.`;
    }
    if (!confirm(message)) return;
    try {
      const res = await fetch(`/api/products?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.error || "Failed to delete product");
        return;
      }
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete product");
    }
  }

  function getProductPath(product: Product, flat: Product[]): string {
    const path: string[] = [];
    let current: Product | undefined = product;
    while (current) {
      path.unshift(current.name);
      if (current.parentId) {
        current = flat.find((p) => p.id === current!.parentId);
      } else {
        break;
      }
    }
    return path.join(" > ");
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;

  function ProductItem({
    product,
    flatProducts,
    onUpdate,
    onDelete,
    getProductPath,
    level,
  }: {
    product: Product;
    flatProducts: Product[];
    onUpdate: (id: string, patch: Partial<Product>) => void;
    onDelete: (id: string) => void;
    getProductPath: (p: Product, flat: Product[]) => string;
    level: number;
  }) {
    const [editingParentId, setEditingParentId] = useState<string | null | undefined>(undefined);

    return (
      <div className="space-y-2">
        <div
          className="p-4 border border-gray-200 rounded space-y-2"
          style={{ marginLeft: `${level * 24}px` }}
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 space-y-1">
              <input
                value={product.name}
                onChange={(e) => onUpdate(product.id, { name: e.target.value })}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== product.name) onUpdate(product.id, { name: v });
                }}
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm font-medium"
              />
              <input
                value={product.description || ""}
                onChange={(e) => onUpdate(product.id, { description: e.target.value })}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (product.description || "")) onUpdate(product.id, { description: v || null });
                }}
                placeholder="Optional description"
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Parent:</span>
                {editingParentId === undefined ? (
                  <>
                    <span className="text-xs text-gray-600">
                      {product.parentId
                        ? getProductPath(
                            flatProducts.find((p) => p.id === product.parentId)!,
                            flatProducts
                          )
                        : "None"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingParentId(product.parentId)}
                      className="text-xs text-gray-600 hover:underline"
                    >
                      Change
                    </button>
                  </>
                ) : (
                  <>
                    <select
                      value={editingParentId || ""}
                      onChange={(e) => {
                        const newParentId = e.target.value || null;
                        if (newParentId !== product.parentId) {
                          onUpdate(product.id, { parentId: newParentId });
                        }
                        setEditingParentId(undefined);
                      }}
                      onBlur={() => setEditingParentId(undefined)}
                      autoFocus
                      className="px-2 py-1 border border-gray-300 rounded text-xs"
                    >
                      <option value="">None</option>
                      {flatProducts
                        .filter((p) => p.id !== product.id)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {getProductPath(p, flatProducts)}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setEditingParentId(undefined)}
                      className="text-xs text-gray-500"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDelete(product.id)}
              className="text-sm text-red-600 hover:underline whitespace-nowrap"
            >
              Delete
            </button>
          </div>
          <div className="text-xs text-gray-500">
            {product.featureCount} {product.featureCount === 1 ? "feature" : "features"} • {product.importCount}{" "}
            {product.importCount === 1 ? "import" : "imports"}
          </div>
        </div>
        {product.children && product.children.length > 0 && (
          <div>
            {product.children.map((child) => (
              <ProductItem
                key={child.id}
                product={child}
                flatProducts={flatProducts}
                onUpdate={onUpdate}
                onDelete={onDelete}
                getProductPath={getProductPath}
                level={level + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Product Portfolio</h1>
          <p className="text-sm text-gray-600 mt-1">
            Organize your imports and features by product. Create products before importing to keep your data organized.
          </p>
        </div>
        {!showAddForm && (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded hover:bg-gray-800"
          >
            Add product
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="p-4 border border-gray-200 rounded space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                } else if (e.key === "Escape") {
                  setShowAddForm(false);
                  setNewName("");
                  setNewDescription("");
                }
              }}
              placeholder="Product name"
              autoFocus
              className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="Optional description"
              className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Parent Product (optional)</label>
            <select
              value={newParentId || ""}
              onChange={(e) => setNewParentId(e.target.value || null)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm"
            >
              <option value="">None (top level)</option>
              {flatProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {getProductPath(p, flatProducts)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={add}
              disabled={!newName.trim()}
              className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded hover:bg-gray-800 disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setNewName("");
                setNewDescription("");
              }}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {products.length === 0 ? (
          <p className="text-sm text-gray-500">No products yet. Create one to get started.</p>
        ) : (
          products.map((p) => (
            <ProductItem
              key={p.id}
              product={p}
              flatProducts={flatProducts}
              onUpdate={update}
              onDelete={remove}
              getProductPath={getProductPath}
              level={0}
            />
          ))
        )}
      </div>
    </div>
  );
}
