"use client";

import React, { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function OpportunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const opportunityId = params.id as string;

  useEffect(() => {
    router.replace(`/opportunities?open=${encodeURIComponent(opportunityId)}`);
  }, [opportunityId, router]);

  return (
    <div className="flex items-center justify-center py-12">
      <p className="text-gray-500">Loading…</p>
    </div>
  );
}
