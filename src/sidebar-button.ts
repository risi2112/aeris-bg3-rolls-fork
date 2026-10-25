import { api } from "@/api/api";

const BUTTON_ID = "aeris-bg3-rolls-sidebar-button";

/**
 * Add a "Group Roll Manager" button (d20 icon) to the right sidebar's tab strip, for the GM.
 * If the tab strip can't be found (a different Foundry layout), fall back to a tool in the
 * Token controls on the left.
 */
export function setupSidebarButton() {
    Hooks.on("renderSidebar" as any, (_app: unknown, html: HTMLElement) => {
        addSidebarButton(html instanceof HTMLElement ? html : undefined);
    });

    Hooks.once("ready", () => {
        if (!addSidebarButton()) {
            ui.controls?.render?.({ reset: true } as any);
        }
    });

    // Fallback only: used when the sidebar button couldn't be placed
    Hooks.on("getSceneControlButtons", (controls: any) => {
        if (!game.user?.isGM) return;
        if (document.getElementById(BUTTON_ID) || document.querySelector("#sidebar-tabs menu")) return;
        const tokens = controls?.tokens;
        if (!tokens?.tools) return;
        tokens.tools.aerisBg3RollsManager = {
            name: "aerisBg3RollsManager",
            title: "Group Roll Manager",
            icon: "fa-solid fa-dice-d20",
            order: Object.keys(tokens.tools).length,
            button: true,
            visible: true,
            onChange: () => api.openGroupRollManager(),
        };
    });
}

function addSidebarButton(root?: HTMLElement): boolean {
    if (!game.user?.isGM) return true;
    if (document.getElementById(BUTTON_ID)) return true;

    const scope = root ?? document;
    const menu =
        scope.querySelector<HTMLElement>("#sidebar-tabs menu") ??
        document.querySelector<HTMLElement>("#sidebar-tabs menu");
    if (!menu) return false;

    // Copy the look of the existing tab buttons
    const sample = menu.querySelector<HTMLButtonElement>("button[data-tab]");
    const button = document.createElement("button");
    button.type = "button";
    button.id = BUTTON_ID;
    button.className = sample
        ? Array.from(sample.classList)
              .filter((c) => !c.startsWith("fa-") && c !== "active")
              .join(" ")
        : "ui-control plain icon";
    button.classList.add("fa-solid", "fa-dice-d20");
    button.dataset.tooltip = "Group Roll Manager";
    button.setAttribute("aria-label", "Group Roll Manager");
    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        api.openGroupRollManager();
    });

    const item = document.createElement("li");
    item.appendChild(button);

    // Keep the sidebar's collapse toggle last if it lives in the same list
    const toggle = Array.from(menu.children).find((li) =>
        li.querySelector('[data-action="toggleState"], .collapse')
    );
    if (toggle) menu.insertBefore(item, toggle);
    else menu.appendChild(item);
    return true;
}
