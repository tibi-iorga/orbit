"use client";

import { Suspense, useEffect, useState } from "react";
import { getProviders, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

type ProviderMap = Awaited<ReturnType<typeof getProviders>>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/feedback";
  const [providers, setProviders] = useState<ProviderMap | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getProviders().then(setProviders).catch(() => setProviders(null));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  const oauthProviders = Object.values(providers ?? {}).filter((p) => p.id !== "credentials");
  const hasCredentials = Boolean(providers?.credentials);

  return (
    <div className="w-full max-w-sm p-6 bg-white shadow rounded border border-gray-200">
      <h1 className="text-lg font-semibold text-gray-900 mb-4">Sign in</h1>

      <div className="space-y-2 mb-4">
        {oauthProviders.map((provider) => (
          <button
            key={provider.id}
            type="button"
            onClick={() => signIn(provider.id, { callbackUrl })}
            className="w-full py-2 px-3 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50"
          >
            Continue with {provider.name}
          </button>
        ))}
      </div>

      {hasCredentials && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            className="w-full py-2 px-3 bg-gray-900 text-white text-sm font-medium rounded hover:bg-gray-800"
          >
            Sign in with password
          </button>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Suspense fallback={<div className="w-full max-w-sm p-6 bg-white shadow rounded border border-gray-200">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
