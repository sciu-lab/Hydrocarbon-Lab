import type { AppLanguage } from "../i18n";
import Home from "../page";

export default async function LanguagePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const initialLanguage: AppLanguage = lang === "en" ? "en" : "es";
  return <Home initialLanguage={initialLanguage} />;
}
