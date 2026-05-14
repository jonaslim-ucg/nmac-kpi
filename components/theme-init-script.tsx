import Script from "next/script";
import { APP_THEME_STORAGE_KEY } from "@/lib/app-theme";

/** Runs before React; avoids inline `<script>` inside `next-themes` (React 19 rejects that). */
export function ThemeInitScript() {
  const js = `(function(){try{var k=${JSON.stringify(APP_THEME_STORAGE_KEY)};var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark")t="dark";var d=document.documentElement;d.classList.remove("light","dark");d.classList.add(t);d.style.colorScheme=t;}catch(e){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}})();`;
  return <Script id="app-theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: js }} />;
}
