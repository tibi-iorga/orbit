"use client";

import { useState, useCallback, useEffect } from "react";
import Papa from "papaparse";
import { useRouter } from "next/navigation";

interface Product {
  id: string;
  name: string;
}

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ImportModal({ isOpen, onClose }: ImportModalProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [titleColumn, setTitleColumn] = useState<string>("");
  const [descriptionColumn, setDescriptionColumn] = useState<string>("");
  const [productId, setProductId] = useState<string>("");
  const [products, setProducts] = useState<Product[]>([]);
  const [showNewProductForm, setShowNewProductForm] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetch("/api/products")
        .then(async (r) => {
          if (!r.ok) return { flat: [] };
          return r.json();
        })
        .then((data) => setProducts(data?.flat || []))
        .catch(() => {});
    } else {
      // Reset form when modal closes
      setFile(null);
      setHeaders([]);
      setRows([]);
      setTitleColumn("");
      setDescriptionColumn("");
      setProductId("");
      setShowNewProductForm(false);
      setNewProductName("");
      setError("");
      setWarnings([]);
    }
  }, [isOpen]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setError("");
    setWarnings([]);
    if (!f) return;
    if (!f.name.endsWith(".csv")) {
      setError("Please select a CSV file.");
      return;
    }
    setFile(f);
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const data = res.data as Record<string, string>[];
        if (data.length === 0) {
          setError("No rows found in CSV.");
          setHeaders([]);
          setRows([]);
          return;
        }
        const h = Object.keys(data[0]);
        if (h.length === 0) {
          setError("CSV file has no columns.");
          setHeaders([]);
          setRows([]);
          return;
        }
        setHeaders(h);
        setRows(data);
        setTitleColumn(h[0] ?? "");
        setDescriptionColumn(h.length > 1 ? h[1] : "");
      },
      error: (err) => {
        setError(`Failed to parse CSV: ${err.message}`);
        setHeaders([]);
        setRows([]);
      },
    });
  }, []);

  useEffect(() => {
    if (rows.length === 0 || !titleColumn) {
      setWarnings([]);
      return;
    }

    const warningsList: string[] = [];
    const emptyTitleCount = rows.filter((row) => !row[titleColumn]?.trim()).length;
    if (emptyTitleCount > 0) {
      warningsList.push(`${emptyTitleCount} row${emptyTitleCount === 1 ? "" : "s"} will be skipped due to empty feedback column.`);
    }
    if (rows.length - emptyTitleCount === 0) {
      warningsList.push("No rows will be imported. The selected feedback column is empty for all rows.");
    }

    setWarnings(warningsList);
  }, [rows, titleColumn]);

  async function createProduct() {
    if (!newProductName.trim()) return;
    setError("");
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProductName.trim() }),
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
        setError(errorMessage);
        return;
      }

      const data = await res.json();
      setProducts((prev) => [...prev, data]);
      setProductId(data.id);
      setShowNewProductForm(false);
      setNewProductName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create product");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !titleColumn) return;

    const validRows = rows.filter((row) => row[titleColumn]?.trim());
    if (validRows.length === 0) {
      setError("No valid rows to import. The selected feedback column is empty for all rows.");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          rows: validRows,
          titleColumn,
          descriptionColumn: descriptionColumn || null,
          productId: productId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      
      // Reset form
      setFile(null);
      setHeaders([]);
      setRows([]);
      setTitleColumn("");
      setDescriptionColumn("");
      setProductId("");
      setShowNewProductForm(false);
      setNewProductName("");
      
      onClose();
      router.push("/feedback");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setUploading(false);
    }
  }

  const previewRows = rows.slice(0, 5);
  const validRowCount = rows.filter((row) => row[titleColumn]?.trim()).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
        <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Import CSV</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product (optional)</label>
                <div className="space-y-2">
                  <select
                    value={productId}
                    onChange={(e) => {
                      setProductId(e.target.value);
                      setShowNewProductForm(false);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  >
                    <option value="">Unassigned</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {!showNewProductForm ? (
                    <button
                      type="button"
                      onClick={() => setShowNewProductForm(true)}
                      className="text-sm text-gray-600 hover:text-gray-900"
                    >
                      + Create new product
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newProductName}
                        onChange={(e) => setNewProductName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            createProduct();
                          } else if (e.key === "Escape") {
                            setShowNewProductForm(false);
                            setNewProductName("");
                          }
                        }}
                        placeholder="Product name"
                        autoFocus
                        className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                      />
                      <button
                        type="button"
                        onClick={createProduct}
                        disabled={!newProductName.trim()}
                        className="px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded hover:bg-gray-800 disabled:opacity-50"
                      >
                        Create
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewProductForm(false);
                          setNewProductName("");
                        }}
                        className="px-3 py-2 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CSV file</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={onFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-gray-100 file:text-gray-700"
                />
              </div>

              {headers.length > 0 && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Column preview</label>
                    <div className="border border-gray-200 rounded overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-900">Column</th>
                            {previewRows.map((_, idx) => (
                              <th key={idx} className="px-3 py-2 text-left font-medium text-gray-700">
                                Row {idx + 1}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {headers.map((header) => (
                            <tr key={header}>
                              <td className="px-3 py-2 font-medium text-gray-900">{header}</td>
                              {previewRows.map((row, idx) => (
                                <td key={idx} className="px-3 py-2 text-gray-600 max-w-xs truncate" title={row[header] || ""}>
                                  {row[header] || <span className="text-gray-400">—</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Showing first {previewRows.length} rows</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Feedback column</label>
                    <select
                      value={titleColumn}
                      onChange={(e) => setTitleColumn(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    >
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Select the column containing feedback text</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Additional description column (optional)</label>
                    <select
                      value={descriptionColumn}
                      onChange={(e) => setDescriptionColumn(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    >
                      <option value="">None</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Optional: If your CSV has separate title and description columns, map the description here</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-gray-700">
                      <strong>{validRowCount}</strong> of <strong>{rows.length}</strong> rows will be imported
                    </p>
                    {warnings.length > 0 && (
                      <div className="space-y-1">
                        {warnings.map((warning, idx) => (
                          <p key={idx} className="text-sm text-amber-600">
                            ⚠ {warning}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!file || !titleColumn || uploading || validRowCount === 0}
                  className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded hover:bg-gray-800 disabled:opacity-50"
                >
                  {uploading ? "Importing…" : "Import"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
