import { MODULE_ID } from "../config/constants";

export function registerAutoRollSetting() {
    game.settings.register(MODULE_ID, "autoRoll", {
        name: "Roll automatically",
        hint: "Roll every participant's die as soon as the group roll appears, instead of waiting for each player (or the GM) to click their portrait.",
        scope: "world",
        config: true,
        default: false,
        type: Boolean,
    });
}

export function isAutoRollOn(): boolean {
    return !!game.settings?.get(MODULE_ID, "autoRoll");
}
