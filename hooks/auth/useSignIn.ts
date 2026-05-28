import { useState, FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

export function useSignIn() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCallbackUrl = searchParams.get("callbackUrl") ?? "/";
  const callbackUrl = rawCallbackUrl.startsWith("/") && !rawCallbackUrl.startsWith("//") && !rawCallbackUrl.startsWith("/\\")
    ? rawCallbackUrl
    : "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(t("auth.signIn.invalidCredentials"));
      return;
    }

    router.push(callbackUrl);
  }

  async function handleGitHub() {
    await signIn("github", { callbackUrl });
  }

  return {
    email,
    setEmail,
    password,
    setPassword,
    error,
    loading,
    callbackUrl,
    handleSubmit,
    handleGitHub,
  };
}
