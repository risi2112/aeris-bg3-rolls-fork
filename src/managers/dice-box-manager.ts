import { Dice3D, DiceBox, DiceFactory, DSNMesh } from "@/types/dsn";
import { faceQuats, getDice3d, getFaceQuaternion } from "@/utils/dsn";
import { Group, Matrix4, Vector3 } from "three";

/**
 * The module's dice layout uses units of half a CSS pixel (e.g. portraits are 128px apart and the
 * dice are spaced 256 units apart; every offset in the animations is doubled).
 */
const CSS_PX_PER_UNIT = 0.5;

/** Radius, in layout units, of a die when we have to size it ourselves (Dice So Nice 6+). */
const DIE_RADIUS_UNITS = 90;

class DiceBoxManager {
    private static _instance: DiceBoxManager;
    private box: DiceBox | null = null;
    private factory: DiceFactory | null = null;
    private meshes: Map<string, DSNMesh> = new Map();

    static get instance() {
        if (!DiceBoxManager._instance) {
            DiceBoxManager._instance = new DiceBoxManager();
        }
        return DiceBoxManager._instance;
    }

    private container: HTMLElement | null = null;
    private initPromise: Promise<void> | null = null;
    private waitingForDsn = false;
    private lastError: string | null = null;

    async init(canvasContainer: HTMLElement) {
        this.container = canvasContainer;
        if (this.box) return;
        if (this.initPromise) return this.initPromise;

        // Our "ready" hook can run before Dice So Nice has built game.dice3d (modules load
        // alphabetically, and "aeris" comes before "dice-so-nice"). If it isn't there yet,
        // try again once Dice So Nice says it's ready, or when a die is first needed.
        if (!getDice3d()?.box?.dicefactory) {
            if (!this.waitingForDsn) {
                this.waitingForDsn = true;
                Hooks.once("diceSoNiceReady" as any, () => {
                    this.waitingForDsn = false;
                    if (this.container) void this.init(this.container);
                });
            }
            return;
        }

        this.initPromise = this.tryInit(canvasContainer).finally(() => {
            this.initPromise = null;
        });
        return this.initPromise;
    }

    private async tryInit(canvasContainer: HTMLElement) {
        try {
            await this._init(canvasContainer);
        } catch (err) {
            this.box = null;
            this.factory = null;
            this.lastError = (err as Error)?.message ?? String(err);
            console.error(
                "aeris-bg3-rolls | Could not set up the Dice So Nice dice box",
                err
            );
        }
    }

    private async _init(canvasContainer: HTMLElement) {

        const DiceBoxCtor = getDice3d().box.constructor;
        const DiceFactoryCtor = getDice3d().box.dicefactory.constructor;
        //@ts-expect-error
        this.factory = new DiceFactoryCtor();

        const config = foundry.utils.deepClone(getDice3d().box.config);
        config.scale = 75;
        config.autoscale = false;
        config.boxType = "shared-dice-box";

        //@ts-expect-error
        this.box = new DiceBoxCtor(
            canvasContainer,
            this.factory,
            config
        ) as DiceBox;
        await this.box.initialize();

        // attach resize observer
        const resize = () => {
            if (!this.box) return;
            (this.box as any).setScene?.({
                width: canvasContainer.clientWidth,
                height: canvasContainer.clientHeight,
            });

            this.updateRig();
            this.render();
        };

        window.addEventListener("resize", resize);

        const observer = new ResizeObserver(resize);
        observer.observe(canvasContainer);
    }

    private pending: Map<string, Promise<DSNMesh>> = new Map();

