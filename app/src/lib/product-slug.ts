/**
 * Convert product name to URL-friendly slug
 */
export function productNameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Build product path from product hierarchy
 * Returns array of slugs representing the path
 */
export function buildProductPath(
  product: { id: string; name: string; parentId?: string | null },
  allProducts: { id: string; name: string; parentId?: string | null }[],
): string[] {
  const path: string[] = [];
  let current: typeof product | undefined = product;

  while (current) {
    path.unshift(productNameToSlug(current.name));
    if (current.parentId) {
      current = allProducts.find((p) => p.id === current!.parentId);
    } else {
      break;
    }
  }

  return path;
}

/**
 * Find product by slug path
 */
export function findProductByPath(
  slugs: string[],
  allProducts: { id: string; name: string; parentId?: string | null; children?: any[] }[],
): { id: string; name: string } | null {
  if (slugs.length === 0) return null;

  // Build a flat map for easier lookup
  const productMap = new Map<string, { id: string; name: string; parentId?: string | null }>();
  const flattenProducts = (products: typeof allProducts, parentId?: string | null) => {
    products.forEach((p) => {
      productMap.set(p.id, { id: p.id, name: p.name, parentId });
      if (p.children) {
        flattenProducts(p.children, p.id);
      }
    });
  };
  flattenProducts(allProducts);

  // Find product by traversing the path
  let currentProducts = allProducts;
  let foundProduct: { id: string; name: string } | null = null;

  for (const slug of slugs) {
    const product = currentProducts.find((p) => productNameToSlug(p.name) === slug);
    if (!product) return null;
    foundProduct = { id: product.id, name: product.name };
    currentProducts = product.children || [];
  }

  return foundProduct;
}
