"use client";

import React, { useState, useEffect } from "react";
import type { Opportunity } from "@/types";
import { Modal, FormField, Input, Textarea, Select, Button } from "@/components/ui";

interface OpportunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (opportunity: Opportunity) => void;
  products: { id: string; name: string }[];
  prelinkedFeedbackItems?: { id: string; title: string }[];
}

export function OpportunityModal({
  isOpen,
  onClose,
  onCreated,
  products,
  prelinkedFeedbackItems = [],
}: OpportunityModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [productId, setProductId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setTitle("");
      setDescription("");
      setProductId("");
      setError("");
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!productId) {
      setError("Product is required");
      return;
    }

    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          productId: productId || null,
          feedbackItemIds: prelinkedFeedbackItems.map((item) => item.id),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create opportunity");
      }

      const newOpportunity = await res.json();

      // Fetch full opportunity with all fields
      const fullRes = await fetch(`/api/opportunities`);
      if (fullRes.ok) {
        const allOpportunities = await fullRes.json();
        const fullOpportunity = allOpportunities.find((o: Opportunity) => o.id === newOpportunity.id);
        if (fullOpportunity) {
          onCreated(fullOpportunity);
        } else {
          // Fallback: construct minimal opportunity with defaults
          onCreated({
            ...newOpportunity,
            status: "draft",
            scores: {},
            explanation: {},
            reportSummary: null,
            feedbackCount: 0,
            combinedScore: 0,
            productName: products.find((p) => p.id === newOpportunity.productId)?.name || null,
          });
        }
      } else {
        // Fallback: construct minimal opportunity with defaults
        onCreated({
          ...newOpportunity,
          status: "draft",
          scores: {},
          explanation: {},
          feedbackCount: 0,
          combinedScore: 0,
          productName: products.find((p) => p.id === newOpportunity.productId)?.name || null,
        });
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create opportunity");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="New Opportunity"
      open={isOpen}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex gap-2 justify-end w-full">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="opportunity-modal-form" loading={submitting}>
            Create opportunity
          </Button>
        </div>
      }
    >
      <form id="opportunity-modal-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Product" required error={!productId && error ? error : undefined}>
          <Select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            required
          >
            <option value="">Select a product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </FormField>

        <FormField label="Title" required error={!title.trim() && error ? error : undefined}>
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Opportunity title"
            required
            autoFocus
          />
        </FormField>

        <FormField label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this opportunity?"
            rows={3}
          />
        </FormField>

        {prelinkedFeedbackItems.length > 0 && (
          <FormField label="Linked feedback">
            <ul className="list-disc list-inside text-sm text-content-muted space-y-1">
              {prelinkedFeedbackItems.map((item) => (
                <li key={item.id}>{item.title}</li>
              ))}
            </ul>
          </FormField>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
