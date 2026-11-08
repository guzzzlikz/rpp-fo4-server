"use strict";
// The staff tools: teleports, items, looks, the clock and the weather. Admins only.
Object.defineProperty(exports, "__esModule", { value: true });
const chat_1 = require("./chat");
const places_1 = require("./places");
const kOutfitModes = { wear: "add", only: "replace", remove: "remove" };
const formatOutfitPiece = (piece) => (piece.mods.length > 0 ? `${(0, chat_1.formatForm)(piece.form)} [${piece.mods.map(chat_1.formatForm).join(" ")}]` : (0, chat_1.formatForm)(piece.form));
(0, chat_1.registerCommands)(chat_1.AdminLevel.admin, {
    // "/tp": lists the places. "/tp <place>": goes there. "/tp <x> <y> <z> [heading]": to that position.
    tp: (player, args) => {
        if (args.length === 0) {
            (0, chat_1.reply)(player, `Places: ${Object.keys(places_1.Places).join(", ")}`);
            return;
        }
        const place = args.length === 1 ? (0, places_1.findPlace)(args[0] ?? "") : undefined;
        if (place !== undefined) {
            player.teleport((0, places_1.toVector)(place.position), place.heading, (0, places_1.placeSpace)(place));
            return;
        }
        const [x, y, z, heading] = args.map(chat_1.parseNumber);
        if (x === undefined || y === undefined || z === undefined) {
            (0, chat_1.reply)(player, "/tp: expected a place or <x> <y> <z> [heading]");
            return;
        }
        player.teleport(new Vector3(x, y, z), heading);
    },
    // "/kill": kills the sender.
    kill: (player) => {
        player.kill();
    },
    // "/pa [frame]": gets the sender into power armor, a frame of that furniture or the game's empty one;
    // out of it when they wear one.
    pa: (player, args) => {
        if (player.isInPowerArmor) {
            player.exitPowerArmor();
            return;
        }
        const frame = (0, chat_1.parseForm)(args[0]);
        if (args[0] !== undefined && frame === undefined) {
            (0, chat_1.reply)(player, "/pa: expected [frame form ID]");
            return;
        }
        player.enterPowerArmor(frame);
    },
    // "/fire [shots]": has the sender's game fire its drawn weapon.
    fire: (player, args) => {
        player.fire((0, chat_1.parseNumber)(args[0]));
    },
    // "/give <form> [count]": puts an item in the sender's inventory and equips it.
    // "/give <weapon> <ammo> <rounds>": a weapon with rounds of its ammo, drawn.
    give: (player, args) => {
        const form = (0, chat_1.parseForm)(args[0]);
        if (form === undefined) {
            (0, chat_1.reply)(player, "/give: expected <form ID in hex> [count] or <weapon> <ammo> <rounds>");
            return;
        }
        const ammo = args.length >= 3 ? (0, chat_1.parseForm)(args[1]) : undefined;
        if (ammo !== undefined) {
            player.giveItem(ammo, (0, chat_1.parseNumber)(args[2]) ?? 100);
        }
        player.giveItem(form, ammo === undefined ? ((0, chat_1.parseNumber)(args[1]) ?? 1) : 1);
        player.equipItem(form);
    },
    // "/look male|female [r g b]": sex and, with the colour, skin tone. "/look hair <form>": the hair.
    // "/look random [seed]": a whole new look. "/look morph [seed]": the face alone. "/look edit": the editor.
    look: (player, args) => {
        const [what, ...rest] = args;
        if (what === "edit") {
            player.openLookEditor();
        }
        else if (what === "random" || what === "morph") {
            player.randomizeLook((0, chat_1.parseNumber)(rest[0]), what === "morph");
        }
        else if (what === "hair") {
            const hair = (0, chat_1.parseForm)(rest[0]);
            if (hair !== undefined) {
                player.setLook({ hair });
            }
        }
        else if (what === "male" || what === "female") {
            const [r, g, b] = rest.map(chat_1.parseNumber);
            const female = what === "female";
            player.setLook(r !== undefined && g !== undefined && b !== undefined ? { female, skinTone: { r, g, b } } : { female });
        }
        else {
            (0, chat_1.reply)(player, "/look: male|female [r g b], hair <form>, random [seed], morph [seed], edit");
        }
    },
    // "/outfit random [seed]", "/outfit wear|only|remove <armor> [mod...]", "/outfit clear", "/outfit show".
    outfit: (player, args) => {
        const [what, ...rest] = args;
        if (what === "random") {
            player.randomizeOutfit((0, chat_1.parseNumber)(rest[0]));
            return;
        }
        if (what === "clear") {
            player.setOutfit([]);
            return;
        }
        if (what === "show") {
            const pieces = player.getOutfit();
            (0, chat_1.reply)(player, pieces.length > 0 ? `Wearing: ${pieces.map(formatOutfitPiece).join(", ")}` : "Wearing nothing");
            return;
        }
        const mode = kOutfitModes[what ?? ""];
        const form = (0, chat_1.parseForm)(rest[0]);
        const mods = rest.slice(1).map(chat_1.parseForm);
        if (mode === undefined || form === undefined || mods.some((mod) => mod === undefined)) {
            (0, chat_1.reply)(player, "/outfit: random [seed], wear|only|remove <armor> [mod...], clear, show");
            return;
        }
        player.setOutfit([{ form, mods: mods }], mode);
    },
    // "/time <hour>" or "/time <hh:mm>".
    time: (player, args) => {
        const [hours, minutes] = (args[0] ?? "").split(":").map(chat_1.parseNumber);
        if (hours === undefined) {
            (0, chat_1.reply)(player, "/time: expected <hour> or <hh:mm>");
            return;
        }
        World.setHour(hours + (minutes ?? 0) / 60);
    },
    // "/timescale <scale>": 0 holds the clock.
    timescale: (player, args) => {
        const scale = (0, chat_1.parseNumber)(args[0]);
        if (scale === undefined || scale < 0) {
            (0, chat_1.reply)(player, "/timescale: expected a scale, 0 or more");
            return;
        }
        World.setTimeScale(scale);
    },
    // "/weather <form | default> [force]".
    weather: (player, args) => {
        const weather = args[0] === "default" ? null : (0, chat_1.parseForm)(args[0]);
        if (weather === undefined) {
            (0, chat_1.reply)(player, "/weather: expected <form ID in hex | default> [force]");
            return;
        }
        World.setWeather(weather, args[1] === "force");
    },
    // "/items": lists every loose item in the world.
    items: (player) => {
        const items = Item.all();
        (0, chat_1.reply)(player, `${items.length} loose items`);
        for (const item of items) {
            (0, chat_1.reply)(player, `${(0, chat_1.formatForm)(item.form)} x${item.count} at ${(0, chat_1.formatPoint)(item.position)}`);
        }
    },
    // "/mines": lists every armed mine. "/mines detonate" sets them all off; "/mines clear" removes them.
    mines: (player, args) => {
        const mines = Mine.all();
        const what = args[0];
        if (what === "detonate" || what === "clear") {
            const done = mines.filter((mine) => (what === "detonate" ? mine.detonate() : mine.remove())).length;
            (0, chat_1.reply)(player, `${what === "detonate" ? "Set off" : "Removed"} ${done} of ${mines.length} mines`);
            return;
        }
        (0, chat_1.reply)(player, `${mines.length} armed mines`);
        for (const mine of mines) {
            (0, chat_1.reply)(player, `${mine.getOwner()?.nickname ?? "?"}'s at ${(0, chat_1.formatPoint)(mine.position)}, radius ${mine.radius.toFixed(0)}`);
        }
    },
});
