"use client";

import { useState } from "react";
import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { Sidebar } from "./Sidebar";
import { ImportModal } from "./ImportModal";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleNavigate = () => {
    setSidebarOpen(false);
  };

  return (
    <div className="h-full">
      {/* Mobile sidebar */}
      <Dialog open={sidebarOpen} onClose={setSidebarOpen} className="relative z-50 lg:hidden">
        <DialogBackdrop className="fixed inset-0 bg-gray-900/80" />

        <div className="fixed inset-0 flex">
          <DialogPanel className="relative mr-16 flex w-full max-w-xs flex-1">
            <div className="absolute top-0 left-full flex w-16 justify-center pt-5">
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="-m-2.5 p-2.5"
              >
                <span className="sr-only">Close sidebar</span>
                <XMarkIcon aria-hidden="true" className="size-6 text-white" />
              </button>
            </div>

            <div className="relative flex grow flex-col gap-y-5 overflow-y-auto bg-gray-900 px-6 pb-2 ring-1 ring-white/10">
              <Sidebar
                onImportClick={() => {
                  setImportModalOpen(true);
                  setSidebarOpen(false);
                }}
                onNavigate={handleNavigate}
              />
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {/* Desktop sidebar */}
      <div className="hidden bg-gray-900 lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <Sidebar onImportClick={() => setImportModalOpen(true)} />
      </div>

      {/* Mobile header */}
      <div className="sticky top-0 z-40 flex items-center gap-x-6 bg-gray-900 px-4 py-4 shadow-sm sm:px-6 lg:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="-m-2.5 p-2.5 text-gray-400 hover:text-white lg:hidden"
        >
          <span className="sr-only">Open sidebar</span>
          <Bars3Icon aria-hidden="true" className="size-6" />
        </button>
        <div className="flex-1 text-sm/6 font-semibold text-white">Orbit</div>
      </div>

      {/* Main content */}
      <main className="py-10 lg:pl-72 bg-white min-h-screen flex flex-col">
        <div className="px-4 sm:px-6 lg:px-8 flex-1 flex flex-col min-h-0">{children}</div>
      </main>

      <ImportModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} />
    </div>
  );
}
