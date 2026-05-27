import { useState, FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

export function useRegister() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCallbackUrl = searchParams.get("callbackUrl") ?? "/";
  // P-SEC: Validate callbackUrl to prevent open redirect attacks.
  // Only allow relative paths that start with "/" but not "//" or "/\" (which would be treated as external URLs).
  const callbackUrl =
    rawCallbackUrl.startsWith("/") &&
    !rawCallbackUrl.startsWith("//") &&
    !rawCallbackUrl.startsWith("/\\")
      ? rawCallbackUrl
      : "/";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // 1. Create the account
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setLoading(false);
      setError(data.error ?? t("auth.register.registrationFailed"));
      return;
    }

    // 2. Sign in automatically
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(t("auth.register.autoSignInFailed"));
      router.push("/auth/signin");
      return;
    }

    router.push(callbackUrl);
  }

  async function handleGitHub() {
    await signIn("github", { callbackUrl });
  }

  return {
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    error,
    loading,
    handleSubmit,
    handleGitHub,
  };
}
