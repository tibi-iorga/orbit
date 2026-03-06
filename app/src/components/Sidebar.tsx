"use client";

import React, { useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
import {
  FolderIcon,
  Cog6ToothIcon,
  InboxIcon,
  LightBulbIcon,
  SignalIcon,
} from "@heroicons/react/24/outline";


function classNames(...classes: (string | boolean | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleNavigate = useCallback(
    (href: string) => {
      router.push(href);
      onNavigate?.();
    },
    [router, onNavigate]
  );

  const isFeedbackPage = pathname === "/feedback" || pathname.startsWith("/feedback/");
  const isIdeasPage = pathname === "/ideas" || pathname.startsWith("/ideas");
  const isOpportunitiesPage = pathname === "/opportunities" || pathname.startsWith("/opportunities");
  const isRoadmapPage = pathname === "/roadmap" || pathname.startsWith("/roadmap");
  const isSettingsPage = pathname.startsWith("/settings");

  const navigation: {
    name: string;
    href?: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    current: boolean;
    badge?: string | number;
    children?: { name: string; href: string }[];
  }[] = [
    { name: "Feedback inbox", href: "/feedback", icon: InboxIcon, current: isFeedbackPage },
    { name: "Ideas", href: "/ideas", icon: LightBulbIcon, current: isIdeasPage },
    { name: "Opportunities", href: "/opportunities", icon: SignalIcon, current: isOpportunitiesPage },
    { name: "Roadmap", href: "/roadmap", icon: FolderIcon, current: isRoadmapPage },
    {
      name: "Settings",
      icon: Cog6ToothIcon,
      current: isSettingsPage,
      children: [
        { name: "Your Company", href: "/settings/company" },
        { name: "Evaluation Criteria", href: "/settings/evaluation-criteria" },
        { name: "People & Access", href: "/settings/users" },
        { name: "Imports", href: "/imports" },
      ],
    },
  ];

  return (
    <div className="relative flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 px-6">
      <div className="relative flex h-16 shrink-0 items-center">
        <Link
          href="/opportunities"
          onClick={(e) => { e.preventDefault(); handleNavigate("/opportunities"); }}
          className="font-semibold text-white"
        >
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
                      onClick={(e) => { e.preventDefault(); handleNavigate(item.href!); }}
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
                    <Disclosure as="div" defaultOpen={item.name === "Settings" && isSettingsPage}>
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
                        {item.children.map((subItem) => {
                          const isActive = pathname === subItem.href || pathname.startsWith(subItem.href + "/");
                          return (
                            <li key={subItem.name}>
                              <Link
                                href={subItem.href}
                                onClick={(e) => { e.preventDefault(); handleNavigate(subItem.href); }}
                                className={classNames(
                                  isActive ? "bg-gray-800 text-white" : "hover:bg-white/5 hover:text-white",
                                  "block rounded-md py-2 pr-2 pl-9 text-sm/6 text-gray-400",
                                )}
                              >
                                {subItem.name}
                              </Link>
                            </li>
                          );
                        })}
                      </DisclosurePanel>
                    </Disclosure>
                  )}
                </li>
              ))}
            </ul>
          </li>
          <li className="-mx-6 mt-auto border-t border-white/10">
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
