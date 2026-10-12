import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { net } from "./net.ts";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing");

void net.start();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
