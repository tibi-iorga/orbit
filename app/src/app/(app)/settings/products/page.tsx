"use client";

import { ProductsSettings } from "@/components/ProductsSettings";

export default function ProductsSettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Product Portfolio</h1>
        <p className="text-sm text-gray-500 mt-1">
          Organise your feedback by product. Descriptions help AI assign feedback to the right product.
        </p>
      </div>
      <ProductsSettings />
    </div>
  );
}
