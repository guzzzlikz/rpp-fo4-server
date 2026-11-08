// The staff tools: teleports, items, looks, the clock and the weather. Admins only.

import { AdminLevel, formatForm, formatPoint, parseForm, parseNumber, registerCommands, reply } from "./chat";
import { Places, findPlace, placeSpace, toVector } from "./places";

type OutfitMode = "add" | "replace" | "remove";

const kOutfitModes: Readonly<Record<string, OutfitMode>> = { wear: "add", only: "replace", remove: "remove" };

const formatOutfitPiece = (piece: OutfitPiece): string => (piece.mods.length > 0 ? `${formatForm(piece.form)} [${piece.mods.map(formatForm).join(" ")}]` : formatForm(piece.form));

registerCommands(AdminLevel.admin, {
    // "/tp": lists the places. "/tp <place>": goes there. "/tp <x> <y> <z> [heading]": to that position.
    tp: (player: Player, args: string[]): void => {
        if (args.length === 0) {
            reply(player, `Places: ${Object.keys(Places).join(", ")}`);
            return;
        }
        const place = args.length === 1 ? findPlace(args[0] ?? "") : undefined;
        if (place !== undefined) {
            player.teleport(toVector(place.position), place.heading, placeSpace(place));
            return;
        }
        const [x, y, z, heading]: (number | undefined)[] = args.map(parseNumber);
        if (x === undefined || y === undefined || z === undefined) {
            reply(player, "/tp: expected a place or <x> <y> <z> [heading]");
            return;
        }
        player.teleport(new Vector3(x, y, z), heading);
    },

    // "/kill": kills the sender.
    kill: (player: Player): void => {
        player.kill();
    },

    // "/pa [frame]": gets the sender into power armor, a frame of that furniture or the game's empty one;
    // out of it when they wear one.
    pa: (player: Player, args: string[]): void => {
        if (player.isInPowerArmor) {
            player.exitPowerArmor();
            return;
        }
        const frame = parseForm(args[0]);
        if (args[0] !== undefined && frame === undefined) {
            reply(player, "/pa: expected [frame form ID]");
            return;
        }
        player.enterPowerArmor(frame);
    },

    // "/fire [shots]": has the sender's game fire its drawn weapon.
    fire: (player: Player, args: string[]): void => {
        player.fire(parseNumber(args[0]));
    },

    // "/give <form> [count]": puts an item in the sender's inventory and equips it.
    // "/give <weapon> <ammo> <rounds>": a weapon with rounds of its ammo, drawn.
    give: (player: Player, args: string[]): void => {
        const form = parseForm(args[0]);
        if (form === undefined) {
            reply(player, "/give: expected <form ID in hex> [count] or <weapon> <ammo> <rounds>");
            return;
        }
        const ammo = args.length >= 3 ? parseForm(args[1]) : undefined;
        if (ammo !== undefined) {
            player.giveItem(ammo, parseNumber(args[2]) ?? 100);
        }
        player.giveItem(form, ammo === undefined ? (parseNumber(args[1]) ?? 1) : 1);
        player.equipItem(form);
    },

    // "/look male|female [r g b]": sex and, with the colour, skin tone. "/look hair <form>": the hair.
    // "/look random [seed]": a whole new look. "/look morph [seed]": the face alone. "/look edit": the editor.
    look: (player: Player, args: string[]): void => {
        const [what, ...rest]: string[] = args;
        if (what === "edit") {
            player.openLookEditor();
        } else if (what === "random" || what === "morph") {
            player.randomizeLook(parseNumber(rest[0]), what === "morph");
        } else if (what === "hair") {
            const hair = parseForm(rest[0]);
            if (hair !== undefined) {
                player.setLook({ hair });
            }
        } else if (what === "male" || what === "female") {
            const [r, g, b]: (number | undefined)[] = rest.map(parseNumber);
            const female = what === "female";
            player.setLook(r !== undefined && g !== undefined && b !== undefined ? { female, skinTone: { r, g, b } } : { female });
        } else {
            reply(player, "/look: male|female [r g b], hair <form>, random [seed], morph [seed], edit");
        }
    },

    // "/outfit random [seed]", "/outfit wear|only|remove <armor> [mod...]", "/outfit clear", "/outfit show".
    outfit: (player: Player, args: string[]): void => {
        const [what, ...rest]: string[] = args;
        if (what === "random") {
            player.randomizeOutfit(parseNumber(rest[0]));
            return;
        }
        if (what === "clear") {
            player.setOutfit([]);
            return;
        }
        if (what === "show") {
            const pieces: OutfitPiece[] = player.getOutfit();
            reply(player, pieces.length > 0 ? `Wearing: ${pieces.map(formatOutfitPiece).join(", ")}` : "Wearing nothing");
            return;
        }
        const mode: OutfitMode | undefined = kOutfitModes[what ?? ""];
        const form = parseForm(rest[0]);
        const mods: (number | undefined)[] = rest.slice(1).map(parseForm);
        if (mode === undefined || form === undefined || mods.some((mod: number | undefined): boolean => mod === undefined)) {
            reply(player, "/outfit: random [seed], wear|only|remove <armor> [mod...], clear, show");
            return;
        }
        player.setOutfit([{ form, mods: mods as number[] }], mode);
    },

    // "/time <hour>" or "/time <hh:mm>".
    time: (player: Player, args: string[]): void => {
        const [hours, minutes]: (number | undefined)[] = (args[0] ?? "").split(":").map(parseNumber);
        if (hours === undefined) {
            reply(player, "/time: expected <hour> or <hh:mm>");
            return;
        }
        World.setHour(hours + (minutes ?? 0) / 60);
    },

    // "/timescale <scale>": 0 holds the clock.
    timescale: (player: Player, args: string[]): void => {
        const scale = parseNumber(args[0]);
        if (scale === undefined || scale < 0) {
            reply(player, "/timescale: expected a scale, 0 or more");
            return;
        }
        World.setTimeScale(scale);
    },

    // "/weather <form | default> [force]".
    weather: (player: Player, args: string[]): void => {
        const weather: number | null | undefined = args[0] === "default" ? null : parseForm(args[0]);
        if (weather === undefined) {
            reply(player, "/weather: expected <form ID in hex | default> [force]");
            return;
        }
        World.setWeather(weather, args[1] === "force");
    },

    // "/items": lists every loose item in the world.
    items: (player: Player): void => {
        const items: Item[] = Item.all();
        reply(player, `${items.length} loose items`);
        for (const item of items) {
            reply(player, `${formatForm(item.form)} x${item.count} at ${formatPoint(item.position)}`);
        }
    },

    // "/mines": lists every armed mine. "/mines detonate" sets them all off; "/mines clear" removes them.
    mines: (player: Player, args: string[]): void => {
        const mines: Mine[] = Mine.all();
        const what = args[0];
        if (what === "detonate" || what === "clear") {
            const done = mines.filter((mine: Mine): boolean => (what === "detonate" ? mine.detonate() : mine.remove())).length;
            reply(player, `${what === "detonate" ? "Set off" : "Removed"} ${done} of ${mines.length} mines`);
            return;
        }
        reply(player, `${mines.length} armed mines`);
        for (const mine of mines) {
            reply(player, `${mine.getOwner()?.nickname ?? "?"}'s at ${formatPoint(mine.position)}, radius ${mine.radius.toFixed(0)}`);
        }
    },
});
