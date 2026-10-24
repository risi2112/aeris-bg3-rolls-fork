/* eslint-disable @typescript-eslint/no-explicit-any */
import { diceBoxManager } from "@/managers/dice-box-manager";
import { useRollStore } from "@/stores/group-roll-store";
import { getDice3d } from "@/utils/dsn";
import { sleep } from "@/utils/general";

/**
 * Spawn a test die in the middle of the screen for a few seconds and post a report about the
 * Dice So Nice dice box to chat (whispered to the GM). Used to work out why dice don't show
 * on a given Dice So Nice version. Run it from a macro: `aerisBg3Rolls.diagnoseDice()`.
 */
export async function diagnoseDice(): Promise<string> {
    const lines: string[] = [];
    const add = (label: string, value: unknown) => {
        let text: string;
        try {
            text = typeof value === "string" ? value : JSON.stringify(value);
        } catch {
            text = String(value);
        }
        lines.push(`${label}: ${text}`);
    };
    const safe = (fn: () => unknown) => {
        try {
            return fn();
        } catch (err) {
            return `error: ${(err as Error)?.message ?? err}`;
        }
    };
    const round = (n: unknown) => (typeof n === "number" ? Math.round(n * 100) / 100 : n);
    const vec = (v: any) => (v ? [round(v.x), round(v.y), round(v.z)] : null);

    add("Foundry", game.version);
    add("Dice So Nice", game.modules.get("dice-so-nice")?.version ?? "not active");
    const dice3d = getDice3d() as any;
    add("game.dice3d", dice3d ? dice3d.constructor?.name ?? "object" : "missing");
    add(
        "DSN box keys",
        safe(() => Object.keys(dice3d?.box ?? {}).slice(0, 60))
    );

    // Spawn a test die in the middle of the screen
    let spawnError: string | null = null;
    try {
        await diceBoxManager.spawnDie("aeris-diagnostic", "d20", game.user!, { x: 0, y: 0 });
    } catch (err) {
        spawnError = (err as Error)?.message ?? String(err);
    }
    add("spawn test die", spawnError ?? "ok");

    useRollStore.getState().setCanvasVisible(true);
    const mesh = diceBoxManager.getDie("aeris-diagnostic") as any;
    if (mesh) {
        // make sure it is fully opaque for the test
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            if (m && "opacity" in m) m.opacity = 1;
        }
        diceBoxManager.startAnimating("aeris-diagnostic");
    }
    await sleep(300);

    const box = diceBoxManager.getBox() as any;
    add("our box", box ? box.constructor?.name ?? "object" : "missing");
    if (box) {
        add("our box keys", safe(() => Object.keys(box).slice(0, 60)));
        add("renderScene", typeof box.renderScene);
        add("renderer", safe(() => box.renderer?.constructor?.name));
        add("renderer keys", safe(() => Object.keys(box.renderer ?? {}).slice(0, 40)));
        add("camera", safe(() => ({
            type: box.camera?.type,
            pos: vec(box.camera?.position),
            fov: round(box.camera?.fov),
            zoom: round(box.camera?.zoom),
            near: round(box.camera?.near),
            far: round(box.camera?.far),
        })));
        add("scene children", safe(() => box.scene?.children?.length));
        add("config", safe(() => ({
            scale: box.config?.scale,
            boxType: box.config?.boxType,
            autoscale: box.config?.autoscale,
        })));
        add("display", safe(() => ({
            w: box.display?.currentWidth ?? box.currentWidth,
            h: box.display?.currentHeight ?? box.currentHeight,
        })));
    }

    const container = document.getElementById("dice-canvas");
    add("#dice-canvas", safe(() => container
        ? {
              w: container.clientWidth,
              h: container.clientHeight,
              visibility: getComputedStyle(container).visibility,
              children: Array.from(container.children).map((c) => c.tagName.toLowerCase()),
          }
        : "missing"));

    const rendererCanvas = safe(() => box?.renderer?.domElement) as any;
    add("renderer canvas", safe(() => rendererCanvas instanceof HTMLElement
        ? {
              inOurContainer: !!container?.contains(rendererCanvas),
              parent: rendererCanvas.parentElement
                  ? `${rendererCanvas.parentElement.tagName.toLowerCase()}#${rendererCanvas.parentElement.id}`
                  : "detached",
              size: [rendererCanvas.width, rendererCanvas.height],
              css: [rendererCanvas.clientWidth, rendererCanvas.clientHeight],
              display: getComputedStyle(rendererCanvas).display,
          }
        : String(rendererCanvas)));

    add("all canvases", safe(() =>
        Array.from(document.querySelectorAll("canvas")).map((c) => ({
            id: c.id || undefined,
            cls: c.className || undefined,
            size: [c.width, c.height],
            parent: c.parentElement?.id || c.parentElement?.tagName.toLowerCase(),
        }))
    ));

    if (mesh) {
        add("test die", safe(() => ({
            visible: mesh.visible,
            pos: vec(mesh.position),
            scale: vec(mesh.scale),
            inScene: box?.scene?.children?.includes(mesh),
            material: (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(
                (m: any) => ({ type: m?.type, opacity: round(m?.opacity), visible: m?.visible })
            ),
            geometry: mesh.geometry?.type,
        })));
    }

    const report = lines.join("\n");
    console.info(`aeris-bg3-rolls | Dice diagnostics\n${report}`);

    await ChatMessage.create({
        content: `<p><strong>Aeris BG3 Rolls dice diagnostics</strong></p><pre style="white-space:pre-wrap;font-size:11px">${foundry.utils.escapeHTML?.(report) ?? report.replace(/</g, "&lt;")}</pre>`,
        whisper: game.users!.filter((u) => u.isGM).map((u) => u.id),
    });

    // Leave the die up for a few seconds so it can be seen, then clean up
    await sleep(4000);
    diceBoxManager.stopAnimating("aeris-diagnostic");
    await diceBoxManager.removeDie("aeris-diagnostic");
    useRollStore.getState().setCanvasVisible(false);

    return report;
}