    async spawnDie(
        id: string,
        type: keyof typeof faceQuats,
        user: User,
        pos: { x: number; y: number }
    ) {
        if (!this.box && this.container) await this.init(this.container);
        if (!this.box) {
            const dice3d = getDice3d() as any;
            throw new Error(
                this.lastError
                    ? `dice box setup failed: ${this.lastError}`
                    : `dice box not ready (game.dice3d ${dice3d ? "found" : "missing"}, ` +
                          `box ${dice3d?.box ? "found" : "missing"}, ` +
                          `dicefactory ${dice3d?.box?.dicefactory ? "found" : "missing"}, ` +
                          `canvas ${this.container ? "mounted" : "not mounted"})`
            );
        }
        if (!this.factory) throw new Error("Factory not initialized");
        if (this.meshes.has(id) || this.pending.has(id)) return;

        const p = (async () => {
            const appearance = getAppearance(user, type, this.factory!);
            const dicemesh = (await this.factory!.create(
                this.box!.renderer.scopedTextureCache,
                type,
                appearance
            )) as DSNMesh;

            if (dicemesh.material) {
                if (Array.isArray(dicemesh.material)) {
                    dicemesh.material = dicemesh.material.map((m) => m.clone());
                } else {
                    dicemesh.material = dicemesh.material.clone();
                }
            }

            dicemesh.notation = { type };
            dicemesh.quaternion.copy(getFaceQuaternion(type, 1));
            dicemesh.result = 1;
            dicemesh.position.set(pos.x, pos.y, 0);

            const rig = this.ensureRig();
            if (rig) {
                // Dice So Nice 6 builds dice in its own units; size them in screen pixels
                const geometry = (dicemesh as any).geometry;
                geometry?.computeBoundingSphere?.();
                const radius = geometry?.boundingSphere?.radius;
                if (radius > 0) dicemesh.scale.setScalar(DIE_RADIUS_UNITS / radius);
                rig.add(dicemesh);
            } else {
                this.box!.scene.add(dicemesh);
            }
            // Newer Dice So Nice boxes no longer keep a diceList array
            const diceList = (this.box as any).diceList;
            if (Array.isArray(diceList)) diceList.push(dicemesh);

            this.meshes.set(id, dicemesh);
            this.pending.delete(id);

            this.render();
            return dicemesh;
        })();

        this.pending.set(id, p);
        return p;
    }

    updatePosition(id: string, pos: { x: number; y: number }) {
        const mesh = this.meshes.get(id);
        if (mesh) {
            mesh.position.set(pos.x, pos.y, 0);
            this.render();
        }
    }

    async removeDie(id: string) {
        if (this.pending.has(id)) {
            try {
                const mesh = await this.pending.get(id)!;
                this.pending.delete(id);
                this._actuallyRemoveDie(id, mesh);
            } catch {
                this.pending.delete(id);
            }
            return;
        }

        const mesh = this.meshes.get(id);
        if (mesh) {
            this._actuallyRemoveDie(id, mesh);
        }
    }

    private _actuallyRemoveDie(id: string, mesh: DSNMesh) {
        if (!this.box) return;
        (mesh as any).parent?.remove(mesh);
        const diceList = (this.box as any).diceList;
        if (Array.isArray(diceList)) {
            (this.box as any).diceList = diceList.filter((m: DSNMesh) => m !== mesh);
        }
        this.meshes.delete(id);
        this.render();
    }

    /**
     * The module lays dice out in screen pixels, relative to the centre of the screen, with +y up
     * and the camera looking down -z. That matched older Dice So Nice. Dice So Nice 6 works in
     * metres with a camera looking straight down at the table, so dice placed in pixels ended up
     * far outside the view. The "rig" is a group that converts between the two: its children keep
     * using pixel coordinates and pixel-space rotations, and the group's transform maps them onto
     * the plane under Dice So Nice's camera.
     */
    private rig: Group | null = null;

    private usesMetricCamera(): boolean {
        const camera = (this.box as any)?.camera;
        return !!camera && typeof camera.far === "number" && camera.far < 1000;
    }

    private ensureRig(): Group | null {
        if (!this.box || !this.usesMetricCamera()) return null;
        if (!this.rig) {
            this.rig = new Group();
            this.rig.name = "aeris-bg3-rolls-rig";
            (this.box as any).scene.add(this.rig);
        }
        this.updateRig();
        return this.rig;
    }

