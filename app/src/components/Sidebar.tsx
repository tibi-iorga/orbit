"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
import {
  FolderIcon,
  Cog6ToothIcon,
  InboxIcon,
} from "@heroicons/react/24/outline";
import { getCachedProductsRaw } from "@/lib/cache";

interface Product {
  id: string;
  name: string;
  feedbackCount?: number;
  parentId?: string | null;
  children?: Product[];
}

function classNames(...classes: (string | boolean | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

function ProductNode({
  product,
  currentProductId,
  expandedProductIds,
  onToggleExpand,
  level,
  onNavigate,
  allProducts,
}: {
  product: Product;
  currentProductId: string | null;
  expandedProductIds: Set<string>;
  onToggleExpand: (id: string) => void;
  level: number;
  onNavigate?: () => void;
  allProducts: Product[];
}) {
  const hasChildren = product.children && product.children.length > 0;
  const isExpanded = expandedProductIds.has(product.id);
  const isActive = currentProductId === product.id;

  const productUrl = `/opportunities?productId=${product.id}`;

  return (
    <li>
      {hasChildren ? (
        <>
          <div className="flex items-center group">
            <Link
              href={productUrl}
              onClick={onNavigate}
              className={classNames(
                isActive ? "bg-gray-800 text-white" : "hover:bg-white/5 hover:text-white",
                "flex-1 block rounded-md py-2 pr-2 pl-9 text-sm/6 text-gray-400",
              )}
              style={{ paddingLeft: level > 0 ? `${level * 12 + 44}px` : undefined }}
            >
              {product.name}
            </Link>
            <button
              type="button"
              onClick={() => onToggleExpand(product.id)}
              className="p-1 -ml-1 text-gray-400 hover:text-white"
            >
              <ChevronRightIcon
                aria-hidden="true"
                className={classNames(
                  "size-5 shrink-0 transition-transform duration-200",
                  isExpanded ? "rotate-90 text-white" : "",
                )}
              />
            </button>
          </div>
          {isExpanded && (
            <ul className="mt-1 px-2">
              {product.children!.map((child) => (
                <ProductNode
                  key={child.id}
                  product={child}
                  currentProductId={currentProductId}
                  expandedProductIds={expandedProductIds}
                  onToggleExpand={onToggleExpand}
                  level={level + 1}
                  onNavigate={onNavigate}
                  allProducts={allProducts}
                />
              ))}
            </ul>
          )}
        </>
      ) : (
        <Link
          href={productUrl}
          onClick={onNavigate}
          className={classNames(
            isActive ? "bg-gray-800 text-white" : "hover:bg-white/5 hover:text-white",
            "block rounded-md py-2 pr-2 pl-9 text-sm/6 text-gray-400",
          )}
          style={{ paddingLeft: level > 0 ? `${level * 12 + 44}px` : undefined }}
        >
          {product.name}
        </Link>
      )}
    </li>
  );
}

export function Sidebar({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [products, setProducts] = useState<Product[]>([]);
  const [flatProducts, setFlatProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [currentProductId, setCurrentProductId] = useState<string | null>(null);
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set());
  const [newFeedbackCount, setNewFeedbackCount] = useState(0);

  const fetchNewCount = useCallback(async () => {
    try {
      const res = await fetch("/api/feedback?status=new&pageSize=1");
      if (res.ok) {
        const data = await res.json();
        setNewFeedbackCount(data.newCount ?? 0);
      }
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    fetchNewCount();
  }, [fetchNewCount, pathname]);

  // Refresh count immediately when a CSV or manual import completes
  useEffect(() => {
    const handler = () => fetchNewCount();
    window.addEventListener("feedback-imported", handler);
    return () => window.removeEventListener("feedback-imported", handler);
  }, [fetchNewCount]);

  // Get current productId from URL query params
  useEffect(() => {
    if (typeof window !== "undefined") {
      const updateProductId = () => {
        const params = new URLSearchParams(window.location.search);
        setCurrentProductId(params.get("productId"));
      };
      updateProductId();
      window.addEventListener("popstate", updateProductId);
      return () => window.removeEventListener("popstate", updateProductId);
    }
  }, [pathname]);

  useEffect(() => {
    getCachedProductsRaw()
      .then((data) => {
        setProducts((data?.tree as unknown as Product[]) || []);
        setFlatProducts((data?.flat as unknown as Product[]) || []);
        
        const resolvedProductId = currentProductId;
        
        if (resolvedProductId && data?.flat) {
          const expanded = new Set<string>();
          let current: string | null = resolvedProductId;
          while (current) {
            const product = data.flat.find((p: Product) => p.id === current);
            if (product?.parentId) {
              expanded.add(product.parentId);
              current = product.parentId;
            } else {
              break;
            }
          }
          setExpandedProductIds(expanded);
        }
      })
      .catch(() => {
        setProducts([]);
        setFlatProducts([]);
      })
      .finally(() => {
        setProductsLoading(false);
      });
  }, [currentProductId, pathname]);

  const isFeedbackPage = pathname === "/feedback" || pathname.startsWith("/feedback/");
  const isOpportunitiesPage = pathname === "/opportunities" || pathname.startsWith("/opportunities");
  const isRoadmapPage = pathname === "/roadmap" || pathname.startsWith("/roadmap");
  const isSettingsPage = pathname.startsWith("/settings");

  const navigation = [
    {
      name: "Feedback inbox",
      href: "/feedback",
      icon: InboxIcon,
      current: isFeedbackPage,
      badge: newFeedbackCount > 0 ? newFeedbackCount : undefined,
    },
    {
      name: "Opportunities",
      href: "/opportunities",
      icon: FolderIcon,
      current: isOpportunitiesPage,
    },
    {
      name: "Roadmap",
      href: "/roadmap",
      icon: FolderIcon,
      current: isRoadmapPage,
    },
    {
      name: "Products",
      icon: FolderIcon,
      current: false,
      children: [],
    },
    {
      name: "Settings",
      icon: Cog6ToothIcon,
      current: isSettingsPage,
      children: [
        { name: "Evaluation Criteria", href: "/settings/evaluation-criteria" },
        { name: "Product Portfolio", href: "/settings/products" },
        { name: "Auto-group feedback", href: "/settings/auto-group" },
        { name: "Imports", href: "/imports" },
      ],
    },
  ];

  return (
    <div className="relative flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 px-6">
      <div className="relative flex h-16 shrink-0 items-center">
        <Link href="/opportunities" className="font-semibold text-white">
          Orbit
        </Link>
      </div>
      <nav className="relative flex flex-1 flex-col">
        <ul role="list" className="flex flex-1 flex-col gap-y-7">
          <li>
            <ul role="list" className="-mx-2 space-y-1">
              {navigation.map((item) => (
                <li key={item.name}>
                  {!item.children ? (
                    <Link
                      href={item.href!}
                      onClick={onNavigate}
                      className={classNames(
                        item.current ? "bg-white/5 text-white" : "hover:bg-white/5 hover:text-white",
                        "group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold text-gray-400",
                      )}
                    >
                      <item.icon aria-hidden="true" className="size-6 shrink-0" />
                      {item.name}
                      {item.badge && (
                        <span className="ml-auto inline-flex items-center rounded-full bg-blue-500 px-2 py-0.5 text-xs font-medium text-white">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  ) : (
                    <Disclosure as="div" defaultOpen={item.name === "Products" || (item.name === "Settings" && isSettingsPage)}>
                      <DisclosureButton
                        className={classNames(
                          item.current ? "bg-white/5 text-white" : "hover:bg-white/5 hover:text-white",
                          "group flex w-full items-center gap-x-3 rounded-md p-2 text-left text-sm/6 font-semibold text-gray-400",
                        )}
                      >
                        <item.icon aria-hidden="true" className="size-6 shrink-0" />
                        {item.name}
                        <ChevronRightIcon
                          aria-hidden="true"
                          className="ml-auto size-5 shrink-0 text-gray-400 group-data-[open]:rotate-90 group-data-[open]:text-gray-500"
                        />
                      </DisclosureButton>
                      <DisclosurePanel as="ul" className="mt-1 px-2">
                        {item.name === "Products" ? (
                          productsLoading ? (
                              <li className="px-2 py-1 text-xs text-gray-500">Loading...</li>
                            ) : products.length === 0 ? (
                              <li className="px-2 py-1 text-xs text-gray-500">No products</li>
                            ) : (
                              products.map((product) => (
                                <ProductNode
                                  key={product.id}
                                  product={product}
                                  currentProductId={currentProductId}
                                  expandedProductIds={expandedProductIds}
                                  onToggleExpand={(id) => {
                                    setExpandedProductIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(id)) {
                                        next.delete(id);
                                      } else {
                                        next.add(id);
                                      }
                                      return next;
                                    });
                                  }}
                                  level={0}
                                  onNavigate={onNavigate}
                                  allProducts={flatProducts}
                                />
                              ))
                            )
                        ) : (
                          item.children!.map((subItem) => {
                            const isActive = pathname === subItem.href;
                            return (
                              <li key={subItem.name}>
                                <Link
                                  href={subItem.href}
                                  onClick={onNavigate}
                                  className={classNames(
                                    isActive ? "bg-gray-800 text-white" : "hover:bg-white/5 hover:text-white",
                                    "block rounded-md py-2 pr-2 pl-9 text-sm/6 text-gray-400",
                                  )}
                                >
                                  {subItem.name}
                                </Link>
                              </li>
                            );
                          })
                        )}
                      </DisclosurePanel>
                    </Disclosure>
                  )}
                </li>
              ))}
            </ul>
          </li>
          <li className="-mx-6 mt-auto">
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex w-full items-center gap-x-4 px-6 py-3 text-sm/6 font-semibold text-white hover:bg-white/5"
            >
              <span>Sign out</span>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
