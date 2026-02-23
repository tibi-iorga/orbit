"use client";

import { useState, useCallback, useEffect } from "react";
import Papa from "papaparse";
import { useRouter } from "next/navigation";
import { invalidateFeedbackListCache } from "@/lib/cache";

interface Product {
  id: string;
  name: string;
}

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ─── Main modal ──────────────────────────────────────────────────────────────

export function ImportModal({ isOpen, onClose }: ImportModalProps) {
  const router = useRouter();

  // Shared state
  const [activeTab, setActiveTab] = useState<"csv" | "manual">("csv");
  const [products, setProducts] = useState<Product[]>([]);

  // CSV tab state
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [titleColumn, setTitleColumn] = useState<string>("");
  const [descriptionColumn, setDescriptionColumn] = useState<string>("");
  const [dateColumn, setDateColumn] = useState<string>("");
  const [csvProductId, setCsvProductId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [csvError, setCsvError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  // Manual tab state
  const [manualTitle, setManualTitle] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualProductId, setManualProductId] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState("");

  // Load products and reset on open/close
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
      // Reset all state when modal closes
      setActiveTab("csv");
      // CSV
      setFile(null);
      setHeaders([]);
      setRows([]);
      setTitleColumn("");
      setDescriptionColumn("");
      setDateColumn("");
      setCsvProductId("");
      setUploading(false);
      setCsvError("");
      setWarnings([]);
      // Manual
      setManualTitle("");
      setManualDescription("");
      setManualProductId("");
      setManualSubmitting(false);
      setManualError("");
    }
  }, [isOpen]);

  // CSV warnings recalculation
  useEffect(() => {
    if (rows.length === 0 || !titleColumn) {
      setWarnings([]);
      return;
    }
    const warningsList: string[] = [];
    const emptyTitleCount = rows.filter((row) => !row[titleColumn]?.trim()).length;
    if (emptyTitleCount > 0) {
      warningsList.push(
        `${emptyTitleCount} row${emptyTitleCount === 1 ? "" : "s"} will be skipped due to empty feedback column.`
      );
    }
    if (rows.length - emptyTitleCount === 0) {
      warningsList.push(
        "No rows will be imported. The selected feedback column is empty for all rows."
      );
    }
    setWarnings(warningsList);
  }, [rows, titleColumn]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setCsvError("");
    setWarnings([]);
    if (!f) return;
    if (!f.name.endsWith(".csv")) {
      setCsvError("Please select a CSV file.");
      return;
    }
    setFile(f);
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const data = res.data as Record<string, string>[];
        if (data.length === 0) {
          setCsvError("No rows found in CSV.");
          setHeaders([]);
          setRows([]);
          return;
        }
        const h = Object.keys(data[0]);
        if (h.length === 0) {
          setCsvError("CSV file has no columns.");
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
        setCsvError(`Failed to parse CSV: ${err.message}`);
        setHeaders([]);
        setRows([]);
      },
    });
  }, []);

  async function handleCsvSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !titleColumn) return;

    const validRows = rows.filter((row) => row[titleColumn]?.trim());
    if (validRows.length === 0) {
      setCsvError("No valid rows to import. The selected feedback column is empty for all rows.");
      return;
    }

    setUploading(true);
    setCsvError("");
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          rows: validRows,
          titleColumn,
          descriptionColumn: descriptionColumn || null,
          dateColumn: dateColumn || null,
          productId: csvProductId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      // Reset CSV state
      setFile(null);
      setHeaders([]);
      setRows([]);
      setTitleColumn("");
      setDescriptionColumn("");
      setDateColumn("");
      setCsvProductId("");

      invalidateFeedbackListCache();
      window.dispatchEvent(new CustomEvent("feedback-imported"));
      onClose();
      router.push("/feedback");
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualTitle.trim()) return;
    setManualSubmitting(true);
    setManualError("");
    try {
      const res = await fetch("/api/feedback/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: manualTitle.trim(),
          description: manualDescription.trim() || null,
          productId: manualProductId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add feedback");

      // Reset manual state
      setManualTitle("");
      setManualDescription("");
      setManualProductId("");

      invalidateFeedbackListCache();
      window.dispatchEvent(new CustomEvent("feedback-imported"));
      onClose();
      router.push("/feedback");
    } catch (err) {
      setManualError(err instanceof Error ? err.message : "Failed to add feedback");
    } finally {
      setManualSubmitting(false);
    }
  }

  const previewRows = rows.slice(0, 1);
  const validRowCount = rows.filter((row) => row[titleColumn]?.trim()).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
        <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white z-10">
            <div className="px-6 pt-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900 pb-3">Add feedback</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 pb-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Tab bar */}
            <div className="px-6 border-b border-gray-200">
              <nav className="-mb-px flex gap-6">
                <button
                  type="button"
                  onClick={() => setActiveTab("csv")}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === "csv"
                      ? "border-gray-900 text-gray-900"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Import CSV
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("manual")}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === "manual"
                      ? "border-gray-900 text-gray-900"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Add manually
                </button>
              </nav>
            </div>
          </div>

          {/* Tab content */}
          <div className="p-6">
            {/* ── CSV tab ── */}
            {activeTab === "csv" && (
              <form onSubmit={handleCsvSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CSV file</label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={onFileChange}
                    className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-gray-900 file:text-white file:font-medium file:cursor-pointer hover:file:bg-gray-800"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Product (optional)
                  </label>
                  <select
                    value={csvProductId}
                    onChange={(e) => setCsvProductId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  >
                    <option value="">Unassigned</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {headers.length > 0 && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Column preview
                      </label>
                      <div className="border border-gray-200 rounded overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-gray-900">
                                Column
                              </th>
                              <th className="px-3 py-2 text-left font-medium text-gray-700">
                                Sample value
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {headers.map((header) => (
                              <tr key={header}>
                                <td className="px-3 py-2 font-medium text-gray-900">{header}</td>
                                {previewRows.map((row, idx) => (
                                  <td
                                    key={idx}
                                    className="px-3 py-2 text-gray-600 max-w-xs truncate"
                                    title={row[header] || ""}
                                  >
                                    {row[header] || <span className="text-gray-400">—</span>}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Showing first row as preview
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Feedback column
                      </label>
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
                      <p className="text-xs text-gray-500 mt-1">
                        Select the column containing feedback text
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Additional description column (optional)
                      </label>
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
                      <p className="text-xs text-gray-500 mt-1">
                        Optional: If your CSV has separate title and description columns, map the
                        description here
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Date column (optional)
                      </label>
                      <select
                        value={dateColumn}
                        onChange={(e) => setDateColumn(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      >
                        <option value="">None — use import date</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Map to a date column to preserve the original feedback date (e.g. "Created", "Submitted at").
                        Rows with unrecognised dates will use the import date.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm text-gray-700">
                        <strong>{validRowCount}</strong> of <strong>{rows.length}</strong> rows will
                        be imported
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

                {csvError && <p className="text-sm text-red-600">{csvError}</p>}
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
            )}

            {/* ── Manual tab ── */}
            {activeTab === "manual" && (
              <form onSubmit={handleManualSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Feedback title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    placeholder="Describe the feature request or feedback"
                    required
                    autoFocus
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description (optional)
                  </label>
                  <textarea
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                    rows={4}
                    placeholder="Additional context or detail"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Product (optional)
                  </label>
                  <select
                    value={manualProductId}
                    onChange={(e) => setManualProductId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  >
                    <option value="">Unassigned</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {manualError && <p className="text-sm text-red-600">{manualError}</p>}

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
                    disabled={!manualTitle.trim() || manualSubmitting}
                    className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded hover:bg-gray-800 disabled:opacity-50"
                  >
                    {manualSubmitting ? "Adding…" : "Add feedback"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
