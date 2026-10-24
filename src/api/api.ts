import { requestGroupRoll } from "@/api";
import { getGroupRollManager } from "@/apps/group-roll-manager";
import { diagnoseDice } from "@/utils/dice-diagnostics";

export const api = {
    requestGroupRoll,
    /** Show a test die and whisper a dice box report to the GM (troubleshooting). */
    diagnoseDice,
    openGroupRollManager: () => {
        if (!game.user.isGM) return;
        const cls = getGroupRollManager();
        if (cls) {
            //@ts-expect-error abstract (idk why)
            const app = new cls();
            app.render({ force: true });
        }
    },
};
