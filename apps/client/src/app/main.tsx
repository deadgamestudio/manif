import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { loadSavedName } from "../features/home/index.ts";
import { net, readInviteCode } from "../shared/net/index.ts";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing");

// No connection on page load, with one exception: an invite link opened by a
// player who already has a saved name goes straight into that lobby. Done here,
// outside React, so StrictMode's double effects can't join twice. A first-time
// visitor sees the homepage with the code pre-filled and picks a name first.
const invite = readInviteCode();
const savedName = loadSavedName();
if (invite && savedName) void net.joinLobby(invite, savedName);

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
