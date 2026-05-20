/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import Navbar from "./components/Navbar";
import { Toaster } from "sonner";

const Home = lazy(() => import("./pages/Home"));
const Editor = lazy(() => import("./pages/Editor"));
const Profile = lazy(() => import("./pages/Profile"));
const Pro = lazy(() => import("./pages/Pro"));

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <div className="h-screen bg-slate-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 font-sans flex flex-col overflow-hidden transition-colors duration-300">
            <Navbar />
            <main className="flex-1 w-full max-w-[1400px] mx-auto p-4 md:p-6 overflow-y-auto">
              <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-zinc-500">Loading...</div>}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/editor/:id" element={<Editor />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/pro" element={<Pro />} />
                </Routes>
              </Suspense>
            </main>
          </div>
          <Toaster richColors position="top-right" />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
