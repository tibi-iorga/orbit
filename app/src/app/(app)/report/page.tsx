"use client";

import { useEffect, useState } from "react";
type ClusterWithFeatures = {
  id: string;
  name: string;
  reportSummary: string | null;
  features: { id: string; title: string; combinedScore: number }[];
};

export default function ReportPage() {
  const [clusters, setClusters] = useState<ClusterWithFeatures[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clusters")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load clusters");
        return r.json();
      })
      .then((clusterList: { id: string; name: string; reportSummary: string | null }[]) => {
        return Promise.all(
          clusterList.map((c) =>
            fetch(`/api/features?clusterId=${encodeURIComponent(c.id)}`).then((r) => {
              if (!r.ok) throw new Error(`Failed to load features for cluster ${c.name}`);
              return r.json();
            })
          )
        ).then((results) => {
          setClusters(
            clusterList.map((c, i) => ({
              id: c.id,
              name: c.name,
              reportSummary: c.reportSummary,
              features: (results[i]?.features ?? []).slice(0, 10),
            }))
          );
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load report data"))
      .finally(() => setLoading(false));
  }, []);

  async function generateSummary(clusterId: string) {
    setGenerating(clusterId);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setClusters((prev) =>
        prev.map((c) =>
          c.id === clusterId ? { ...c, reportSummary: data.reportSummary } : c
        )
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to generate summary");
    } finally {
      setGenerating(null);
    }
  }

  function copyToClipboard(clusterId: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(clusterId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-gray-900">Report</h1>
      <p className="text-sm text-gray-600">
        One view per cluster. Generate a summary with the button, then copy the paragraph for slides or documents.
      </p>
      {clusters.length === 0 ? (
        <p className="text-gray-500">No clusters yet. Use Auto-cluster on the feature list first.</p>
      ) : (
        <div className="space-y-8">
          {clusters.map((c) => (
            <div key={c.id} className="p-6 border border-gray-200 rounded bg-white shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{c.name}</h2>
              <p className="text-sm text-gray-500 mb-4">
                {c.features.length} items; top by combined score below.
              </p>
              <ul className="list-disc list-inside text-sm text-gray-700 mb-4">
                {c.features.slice(0, 10).map((f) => (
                  <li key={f.id}>{f.title}</li>
                ))}
              </ul>
              <div className="border-t border-gray-200 pt-4 mt-4">
                {c.reportSummary ? (
                  <>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap mb-2">{c.reportSummary}</p>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(c.id, c.reportSummary!)}
                      className="text-sm px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50"
                    >
                      {copiedId === c.id ? "Copied" : "Copy to clipboard"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => generateSummary(c.id)}
                    disabled={generating === c.id}
                    className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50"
                  >
                    {generating === c.id ? "Generating…" : "Generate summary"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
