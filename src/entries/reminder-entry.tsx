import { createRoot } from "react-dom/client";
import "@/styles/global.css";
import { ReminderView } from "@/views/ReminderView";

createRoot(document.getElementById("root")!).render(<ReminderView />);
