import { createRoot } from "react-dom/client";
import "@/styles/global.css";
import { ToastView } from "@/views/ToastView";

document.body.style.background = "transparent";
document.documentElement.style.background = "transparent";

createRoot(document.getElementById("root")!).render(<ToastView />);
