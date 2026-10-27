import { createRoot } from "react-dom/client";
import "@/styles/global.css";
import { AppShell } from "@/app/App";
import { StoreProvider } from "@/lib/store";

document.addEventListener("contextmenu", (e) => {
  if (import.meta.env.PROD) e.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <StoreProvider>
    <AppShell />
  </StoreProvider>
);
