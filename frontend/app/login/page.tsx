"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { apiGet, apiPost } from "@/lib/api";

type AuthMode = "login" | "register";

type User = {
  id: string;
  email: string;
  is_active: boolean;
};

type AuthResponse = {
  access_token: string;
  token_type: string;
  user: User;
};

const tokenStorageKey = "drug-leaflet-agent-token";

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const savedToken = window.localStorage.getItem(tokenStorageKey);
    if (!savedToken) return;

    setToken(savedToken);
    apiGet<User>("/api/v1/auth/me", savedToken)
      .then(setUser)
      .catch(() => {
        window.localStorage.removeItem(tokenStorageKey);
        setToken(null);
      });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);

    try {
      const response = await apiPost<AuthResponse>(
        `/api/v1/auth/${mode}`,
        { email, password },
      );
      window.localStorage.setItem(tokenStorageKey, response.access_token);
      setToken(response.access_token);
      setUser(response.user);
      setPassword("");
      setStatus(mode === "register" ? "Account created." : "Signed in.");
    } catch {
      setStatus(mode === "register" ? "Registration failed." : "Sign in failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSignOut() {
    window.localStorage.removeItem(tokenStorageKey);
    setToken(null);
    setUser(null);
    setStatus("Signed out.");
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-950 dark:bg-gray-950 dark:text-gray-50">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-brand-600 dark:text-brand-500">
            Drug Leaflet Agent
          </Link>
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white"
          >
            API docs
          </a>
        </header>

        <section className="grid flex-1 items-center gap-10 py-16 md:grid-cols-[1fr_420px]">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-brand-600 dark:text-brand-500">
              Private document workspace
            </p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
              Start with a secure account.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-gray-600 dark:text-gray-300">
              Your uploads, extracted leaflet text, and future chat history will be tied to this user profile.
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            {user && token ? (
              <div className="space-y-6">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Signed in as</p>
                  <p className="mt-1 break-all text-lg font-semibold">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full rounded-md border border-gray-300 px-4 py-2.5 font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 rounded-md bg-gray-100 p-1 dark:bg-gray-800">
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className={`rounded px-3 py-2 text-sm font-medium ${
                      mode === "login"
                        ? "bg-white text-gray-950 shadow-sm dark:bg-gray-950 dark:text-white"
                        : "text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("register")}
                    className={`rounded px-3 py-2 text-sm font-medium ${
                      mode === "register"
                        ? "bg-white text-gray-950 shadow-sm dark:bg-gray-950 dark:text-white"
                        : "text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    Create account
                  </button>
                </div>

                <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
                  <label className="block">
                    <span className="text-sm font-medium">Email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      autoComplete="email"
                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-950 outline-none ring-brand-600 focus:ring-2 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium">Password</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      minLength={8}
                      autoComplete={mode === "register" ? "new-password" : "current-password"}
                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-950 outline-none ring-brand-600 focus:ring-2 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full rounded-md bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSubmitting
                      ? "Working..."
                      : mode === "register"
                        ? "Create account"
                        : "Sign in"}
                  </button>
                </form>
              </>
            )}

            {status ? (
              <p className="mt-5 rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                {status}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
