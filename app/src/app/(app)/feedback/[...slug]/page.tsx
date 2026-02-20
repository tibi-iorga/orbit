"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import FeedbackPageContent from "@/components/FeedbackPageContent";
import { findProductByPath } from "@/lib/product-slug";

export default function FeedbackProductPage() {
  const params = useParams();
  const [productId, setProductId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const slugs = params.slug as string[];
    if (!slugs || slugs.length === 0 || slugs[0] === "all") {
      setProductId(null);
      setLoading(false);
      return;
    }

    // Fetch products to map slugs to product ID
    fetch("/api/products")
      .then(async (r) => {
        if (!r.ok) {
          setProductId(null);
          return { tree: [] };
        }
        return r.json();
      })
      .then((data) => {
        const product = findProductByPath(slugs, data.tree || []);
        setProductId(product?.id || null);
      })
      .catch(() => {
        setProductId(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [params.slug]);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return <FeedbackPageContent initialProductId={productId} />;
}
