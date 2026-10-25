import { getAdapter } from "@/adapters/get-adapter";
import { getGroupRollEditor } from "@/apps/group-roll-editor";
import { Button } from "@/components/ui/button";
import { getRollBreakdown } from "@/utils/roll-breakdown";
import { dehydrateRolls, hydrateRolls } from "@/utils/settings";
import { Plus } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { GroupRollChat } from "../chat-message/group-roll-chat-message";
import { GroupRollCard } from "./group-roll-card";

export const GroupRollManager = () => {
    const persisted = game.settings.get(
        "aeris-bg3-rolls",
        "groupRolls"
    ) as PersistedGroupRoll[];

    const [groupRolls, setGroupRolls] = useState<GroupRoll[]>(
        hydrateRolls(persisted)
    );

    // Aeris Core mounts us in wrapper elements with no height, so a scrolling list has
    // nothing to size against. Stretch those wrappers to fill the window content.
    const rootRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        let el = rootRef.current?.parentElement ?? null;
        while (el && !el.classList.contains("window-content")) {
            el.style.height = "100%";
            el.style.minHeight = "0";
            el = el.parentElement;
        }
        if (el) {
            el.style.overflow = "hidden";
            el.style.padding = "0";
        }
    }, []);

    const updateRolls = (updater: (prev: GroupRoll[]) => GroupRoll[]) => {
        setGroupRolls((prev) => {
            const next = updater(prev);
            game.settings.set(
                "aeris-bg3-rolls",
                "groupRolls",
                dehydrateRolls(next)
            );
            return next;
        });
    };

    const handleCreateRoll = () => {
        const controlled = canvas?.tokens?.controlled ?? [];
        const selected: PendingIndividualRollRequest[] = Array.from(
            new Map(
                controlled
                    .filter((t) => !!t.actor)
                    .map((t) => [
                        t.actor!.uuid,
                        {
                            actor: t.actor!,
                            actorUuid: t.actor!.uuid as ActorUuid,
                            actorName: t.actor?.name ?? "",
                        },
                    ])
            ).values()
        );

        const newRoll: PendingGroupRoll = {
            id: foundry.utils.randomID() as GroupRollId,
            status: "pending",
            rolls: selected,
            img: "/modules/aeris-bg3-rolls/assets/roll_bg_2.webm",
        };

        const GroupRollEditorApp = getGroupRollEditor();

        const app = new GroupRollEditorApp({
            groupRoll: newRoll,
            adapter: getAdapter(),
            onSave: (data: Omit<PendingGroupRoll, "id" | "status">) => {
                updateRolls((prev) => [
                    ...prev,
                    { id: newRoll.id, ...data, status: "pending" },
                ]);
                app.close();
            },
            onCancel: () => app.close(),
        });
        app.render(true);
    };

    const handleEditRoll = (roll: PendingGroupRoll) => {
        const GroupRollEditorApp = getGroupRollEditor();

        const app = new GroupRollEditorApp({
            groupRoll: roll,
            adapter: getAdapter(),
            onSave: (data: Omit<PendingGroupRoll, "id" | "status">) => {
                updateRolls((prev) => {
                    const exists = prev.some((r) => r.id === roll.id);

                    if (exists) {
                        return prev.map((r) => {
                            if (r.id !== roll.id) return r;
                            if (r.status !== "pending") return r;

                            return { ...r, ...data };
                        });
                    } else {
                        return [
                            ...prev,
                            {
                                id: roll.id,
                                ...data,
                                status: "pending" as const,
                            },
                        ];
                    }
                });

                app.close();
            },
            onCancel: () => app.close(),
        });

        app.render(true);
    };

    const handleDeleteRoll = (rollId: string) => {
        updateRolls((prev) => prev.filter((roll) => roll.id !== rollId));
    };

    const handleInitiateRoll = async (
        rollId: string,
        override?: PendingGroupRoll
    ) => {
        const groupRoll =
            override ??
            (groupRolls.find((r) => r.id === rollId) as PendingGroupRoll);
        if (!groupRoll) return;

        if (!groupRoll.rolls.length) {
            ui.notifications?.warn("No participants in this group roll.");
            return;
        }
        if (!groupRoll.rollConfig) {
            ui.notifications?.warn("No roll type configured.");
            return;
        }
        if (groupRoll.status !== "pending") {
            ui.notifications.warn("Cannot initiate this group roll.");
            return;
        }
        const executedRolls = await Promise.all(
            groupRoll.rolls.map(async (req) => {
                const result = await getAdapter().execute({
                    ...req,
                    config: groupRoll.rollConfig!,
                });
                return {
                    actor: req.actor,
                    roll: result! as Roll,
                    advantageMode: 0,
                };
            })
        );

        updateRolls((prev) =>
            prev.map((r) =>
                r.id === rollId
                    ? {
                          ...r,
                          status: "initiated" as const,
                          rolls: executedRolls,
                      }
                    : r
            )
        );

        await aerisBg3Rolls.requestGroupRoll({
            id: groupRoll.id,
            rolls: executedRolls,
            promptHeader: groupRoll.promptHeader ?? "",
            promptSubheader: getAdapter().getLabel(groupRoll.rollConfig),
            img: groupRoll.img,
            targetValue: groupRoll.targetValue,
            status: "initiated",
        });

        await aerisCore.react.createChatMessage<typeof GroupRollChat>(
            "aeris-bg3-rolls.GroupRollChat",
            {
                rolls: executedRolls.map((r) => ({
                    actorName: r.actor.name,
                    total: r.roll.total ?? 0,
                    dice: r.roll.dice.flatMap((die) =>
                        die.results.map((res) => ({
                            value: res.result,
                            kept: !!res.active,
                        }))
                    ),
                    formula: r.roll.formula,
                    // Total minus the kept d20, split into the character's own modifier and
                    // other bonuses (auras, effects, bonus dice), shown separately on the card.
                    ...(() => {
                        const b = getRollBreakdown(r.roll);
                        return {
                            modifier: b.modifier,
                            baseModifier: b.base,
                            baseParts: b.baseParts,
                            bonuses: b.bonuses,
                        };
                    })(),
                })),
                targetValue: groupRoll.targetValue,
                promptHeader: groupRoll.promptHeader,
                promptSubheader: groupRoll.promptSubheader,
                img: groupRoll.img,
            }
        );

        updateRolls((prev) =>
            prev.map((r) => {
                if (r.id !== rollId) return r;
                if (r.status === "initiated") {
                    return { ...r, status: "completed" as const };
                }
                return r;
            })
        );

        // Completed rolls stay in the list so they can be rolled again.
    };

    /** Reset a finished (or stuck) roll to pending with the same settings and roll it again. */
    const handleRollAgain = (roll: GroupRoll) => {
        // A fresh id, so the overlay treats it as a new roll: per-roll state such as the
        // faded-out modifiers from the last reveal is keyed by id and would otherwise carry over.
        const pending: PendingGroupRoll = {
            id: foundry.utils.randomID() as GroupRollId,
            status: "pending",
            promptHeader: roll.promptHeader,
            promptSubheader: roll.promptSubheader,
            targetValue: roll.targetValue,
            img: roll.img,
            rollConfig: roll.rollConfig,
            rolls: roll.rolls
                .filter((r) => !!r.actor)
                .map((r) => ({ actor: r.actor })),
        };
        updateRolls((prev) => prev.map((r) => (r.id === roll.id ? pending : r)));
        void handleInitiateRoll(pending.id, pending);
    };

    const handleSelectTokens = (rollId: string) => {
        ui.notifications?.info(
            "Select tokens on the canvas, then press Enter."
        );

        const onConfirm = (ev: KeyboardEvent) => {
            if (ev.key === "Enter") {
                const controlled = canvas?.tokens?.controlled ?? [];
                const selected: PendingIndividualRollRequest[] = Array.from(
                    new Map(
                        controlled
                            .filter((t) => !!t.actor)
                            .map((t) => [
                                t.actor!.uuid,
                                {
                                    actor: t.actor!!,
                                    actorUuid: t.actor!.uuid as ActorUuid,
                                    actorName: t.actor?.name ?? "",
                                },
                            ])
                    ).values()
                );

                updateRolls((prev) =>
                    prev.map((r) => {
                        if (r.id !== rollId) return r;

                        const existingUuids = new Set(
                            r.rolls.map((rr) => rr.actor.uuid)
                        );
                        const newRolls = selected.filter(
                            (s) => !existingUuids.has(s.actor.uuid)
                        );

                        if (r.status === "pending") {
                            return {
                                ...r,
                                rolls: [...r.rolls, ...newRolls],
                            } satisfies PendingGroupRoll;
                        }

                        return r;
                    })
                );

                window.removeEventListener("keydown", onConfirm);
            }
        };

        window.addEventListener("keydown", onConfirm);
    };

    // Tailwind styles only apply inside .tw. Aeris Core used to add it to the window,
    // but on V14 it doesn't, which left the fields unstyled and invisible.
    // The list scrolls inside the window; the + button sits in a footer below it.
    return (
        <div className="tw" ref={rootRef} style={{ height: "100%" }}>
            <div className="w-full h-full bg-background flex flex-col">
                <div className="flex-1 min-h-0 overflow-y-auto p-2">
                        <div className="p-2 space-y-2">
                            {groupRolls.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-8">
                                    No group rolls yet
                                </p>
                            ) : (
                                groupRolls.map((groupRoll) => {
                                    return (
                                        <GroupRollCard
                                            adapter={getAdapter()}
                                            key={groupRoll.id}
                                            groupRoll={groupRoll}
                                            handleEditRoll={() => {
                                                if (groupRoll.status === "pending")
                                                    handleEditRoll(groupRoll);
                                            }}
                                            handleDeleteRoll={() =>
                                                handleDeleteRoll(groupRoll.id)
                                            }
                                            handleInitiateRoll={() =>
                                                handleInitiateRoll(groupRoll.id)
                                            }
                                            handleRollAgain={() =>
                                                handleRollAgain(groupRoll)
                                            }
                                            handleSelectTokens={() => {
                                                handleSelectTokens(groupRoll.id);
                                            }}
                                            handleRemoveParticipant={(actor) =>
                                                updateRolls((prev) =>
                                                    prev.map((r) => {
                                                        if (r.id !== groupRoll.id)
                                                            return r;

                                                        switch (r.status) {
                                                            case "pending":
                                                                return {
                                                                    ...r,
                                                                    rolls: r.rolls.filter(
                                                                        (rr) =>
                                                                            rr.actor !==
                                                                            actor
                                                                    ),
                                                                } satisfies PendingGroupRoll;
                                                            case "initiated":
                                                                return {
                                                                    ...r,
                                                                    rolls: r.rolls.filter(
                                                                        (rr) =>
                                                                            rr.actor !==
                                                                            actor
                                                                    ),
                                                                } satisfies InitiatedGroupRoll;
                                                            case "completed":
                                                                return {
                                                                    ...r,
                                                                    rolls: r.rolls.filter(
                                                                        (rr) =>
                                                                            rr.actor !==
                                                                            actor
                                                                    ),
                                                                } satisfies CompletedGroupRoll;
                                                        }
                                                    })
                                                )
                                            }
                                        />
                                    );
                                })
                            )}
                        </div>
                </div>
                <div className="shrink-0 p-2 pt-0 flex">
                    <Button
                        onClick={handleCreateRoll}
                        size="icon"
                        variant="outline"
                        className="pointer-events-auto"
                    >
                        <Plus />
                    </Button>
                </div>
            </div>
        </div>
    );
};
