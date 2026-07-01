/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { VotesProvider } from "./contexts/VotesContext";
import Navbar from "./components/Navbar";
import { Toaster } from "sonner";

const Home = lazy(() => import("./pages/Home"));
const Editor = lazy(() => import("./pages/Editor"));
const Profile = lazy(() => import("./pages/Profile"));

const LoadingSkeleton = () => (
  <div className="w-full h-full">
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 mt-6">
      {[...Array(15)].map((_, i) => (
        <div
          key={i}
          className="aspect-square bg-zinc-900 rounded-3xl animate-pulse border border-white/5"
        ></div>
      ))}
    </div>
  </div>
);

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <VotesProvider>
          <BrowserRouter>
            <div className="h-screen bg-slate-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 font-sans flex flex-col overflow-hidden transition-colors duration-300">
              <Navbar />
              <main id="main-scroll-container" className="flex-1 w-full max-w-[1400px] mx-auto p-4 md:p-6 overflow-y-auto">
                <Suspense fallback={<LoadingSkeleton />}>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/editor/:id" element={<Editor />} />
                    <Route path="/profile" element={<Profile />} />
                  </Routes>
                </Suspense>
              </main>
            </div>
            <Toaster richColors position="top-right" />
          </BrowserRouter>
        </VotesProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
