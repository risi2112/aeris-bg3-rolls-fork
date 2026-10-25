/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RollBonus {
    value: number;
    label: string;
}

export interface RollBreakdown {
    /** Sum of the kept results of the main d20 */
    kept: number;
    /** The character's own modifier: ability, proficiency and other plain numbers */
    base: number;
    /** The pieces of the base modifier, e.g. DEX +3, PB +3 */
    baseParts: RollBonus[];
    /** Everything else: bonus dice (e.g. Bless) and bonuses added as formulas (e.g. auras, effects) */
    bonuses: RollBonus[];
    /** base + all bonuses, i.e. total minus the kept d20 */
    modifier: number;
}

/**
 * Split an evaluated d20 roll into the die, the character's modifier, and any other bonuses.
 * Plain numbers count as the character's modifier; bonus dice and formula terms (which is how
 * auras and most active effects end up in the roll) are listed separately.
 */
export function getRollBreakdown(roll: Roll): RollBreakdown {
    const terms = (roll as any).terms ?? [];
    const { DiceTerm, NumericTerm, OperatorTerm } = foundry.dice.terms as any;

    const mainIndex = terms.findIndex(
        (t: any) => t instanceof DiceTerm && t.faces === 20
    );
    const main = mainIndex >= 0 ? terms[mainIndex] : (roll as any).dice?.[0];
    const kept = (main?.results ?? [])
        .filter((r: any) => r.active !== false && !r.discarded)
        .reduce((sum: number, r: any) => sum + (r.result ?? 0), 0);

    let base = 0;
    const baseParts: RollBonus[] = [];
    const bonuses: RollBonus[] = [];
    const isCharacterFlavor = characterFlavorTest();
    let sign = 1;
    terms.forEach((term: any, index: number) => {
        if (term instanceof OperatorTerm) {
            sign = term.operator === "-" ? -1 : 1;
            return;
        }
        if (index === mainIndex) return;
        const value = Number(term.total ?? term.number ?? 0) * sign;
        sign = 1;
        if (!value) return;
        const flavor: string | undefined = term.flavor || term.options?.flavor;
        // dnd5e labels its terms, e.g. 3[DEX] 3[PB] 4[Bonus]: ability and proficiency
        // count as the character's modifier, anything else is a bonus
        if (term instanceof NumericTerm && (!flavor || isCharacterFlavor(flavor))) {
            base += value;
            baseParts.push({ value, label: flavor ?? "" });
        } else {
            bonuses.push({
                value,
                label: flavor || (term instanceof DiceTerm ? term.formula : "bonus"),
            });
        }
    });

    const total = Number((roll as any).total ?? 0);
    const accounted = kept + base + bonuses.reduce((s, b) => s + b.value, 0);
    const rest = total - accounted;
    if (rest) bonuses.push({ value: rest, label: "bonus" });

    return { kept, base, baseParts, bonuses, modifier: total - kept };
}

/** Flavors that belong to the character's own modifier: ability scores and proficiency. */
function characterFlavorTest(): (flavor: string) => boolean {
    const names = new Set(["pb", "prof", "proficiency", "mod", "ability"]);
    const abilities = (CONFIG as any).DND5E?.abilities ?? {};
    for (const [key, cfg] of Object.entries<any>(abilities)) {
        names.add(key.toLowerCase());
        if (cfg?.abbreviation) names.add(String(game.i18n.localize(cfg.abbreviation)).toLowerCase());
        if (cfg?.label) names.add(String(game.i18n.localize(cfg.label)).toLowerCase());
    }
    return (flavor) => names.has(flavor.trim().toLowerCase());
}

/** "+3", "-1" */
export function signed(n: number): string {
    return n < 0 ? `${n}` : `+${n}`;
}