    private updateRig() {
        const box = this.box as any;
        const camera = box?.camera;
        if (!this.rig || !camera) return;
        camera.updateMatrixWorld?.(true);

        // Camera axes in world space: right, screen-up, and "towards the viewer"
        const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
        const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
        const toward = new Vector3().setFromMatrixColumn(camera.matrixWorld, 2).normalize();
        const camPos = new Vector3().setFromMatrixPosition(camera.matrixWorld);

        // Put the dice plane where the camera looks at the world origin (the table), but stay
        // within the camera's near/far range.
        const forward = toward.clone().negate();
        let dist = forward.dot(new Vector3().sub(camPos));
        if (!(dist > 0)) dist = (camera.near + camera.far) / 2;
        dist = Math.min(Math.max(dist, camera.near * 4), camera.far * 0.9);

        // Metres per layout unit on that plane
        const heightPx = this.container?.clientHeight || window.innerHeight;
        const fovRad = ((camera.fov ?? 20) * Math.PI) / 180;
        const visibleHeight = 2 * dist * Math.tan(fovRad / 2) / (camera.zoom || 1);
        const metresPerUnit = (visibleHeight / heightPx) * CSS_PX_PER_UNIT;

        // Lift the dice slightly towards the camera so they sit above the table surface
        const centre = camPos
            .clone()
            .add(forward.multiplyScalar(dist - DIE_RADIUS_UNITS * 1.5 * metresPerUnit));

        const basis = new Matrix4().makeBasis(right, up, toward);
        this.rig.quaternion.setFromRotationMatrix(basis);
        this.rig.position.copy(centre);
        this.rig.scale.setScalar(metresPerUnit);
        this.rig.updateMatrixWorld(true);
    }

    /** Draw the dice scene, whichever way this Dice So Nice version supports. */
    private render() {
        const box = this.box as any;
        if (!box) return;
        if (typeof box.renderScene === "function") {
            box.renderScene();
        } else if (box.renderer?.render && box.scene && box.camera) {
            box.renderer.render(box.scene, box.camera);
        } else if (!this.renderWarningShown) {
            this.renderWarningShown = true;
            const keys = new Set<string>();
            for (let o = box; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
                Object.getOwnPropertyNames(o)
                    .filter((n) => /render|camera|scene|draw|animate/i.test(n))
                    .forEach((n) => keys.add(n));
            }
            const msg = `can't draw the dice scene. Dice box offers: ${[...keys].join(", ") || "none"}`;
            console.error(`aeris-bg3-rolls | ${msg}`);
            if (game.user?.isGM) {
                ui.notifications?.warn(`Aeris BG3 Rolls: 3D dice unavailable - ${msg}`, {
                    permanent: true,
                });
            }
        }
    }

    private renderWarningShown = false;

    getDie(id: string): DSNMesh | undefined {
        return this.meshes.get(id);
    }

    getBox(): DiceBox | null {
        return this.box;
    }

    getFactory(): DiceFactory | null {
        return this.factory;
    }

    private activeAnimations = new Set<string>();
    private rafId: number | null = null;

    startAnimating(id: string) {
        this.activeAnimations.add(id);
        if (this.rafId) return; // loop already running

        const loop = () => {
            if (!this.box) return;
            this.render();

            if (this.activeAnimations.size > 0) {
                this.rafId = requestAnimationFrame(loop);
            } else {
                this.rafId = null;
            }
        };

        this.rafId = requestAnimationFrame(loop);
    }

    stopAnimating(id: string) {
        this.activeAnimations.delete(id);
        if (this.activeAnimations.size === 0 && this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
            this.render(); // final render snap
        }
    }
}

export const diceBoxManager = DiceBoxManager.instance;

