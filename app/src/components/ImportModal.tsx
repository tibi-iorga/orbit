"use client";

import { useState, useCallback, useEffect } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { useRouter } from "next/navigation";
import { invalidateFeedbackListCache } from "@/lib/cache";
import { Button, Input, Textarea, Select } from "@/components/ui";

interface Product {
  id: string;
  name: string;
}

interface SuggestedFeedbackItem {
  id: string;
  title: string;
  description: string;
  selected: boolean;
}

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ImportModal({ isOpen, onClose }: ImportModalProps) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"file" | "freeText" | "manual">("file");
  const [products, setProducts] = useState<Product[]>([]);

  // File import state
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [titleColumn, setTitleColumn] = useState<string>("");
  const [descriptionColumn, setDescriptionColumn] = useState<string>("");
  const [dateColumn, setDateColumn] = useState<string>("");
  const [fileProductId, setFileProductId] = useState<string>("");
  const [fileUploading, setFileUploading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [fileWarnings, setFileWarnings] = useState<string[]>([]);

  // Free text + AI extraction state
  const [freeTextInput, setFreeTextInput] = useState("");
  const [freeTextProductId, setFreeTextProductId] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestedFeedbackItem[]>([]);
  const [importingSuggestions, setImportingSuggestions] = useState(false);
  const [importSuggestionsError, setImportSuggestionsError] = useState("");

  // Manual tab state
  const [manualTitle, setManualTitle] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualProductId, setManualProductId] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetch("/api/products")
        .then(async (r) => {
          if (!r.ok) return { flat: [] };
          return r.json();
        })
        .then((data) => setProducts(data?.flat || []))
        .catch(() => {});
      return;
    }

    setActiveTab("file");

    setFile(null);
    setHeaders([]);
    setRows([]);
    setTitleColumn("");
    setDescriptionColumn("");
    setDateColumn("");
    setFileProductId("");
    setFileUploading(false);
    setFileError("");
    setFileWarnings([]);

    setFreeTextInput("");
    setFreeTextProductId("");
    setExtracting(false);
    setExtractError("");
    setSuggestions([]);
    setImportingSuggestions(false);
    setImportSuggestionsError("");

    setManualTitle("");
    setManualDescription("");
    setManualProductId("");
    setManualSubmitting(false);
    setManualError("");
  }, [isOpen]);

  useEffect(() => {
    if (rows.length === 0 || !titleColumn) {
      setFileWarnings([]);
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
      warningsList.push("No rows will be imported. The selected feedback column is empty for all rows.");
    }
    setFileWarnings(warningsList);
  }, [rows, titleColumn]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFileError("");
    setFileWarnings([]);
    if (!f) return;

    const lower = f.name.toLowerCase();
    const isCsv = lower.endsWith(".csv");
    const isTsv = lower.endsWith(".tsv");
    const isXlsx = lower.endsWith(".xlsx");
    if (!isCsv && !isTsv && !isXlsx) {
      setFileError("Please select a CSV, TSV, or XLSX file.");
      return;
    }

    setFile(f);

    if (isXlsx) {
      f.arrayBuffer()
        .then((buffer) => {
          const workbook = XLSX.read(buffer, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) {
            setFileError("No worksheet found in XLSX file.");
            setHeaders([]);
            setRows([]);
            return;
          }

          const worksheet = workbook.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
            defval: "",
          });

          if (data.length === 0) {
            setFileError("No rows found in file.");
            setHeaders([]);
            setRows([]);
            return;
          }

          const normalized = data.map((row) =>
            Object.fromEntries(
              Object.entries(row).map(([key, value]) => [String(key), value == null ? "" : String(value).trim()])
            )
          );

          const h = Object.keys(normalized[0] ?? {});
          if (h.length === 0) {
            setFileError("The file has no columns.");
            setHeaders([]);
            setRows([]);
            return;
          }

          setHeaders(h);
          setRows(normalized);
          setTitleColumn(h[0] ?? "");
          setDescriptionColumn(h.length > 1 ? h[1] : "");
        })
        .catch(() => {
          setFileError("Failed to parse XLSX file.");
          setHeaders([]);
          setRows([]);
        });
      return;
    }

    Papa.parse(f, {
      header: true,
      delimiter: isTsv ? "\t" : ",",
      skipEmptyLines: true,
      complete: (res) => {
        const data = res.data as Record<string, string>[];
        if (data.length === 0) {
          setFileError("No rows found in file.");
          setHeaders([]);
          setRows([]);
          return;
        }
        const h = Object.keys(data[0]);
        if (h.length === 0) {
          setFileError("The file has no columns.");
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
        setFileError(`Failed to parse file: ${err.message}`);
        setHeaders([]);
        setRows([]);
      },
    });
  }, []);

  async function submitImport(payload: {
    filename: string;
    rows: Record<string, string>[];
    titleColumn: string;
    descriptionColumn?: string | null;
    dateColumn?: string | null;
    productId?: string | null;
  }) {
    const res = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Import failed");
    invalidateFeedbackListCache();
    window.dispatchEvent(new CustomEvent("feedback-imported"));
    onClose();
    router.push("/feedback");
  }

  async function handleFileSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !titleColumn) return;

    const validRows = rows.filter((row) => row[titleColumn]?.trim());
    if (validRows.length === 0) {
      setFileError("No valid rows to import. The selected feedback column is empty for all rows.");
      return;
    }

    setFileUploading(true);
    setFileError("");
    try {
      await submitImport({
        filename: file.name,
        rows: validRows,
        titleColumn,
        descriptionColumn: descriptionColumn || null,
        dateColumn: dateColumn || null,
        productId: fileProductId || null,
      });
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setFileUploading(false);
    }
  }

  async function handleExtractSuggestions() {
    const text = freeTextInput.trim();
    if (!text) return;

    setExtracting(true);
    setExtractError("");
    setImportSuggestionsError("");
    try {
      const res = await fetch("/api/import/extract-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to extract feedback items");

      const extracted: Array<{ title?: unknown; description?: unknown }> = Array.isArray(data.items) ? data.items : [];
      const nextSuggestions: SuggestedFeedbackItem[] = extracted
        .filter((item) => typeof item.title === "string" && item.title.trim().length > 0)
        .map((item, idx) => ({
          id: `suggestion-${idx}`,
          title: String(item.title).trim(),
          description: typeof item.description === "string" ? item.description.trim() : "",
          selected: true,
        }));

      if (nextSuggestions.length === 0) {
        setExtractError("No feedback items were detected. Try adding clearer notes or more context.");
      }
      setSuggestions(nextSuggestions);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Failed to extract feedback items");
      setSuggestions([]);
    } finally {
      setExtracting(false);
    }
  }

  function updateSuggestion(id: string, patch: Partial<SuggestedFeedbackItem>) {
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function removeSuggestion(id: string) {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleImportSuggestions(e: React.FormEvent) {
    e.preventDefault();
    const selected = suggestions.filter((s) => s.selected && s.title.trim().length > 0);
    if (selected.length === 0) {
      setImportSuggestionsError("Select at least one suggested item to import.");
      return;
    }

    setImportingSuggestions(true);
    setImportSuggestionsError("");
    try {
      const mappedRows = selected.map((item) => ({
        Title: item.title.trim(),
        Description: item.description.trim(),
      }));

      await submitImport({
        filename: "Free text extraction",
        rows: mappedRows,
        titleColumn: "Title",
        descriptionColumn: "Description",
        dateColumn: null,
        productId: freeTextProductId || null,
      });
    } catch (err) {
      setImportSuggestionsError(err instanceof Error ? err.message : "Failed to import extracted items");
    } finally {
      setImportingSuggestions(false);
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
  const validFileRowCount = rows.filter((row) => row[titleColumn]?.trim()).length;
  const selectedSuggestionsCount = suggestions.filter((s) => s.selected && s.title.trim()).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-brand/40 backdrop-blur-[1px]" onClick={onClose} />
        <div className="relative bg-surface rounded-xl shadow-2xl ring-1 ring-border max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-surface z-10">
            <div className="px-6 pt-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-content pb-3">Add feedback</h2>
              <button onClick={onClose} className="text-content-subtle hover:text-content pb-3 p-0.5 rounded">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 border-b border-border">
              <nav className="-mb-px flex gap-6">
                {(["file", "freeText", "manual"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab
                        ? "border-content text-content"
                        : "border-transparent text-content-subtle hover:text-content-muted"
                    }`}
                  >
                    {tab === "file" ? "Import file" : tab === "freeText" ? "Free text" : "Add manually"}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          <div className="p-6">
            {activeTab === "file" && (
              <form onSubmit={handleFileSubmit} className="space-y-6">
                <div className="rounded-lg border border-border bg-surface-muted p-4">
                  <label className="block text-sm font-semibold text-content mb-1">Import file</label>
                  <input
                    type="file"
                    accept=".csv,.tsv,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={onFileChange}
                    className="block w-full rounded-md border border-border bg-surface text-sm text-content-muted file:mr-3 file:my-1 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-brand file:text-white file:font-medium file:cursor-pointer hover:file:bg-brand-hover"
                  />
                  <p className="text-xs text-content-subtle mt-2">Supported formats: CSV, TSV, XLSX</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-content mb-1">Product (optional)</label>
                  <Select value={fileProductId} onChange={(e) => setFileProductId(e.target.value)}>
                    <option value="">Unassigned</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </div>

                {headers.length > 0 && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-content mb-2">Column preview</label>
                      <div className="border border-border rounded overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-surface-muted border-b border-border">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-content">Column</th>
                              <th className="px-3 py-2 text-left font-medium text-content-muted">Sample value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {headers.map((header) => (
                              <tr key={header}>
                                <td className="px-3 py-2 font-medium text-content">{header}</td>
                                {previewRows.map((row, idx) => (
                                  <td key={idx} className="px-3 py-2 text-content-muted max-w-xs truncate" title={row[header] || ""}>
                                    {row[header] || <span className="text-content-subtle">-</span>}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-content-subtle mt-1">Showing first row as preview</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-content mb-1">Feedback column</label>
                      <Select value={titleColumn} onChange={(e) => setTitleColumn(e.target.value)}>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </Select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-content mb-1">Additional description column (optional)</label>
                      <Select value={descriptionColumn} onChange={(e) => setDescriptionColumn(e.target.value)}>
                        <option value="">None</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </Select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-content mb-1">Date column (optional)</label>
                      <Select value={dateColumn} onChange={(e) => setDateColumn(e.target.value)}>
                        <option value="">None - use import date</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm text-content">
                        <strong>{validFileRowCount}</strong> of <strong>{rows.length}</strong> rows will be imported
                      </p>
                      {fileWarnings.map((warning, idx) => (
                        <p key={idx} className="text-sm text-warning">{warning}</p>
                      ))}
                    </div>
                  </>
                )}

                {fileError && <p className="text-sm text-danger">{fileError}</p>}
                <div className="flex gap-3 justify-end">
                  <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                  <Button type="submit" loading={fileUploading} disabled={!file || !titleColumn || fileUploading || validFileRowCount === 0}>
                    Import
                  </Button>
                </div>
              </form>
            )}

            {activeTab === "freeText" && (
              <form onSubmit={handleImportSuggestions} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-content mb-1">Paste notes or transcript</label>
                  <Textarea
                    value={freeTextInput}
                    onChange={(e) => setFreeTextInput(e.target.value)}
                    rows={10}
                    placeholder="Paste interview notes, call summaries, chat logs, or any long free text."
                  />
                  <p className="text-xs text-content-subtle mt-1">
                    AI will suggest individual feedback items that you can review before import.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-content mb-1">Product (optional)</label>
                  <Select value={freeTextProductId} onChange={(e) => setFreeTextProductId(e.target.value)}>
                    <option value="">Unassigned</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={handleExtractSuggestions}
                    loading={extracting}
                    disabled={extracting || !freeTextInput.trim()}
                  >
                    Suggest feedback items
                  </Button>
                  {suggestions.length > 0 && (
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => setSuggestions((prev) => prev.map((s) => ({ ...s, selected: true })))}
                    >
                      Select all
                    </Button>
                  )}
                </div>

                {extractError && <p className="text-sm text-danger">{extractError}</p>}

                {suggestions.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm text-content">
                      {suggestions.length} suggestions generated, {selectedSuggestionsCount} selected
                    </p>
                    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                      {suggestions.map((item) => (
                        <div key={item.id} className="border border-border rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <label className="inline-flex items-center gap-2 text-sm text-content">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={(e) => updateSuggestion(item.id, { selected: e.target.checked })}
                                className="h-4 w-4 rounded border-border-strong text-brand focus:ring-brand/20"
                              />
                              Include
                            </label>
                            <Button variant="danger" size="sm" type="button" onClick={() => removeSuggestion(item.id)}>
                              Remove
                            </Button>
                          </div>
                          <Input
                            type="text"
                            value={item.title}
                            onChange={(e) => updateSuggestion(item.id, { title: e.target.value })}
                            placeholder="Feedback title"
                          />
                          <Textarea
                            value={item.description}
                            onChange={(e) => updateSuggestion(item.id, { description: e.target.value })}
                            rows={2}
                            placeholder="Description (optional)"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {importSuggestionsError && <p className="text-sm text-danger">{importSuggestionsError}</p>}

                <div className="flex gap-3 justify-end">
                  <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                  <Button type="submit" loading={importingSuggestions} disabled={importingSuggestions || selectedSuggestionsCount === 0}>
                    Import selected
                  </Button>
                </div>
              </form>
            )}

            {activeTab === "manual" && (
              <form onSubmit={handleManualSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-content mb-1">
                    Feedback title <span className="text-danger">*</span>
                  </label>
                  <Input
                    type="text"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    placeholder="Describe the feature request or feedback"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-content mb-1">Description (optional)</label>
                  <Textarea
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                    rows={4}
                    placeholder="Additional context or detail"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-content mb-1">Product (optional)</label>
                  <Select value={manualProductId} onChange={(e) => setManualProductId(e.target.value)}>
                    <option value="">Unassigned</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </div>

                {manualError && <p className="text-sm text-danger">{manualError}</p>}

                <div className="flex gap-3 justify-end">
                  <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                  <Button type="submit" loading={manualSubmitting} disabled={!manualTitle.trim() || manualSubmitting}>
                    Add feedback
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
