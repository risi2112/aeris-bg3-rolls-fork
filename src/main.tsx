import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { api } from "./api/api";
import { GroupRollChat } from "./components/chat-message/group-roll-chat-message";
import "./index.css";
import { registerSettings } from "./settings/_register-settings";
import { setupSocket } from "./socket/_socket";
import { setupGroupRollHooks } from "./stores/group-roll-store";
import { setupSidebarButton } from "./sidebar-button";

// GM button in the right sidebar to open the Group Roll Manager
setupSidebarButton();

Hooks.once("setup", () => {
    setupSocket();
});

Hooks.once("init", () => {
    registerSettings();
});

Hooks.on("aeris-core.registerChatComponents", (entries) => {
    entries.push({
        key: "aeris-bg3-rolls.GroupRollChat",
        component: GroupRollChat,
        reactDom: ReactDOM,
    });
});

Hooks.once("ready", () => {
    const reactRoot = document.createElement("aeris-bg3-rolls-react-root");

    globalThis.aerisBg3Rolls = api;

    const root = ReactDOM.createRoot(document.body.appendChild(reactRoot));
    root.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
});

Hooks.once("ready", () => {
    aerisCore.docs.registerDocsMenu("aeris-bg3-rolls");
});

// The stylesheet is now listed in module.json ("styles"), so Foundry loads it directly.
// Previously it was only added when Aeris Core fired "aeris-core.import-css", which meant the
// overlay rendered unstyled (and effectively invisible) whenever that hook didn't fire.

Hooks.once("ready", () => {
    setupGroupRollHooks();
});