/**
 * Work out a user's Dice So Nice appearance.
 * Older Dice So Nice versions expose `Dice3D.ALL_CUSTOMIZATION(user, factory)`; newer ones
 * (the ones that run on Foundry V14) no longer have it, so fall back through the other ways
 * Dice So Nice has exposed the same data.
 */
function getUserAppearance(user: User, factory: DiceFactory): any {
    const dice3d = getDice3d() as any;
    const ctor = dice3d?.constructor as any;
    const sources: [string, () => any][] = [
        ["Dice3D.ALL_CUSTOMIZATION", () => ctor?.ALL_CUSTOMIZATION?.(user, factory)?.appearance],
        ["Dice3D.APPEARANCE", () => ctor?.APPEARANCE?.(user)],
        ["dice3d.ALL_CUSTOMIZATION", () => dice3d?.ALL_CUSTOMIZATION?.(user, factory)?.appearance],
        ["dice3d.APPEARANCE", () => dice3d?.APPEARANCE?.(user)],
        ["dice3d.getAppearance", () => dice3d?.getAppearance?.(user)],
    ];
    for (const [, get] of sources) {
        try {
            const appearance = get();
            if (appearance && typeof appearance === "object") return appearance;
        } catch {
            // try the next one
        }
    }

    // The user's saved Dice So Nice appearance (user flag, or any Dice So Nice setting whose
    // key mentions "appearance"), on top of Dice So Nice's defaults or our own.
    let defaults: any = null;
    try {
        defaults = ctor?.DEFAULT_APPEARANCE?.(user) ?? null;
    } catch {
        defaults = null;
    }
    defaults ??= fallbackAppearance(user);

    let saved: any = null;
    try {
        saved = (user as any)?.getFlag?.("dice-so-nice", "appearance") ?? null;
    } catch {
        saved = null;
    }
    if (!saved) {
        try {
            for (const key of game.settings.settings.keys()) {
                if (!key.startsWith("dice-so-nice.") || !/appearance/i.test(key)) continue;
                const value = game.settings.get(
                    "dice-so-nice" as any,
                    key.slice("dice-so-nice.".length) as any
                ) as any;
                if (value && typeof value === "object") {
                    saved = value[user.id] ?? value;
                    break;
                }
            }
        } catch {
            saved = null;
        }
    }

    if (!appearanceDiagnosticsLogged) {
        appearanceDiagnosticsLogged = true;
        console.info("aeris-bg3-rolls | Dice So Nice appearance fallback", {
            dice3dStatics: ctor ? Object.getOwnPropertyNames(ctor) : null,
            dsnSettings: Array.from(game.settings.settings.keys()).filter((k) =>
                k.startsWith("dice-so-nice.")
            ),
            dsnUserFlags: Object.keys((user as any)?.flags?.["dice-so-nice"] ?? {}),
            usedSavedAppearance: !!saved,
        });
    }

    return foundry.utils.mergeObject(defaults, saved ?? {}, { inplace: false });
}

let appearanceDiagnosticsLogged = false;

/** A plain Dice So Nice appearance in the player's colour, used when nothing else is available. */
function fallbackAppearance(user: User): any {
    const color = (user as any)?.color?.css ?? String((user as any)?.color ?? "#2b2b2b");
    return {
        global: {
            labelColor: "#ffffff",
            diceColor: color,
            outlineColor: "#000000",
            edgeColor: color,
            texture: "none",
            material: "auto",
            font: "auto",
            colorset: "custom",
            system: "standard",
        },
    };
}

export function getAppearance(
    user: User,
    type: keyof typeof faceQuats,
    factory: DiceFactory
) {
    const appearance = getUserAppearance(user, factory);
    if (typeof (factory as any).getAppearanceForDice === "function") {
        return factory.getAppearanceForDice(appearance, type);
    }
    // Newer versions may have dropped the per-die helper: merge the die's own settings over global
    return foundry.utils.mergeObject(
        appearance.global ?? {},
        appearance[type] ?? {},
        { inplace: false }
    );
}
