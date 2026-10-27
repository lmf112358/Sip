import { createContext, useCallback, useContext, useMemo } from "react";
import { zh, type MsgKey } from "./zh";
import { en } from "./en";

export type Lang = "zh" | "en";
export type { MsgKey };

const dicts: Record<Lang, Record<MsgKey, string>> = { zh, en };

export function resolveLang(pref: string): Lang {
  if (pref === "zh" || pref === "en") return pref;
  const nav =
    typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "zh";
  return nav.startsWith("zh") ? "zh" : "en";
}

type Ctx = {
  lang: Lang;
  t: (k: MsgKey, vars?: Record<string, string | number>) => string;
};

const I18nCtx = createContext<Ctx>({
  lang: "zh",
  t: (k) => zh[k],
});

export function I18nProvider({
  language,
  children,
}: {
  language: string;
  children: React.ReactNode;
}) {
  const lang = resolveLang(language);
  const t = useCallback(
    (k: MsgKey, vars?: Record<string, string | number>) => {
      let s: string = dicts[lang][k] ?? zh[k] ?? k;
      if (vars) {
        for (const [key, v] of Object.entries(vars)) {
          s = s.split(`{${key}}`).join(String(v));
        }
      }
      return s;
    },
    [lang]
  );
  const value = useMemo(() => ({ lang, t }), [lang, t]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useT() {
  return useContext(I18nCtx);
}
