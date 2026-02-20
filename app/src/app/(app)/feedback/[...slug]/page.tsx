"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { findProductByPath } from "@/lib/product-slug";

export default function FeedbackProductPage() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    const slugs = params.slug as string[];
    if (!slugs || slugs.length === 0 || slugs[0] === "all") {
      router.replace("/feedback");
      return;
    }

    fetch("/api/products")
      .then(async (r) => {
        if (!r.ok) return { tree: [] };
        return r.json();
      })
      .then((data) => {
        const product = findProductByPath(slugs, data.tree || []);
        if (product?.id) {
          router.replace(`/feedback?productId=${encodeURIComponent(product.id)}`);
        } else {
          router.replace("/feedback");
        }
      })
      .catch(() => {
        router.replace("/feedback");
      });
  }, [params.slug, router]);

  return <div className="p-6 text-gray-500">Loading...</div>;
}
