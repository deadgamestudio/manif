// The lobby portraits' studio page (#126): portraits.html, dev server only.
import { createRoot } from "react-dom/client";
import { Studio } from "./Studio.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing");
createRoot(root).render(<Studio />);
