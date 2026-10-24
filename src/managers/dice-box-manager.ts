import { Dice3D, DiceBox, DiceFactory, DSNMesh } from "@/types/dsn";
import { faceQuats, getDice3d, getFaceQuaternion } from "@/utils/dsn";

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
            this.box.setScene({
                width: canvasContainer.clientWidth,
                height: canvasContainer.clientHeight,
            });

            this.box.renderScene();
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

            this.box!.scene.add(dicemesh);
            this.box!.diceList.push(dicemesh);

            this.meshes.set(id, dicemesh);
            this.pending.delete(id);

            this.box!.renderScene();
            return dicemesh;
        })();

        this.pending.set(id, p);
        return p;
    }

    updatePosition(id: string, pos: { x: number; y: number }) {
        const mesh = this.meshes.get(id);
        if (mesh) {
            mesh.position.set(pos.x, pos.y, 0);
            this.box?.renderScene();
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
        this.box.scene.remove(mesh);
        this.box.diceList = this.box.diceList.filter((m) => m !== mesh);
        this.meshes.delete(id);
        this.box.renderScene();
    }

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
            this.box.renderScene();

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
            this.box?.renderScene(); // final render snap
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

    // Last resort: the user's saved Dice So Nice appearance on top of the defaults
    let defaults: any = { global: {} };
    try {
        defaults = ctor?.DEFAULT_APPEARANCE?.(user) ?? defaults;
    } catch {
        // keep the empty default
    }
    const flag = (user as any)?.getFlag?.("dice-so-nice", "appearance");
    if (flag || ctor?.DEFAULT_APPEARANCE) {
        return foundry.utils.mergeObject(defaults, flag ?? {}, { inplace: false });
    }

    // Nothing worked: say what this Dice So Nice version does offer, so it can be wired up
    const offered = (obj: any) =>
        obj
            ? Object.getOwnPropertyNames(obj)
                  .filter((n) => /appear|custom|config|setting/i.test(n))
                  .join(", ") || "none"
            : "n/a";
    throw new Error(
        `can't read the Dice So Nice appearance. Dice3D offers: ${offered(ctor)}; ` +
            `dice3d offers: ${offered(dice3d ? Object.getPrototypeOf(dice3d) : null)}`
    );
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
