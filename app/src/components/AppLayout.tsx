"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { ImportModal } from "./ImportModal";

interface Product {
  id: string;
  name: string;
  featureCount: number;
}

const nav: Array<{ href: string; label: string }> = [];

const settingsItems = [
  { href: "/settings/evaluation-criteria", label: "Evaluation Criteria" },
  { href: "/settings/products", label: "Product Portfolio" },
  { href: "/imports", label: "Imports" },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [currentProductId, setCurrentProductId] = useState<string | null>(null);
  const [productsExpanded, setProductsExpanded] = useState(true);
  const [settingsExpanded, setSettingsExpanded] = useState(pathname.startsWith("/settings"));
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Get current productId from URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const updateProductId = () => {
        const params = new URLSearchParams(window.location.search);
        setCurrentProductId(params.get("productId"));
      };
      updateProductId();
      // Listen for browser back/forward
      window.addEventListener("popstate", updateProductId);
      // Also check when pathname changes (covers most cases)
      return () => window.removeEventListener("popstate", updateProductId);
    }
  }, [pathname]);

  // Also update when products load (in case URL changed before products loaded)
  useEffect(() => {
    if (typeof window !== "undefined" && products.length > 0) {
      const params = new URLSearchParams(window.location.search);
      setCurrentProductId(params.get("productId"));
    }
  }, [products.length]);

  // Auto-expand settings if on a settings page
  useEffect(() => {
    if (pathname.startsWith("/settings")) {
      setSettingsExpanded(true);
    }
  }, [pathname]);

  useEffect(() => {
    fetch("/api/products")
      .then(async (r) => {
        if (!r.ok) return [];
        return r.json();
      })
      .then((data) => {
        setProducts(data || []);
      })
      .catch(() => {
        setProducts([]);
      })
      .finally(() => {
        setProductsLoading(false);
      });
  }, []);

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="w-56 flex flex-col bg-gray-900 text-gray-200">
        <div className="p-4 border-b border-gray-800">
          <Link href="/features" className="font-semibold text-white">
            Orbit
          </Link>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {/* Import Button */}
          <button
            onClick={() => setImportModalOpen(true)}
            className="w-full px-3 py-2 mb-2 bg-[#2563EB] text-white text-sm font-medium rounded hover:bg-[#1D4ED8] text-center transition-colors"
          >
            Import
          </button>

          {/* Products Section */}
          <div>
            <button
              onClick={() => setProductsExpanded(!productsExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 rounded text-sm text-gray-400 hover:text-white hover:bg-gray-800"
            >
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Products
              </span>
              <span className="text-xs text-gray-500">
                {productsExpanded ? "−" : "+"}
              </span>
            </button>
            {productsExpanded && (
              <div className="ml-2">
                <Link
                  href="/features"
                  className={
                    "block px-3 py-1.5 rounded text-sm " +
                    (pathname === "/features" && !currentProductId
                      ? "bg-gray-800 text-white"
                      : "text-gray-400 hover:text-white hover:bg-gray-800")
                  }
                >
                  ALL
                </Link>
                {productsLoading ? (
                  <div className="px-3 py-2 text-xs text-gray-500">Loading...</div>
                ) : products.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-500">No products</div>
                ) : (
                  products.map((product) => {
                    const isActive = currentProductId === product.id;
                    return (
                      <Link
                        key={product.id}
                        href={`/features?productId=${encodeURIComponent(product.id)}`}
                        className={
                          "block px-3 py-1.5 rounded text-sm " +
                          (isActive
                            ? "bg-gray-800 text-white"
                            : "text-gray-400 hover:text-white hover:bg-gray-800")
                        }
                      >
                        <div className="flex items-center justify-between">
                          <span>{product.name}</span>
                          {product.featureCount > 0 && (
                            <span className="text-xs text-gray-500 ml-2">
                              {product.featureCount}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Main Navigation */}
          {nav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={
                "block px-3 py-2 rounded text-sm " +
                (pathname === href || pathname.startsWith(href)
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800")
              }
            >
              {label}
            </Link>
          ))}

          {/* Settings Section */}
          <div>
            <button
              onClick={() => setSettingsExpanded(!settingsExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 rounded text-sm text-gray-400 hover:text-white hover:bg-gray-800"
            >
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Settings
              </span>
              <span className="text-xs text-gray-500">
                {settingsExpanded ? "−" : "+"}
              </span>
            </button>
            {settingsExpanded && (
              <div className="ml-2">
                {settingsItems.map(({ href, label }) => {
                  const isActive = pathname === href;
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={
                        "block px-3 py-1.5 rounded text-sm " +
                        (isActive
                          ? "bg-gray-800 text-white"
                          : "text-gray-400 hover:text-white hover:bg-gray-800")
                      }
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>
        <div className="p-2 border-t border-gray-800">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full text-left px-3 py-2 rounded text-sm text-gray-400 hover:text-white hover:bg-gray-800"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6 bg-white min-w-0">
        {children}
      </main>
      <ImportModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} />
    </div>
  );
}
