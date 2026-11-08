"use strict";
// The gamemode's own chat box, replacing FMP's native one, whose font and input do not take Cyrillic.
// A web page (ui/chat) lists the lines and takes the typing; T opens it, Enter sends, Esc closes.
//   - Lines the gamemode sends arrive as ChatEvents.line.
//   - Lines from elsewhere (another resource, the server itself) still arrive through FMP's native
//     chatMessage event; its shape is not documented, so it is read loosely and its first one logged.
//   - What the player types goes to the server as ChatEvents.send and is handled there exactly as
//     native chat and /commands are. The two commands the server core answers itself go natively.
//   - The server says which box to use (ChatEvents.mode): staff can switch everyone back to the
//     native one with "chatmode native" in the server console.
// The native box is hidden only once our page has loaded and the mode is "custom". Every step is
// logged to client\logs\FMP.log with a [chat] prefix.
Object.defineProperty(exports, "__esModule", { value: true });
const chat_1 = require("../shared/chat");
const errors_1 = require("../shared/errors");
const kPage = "fw://resources/fmp-gamemode/ui/chat/index.html";
const kOpenKey = "t";
// Under the emote wheel (150) and the login page (200), which covers it until the player is in.
const kZIndex = 100;
const kPageEvents = { ready: "chat:ready", send: "chat:send", blur: "chat:blur", error: "chat:error", line: "chat:line", focus: "chat:focus" };
// Answered by the server core itself (core/server.cpp): they only work through the native chat.
const kNativeCommands = new Set(["invset", "npc"]);
// Lines that arrive before the page has loaded wait here.
const kBacklog = 50;
let view = -1;
let pageReady = false;
let typing = false;
// Until the server says otherwise, ours: it is what the server defaults to.
let mode = "custom";
let loggedNativeShape = false;
const backlog = [];
const ours = () => mode === "custom" && view >= 0 && pageReady;
// Shows ours and hides the native box, or the other way round, as the mode and the page allow.
const applyMode = () => {
    const useOurs = ours();
    Chat.setUIVisible(!useOurs);
    if (view >= 0) {
        if (useOurs) {
            Web.showView(view);
        }
        else {
            typing = false;
            Web.focusView(view, false);
            Web.hideView(view);
        }
    }
    console.log(`[chat] using the ${useOurs ? "gamemode's" : "native"} chat box (mode ${mode}, page ${pageReady ? "loaded" : "not loaded"})`);
};
const show = (line) => {
    if (view >= 0 && pageReady) {
        Web.emit(view, kPageEvents.line, line);
        return;
    }
    backlog.push(line);
    if (backlog.length > kBacklog) {
        backlog.shift();
    }
};
const stopTyping = () => {
    typing = false;
    if (view >= 0) {
        Web.focusView(view, false);
    }
};
const startTyping = () => {
    if (!ours() || typing) {
        return;
    }
    typing = true;
    Web.focusView(view, true);
    Web.emit(view, kPageEvents.focus, { open: true });
};
const send = (raw) => {
    const text = (0, chat_1.cleanChatText)(raw);
    if (text === "") {
        return;
    }
    const command = text.startsWith("/") ? (text.slice(1).split(/\s+/)[0] ?? "").toLowerCase() : "";
    if (kNativeCommands.has(command)) {
        Chat.send(text);
    }
    else {
        Events.emitServer(chat_1.ChatEvents.send, { text });
    }
};
const create = () => {
    const screen = Web.getScreenSize();
    try {
        view = Web.createView(kPage, { width: screen.width, height: screen.height, x: 0, y: 0, zIndex: kZIndex, visible: true, focus: false });
    }
    catch (thrown) {
        console.error(`[chat] could not create the chat box, keeping the native one: ${(0, errors_1.errorMessage)(thrown)}`);
        view = -1;
        return;
    }
    console.log(`[chat] chat box view ${view} created`);
    Web.on(view, kPageEvents.ready, () => {
        pageReady = true;
        console.log("[chat] chat box page loaded");
        for (const line of backlog.splice(0)) {
            Web.emit(view, kPageEvents.line, line);
        }
        applyMode();
    });
    Web.on(view, kPageEvents.send, (payload) => {
        stopTyping();
        if (typeof payload === "string") {
            send(payload);
        }
    });
    Web.on(view, kPageEvents.blur, stopTyping);
    Web.on(view, kPageEvents.error, (payload) => {
        console.error(`[chat] page error: ${String(payload).slice(0, 300)}`);
    });
};
Events.on(chat_1.ChatEvents.line, (payload) => {
    const line = (0, chat_1.readChatLine)(payload);
    if (line !== null) {
        show(line);
    }
});
Events.on(chat_1.ChatEvents.mode, (payload) => {
    mode = (0, chat_1.readChatMode)(payload);
    applyMode();
});
// FMP's own lines: (text), (text, author, color), or one object with the fields; whatever comes.
// The native box shows them itself when it is the one in use.
Events.on("chatMessage", (...args) => {
    if (!loggedNativeShape) {
        loggedNativeShape = true;
        console.log(`[chat] native chatMessage shape: ${JSON.stringify(args).slice(0, 300)}`);
    }
    const [first, second, third] = args;
    const fromObject = (0, chat_1.readChatLine)(first);
    if (fromObject !== null) {
        show(fromObject);
        return;
    }
    if (typeof first === "string") {
        show({ text: first, ...(typeof second === "string" && second !== "" ? { author: second } : {}), ...(typeof third === "number" ? { color: third } : {}) });
    }
});
// While the page has focus it takes the keys itself; this fires only while the game has input.
const bound = Key.bind(kOpenKey, "down", startTyping);
console.log(`[chat] key ${kOpenKey.toUpperCase()} ${bound ? "bound" : "NOT bound"} to the chat box`);
create();
Events.emitServer(chat_1.ChatEvents.hello);
