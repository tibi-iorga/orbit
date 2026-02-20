"use client";

import { useEffect, useState } from "react";

interface Product {
  id: string;
  name: string;
  description: string | null;
  featureCount: number;
  importCount: number;
  createdAt: string;
}

export default function ProductsSettingsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  function load() {
    fetch("/api/products")
      .then(async (r) => {
        if (!r.ok) {
          const errorText = await r.text();
          throw new Error(errorText || "Failed to load products");
        }
        return r.json();
      })
      .then(setProducts)
      .catch((err) => {
        console.error("Error loading products:", err);
        setProducts([]);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function update(id: string, patch: Partial<Product>) {
    await fetch("/api/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    load();
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
      setShowAddForm(false);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create product");
    }
  }

  async function remove(id: string) {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    const message =
      product.featureCount > 0
        ? `Delete "${product.name}"? This will remove ${product.featureCount} features and ${product.importCount} imports.`
        : `Delete "${product.name}"?`;
    if (!confirm(message)) return;
    await fetch(`/api/products?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">
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
            <div
              key={p.id}
              className="p-4 border border-gray-200 rounded space-y-2"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-1">
                  <input
                    value={p.name}
                    onChange={(e) => update(p.id, { name: e.target.value })}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== p.name) update(p.id, { name: v });
                    }}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm font-medium"
                  />
                  <input
                    value={p.description || ""}
                    onChange={(e) => update(p.id, { description: e.target.value })}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (p.description || "")) update(p.id, { description: v || null });
                    }}
                    placeholder="Optional description"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className="text-sm text-red-600 hover:underline whitespace-nowrap"
                >
                  Delete
                </button>
              </div>
              <div className="text-xs text-gray-500">
                {p.featureCount} {p.featureCount === 1 ? "feature" : "features"} • {p.importCount}{" "}
                {p.importCount === 1 ? "import" : "imports"}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
