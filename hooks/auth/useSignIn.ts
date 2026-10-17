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
  const [code, setCode] = useState("");
  const [show2fa, setShow2fa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const payload: Record<string, string> = { email, password };
    if (show2fa) payload.code = code;

    const result = await signIn("credentials", {
      ...payload,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      // Auth.js v5 reports `error: "CredentialsSignin"` and puts the custom error class' `code` into
      // `result.code`, so check both.
      const reason = `${result.code ?? ""} ${result.error}`;
      if (reason.includes("2FA_REQUIRED")) {
        setShow2fa(true);
        setError(null);
      } else if (reason.includes("INVALID_2FA_CODE")) {
        setError(t("auth.signIn.invalid2faCode") ?? "Invalid verification code.");
      } else {
        setError(t("auth.signIn.invalidCredentials"));
      }
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
    code,
    setCode,
    show2fa,
    error,
    loading,
    callbackUrl,
    handleSubmit,
    handleGitHub,
  };
}
