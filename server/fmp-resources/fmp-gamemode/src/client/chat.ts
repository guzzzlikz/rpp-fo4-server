// The gamemode's own chat box, replacing FMP's native one, whose font and input do not take Cyrillic.
// A web page (ui/chat) lists the lines and takes the typing; T opens it, Enter sends, Esc closes.
//   - Lines the gamemode sends arrive as ChatEvents.line.
//   - Lines from elsewhere (another resource, the server itself) still arrive through FMP's native
//     chatMessage event; its shape is not documented, so it is read loosely and its first one logged.
//   - What the player types goes to the server as ChatEvents.send and is handled there exactly as
//     native chat and /commands are. The two commands the server core answers itself go natively.
// Should the page fail to load, the native chat stays as it was.

import { AuthEvents } from "../shared/auth";
import { ChatEvents, type ChatLine, cleanChatText, readChatLine } from "../shared/chat";
import { errorMessage } from "../shared/errors";

const kPage = "fw://resources/fmp-gamemode/ui/chat/index.html";
const kOpenKey = "t";
// Under the emote wheel (150) and the login page (200).
const kZIndex = 100;
const kPageEvents = { ready: "chat:ready", send: "chat:send", blur: "chat:blur", line: "chat:line", focus: "chat:focus", visible: "chat:visible" } as const;
// Answered by the server core itself (core/server.cpp): they only work through the native chat.
const kNativeCommands: ReadonlySet<string> = new Set(["invset", "npc"]);
// Lines that arrive before the page has loaded wait here.
const kBacklog = 50;

let view = -1;
let pageReady = false;
let typing = false;
let loggedIn = false;
let loggedNativeShape = false;
const backlog: ChatLine[] = [];

const show = (line: ChatLine): void => {
    if (view >= 0 && pageReady) {
        Web.emit(view, kPageEvents.line, line);
        return;
    }
    backlog.push(line);
    if (backlog.length > kBacklog) {
        backlog.shift();
    }
};

const stopTyping = (): void => {
    typing = false;
    if (view >= 0) {
        Web.focusView(view, false);
    }
};

const startTyping = (): void => {
    if (view < 0 || !pageReady || typing || !loggedIn) {
        return;
    }
    typing = true;
    Web.focusView(view, true);
    Web.emit(view, kPageEvents.focus, null);
};

const send = (raw: string): void => {
    const text: string = cleanChatText(raw);
    if (text === "") {
        return;
    }
    const command: string = text.startsWith("/") ? (text.slice(1).split(/\s+/)[0] ?? "").toLowerCase() : "";
    if (kNativeCommands.has(command)) {
        Chat.send(text);
    } else {
        Events.emitServer(ChatEvents.send, { text });
    }
};

const create = (): void => {
    const screen: { width: number; height: number } = Web.getScreenSize();
    try {
        view = Web.createView(kPage, { width: screen.width, height: screen.height, x: 0, y: 0, zIndex: kZIndex, visible: true, focus: false });
    } catch (thrown: unknown) {
        console.error(`[chat] could not create the chat box, keeping the native one: ${errorMessage(thrown)}`);
        view = -1;
        return;
    }
    Web.on(view, kPageEvents.ready, (): void => {
        pageReady = true;
        // Only now that ours works is the native box put away.
        Chat.setUIVisible(false);
        console.log("[chat] chat box loaded; native chat hidden");
        Web.emit(view, kPageEvents.visible, loggedIn);
        for (const line of backlog.splice(0)) {
            Web.emit(view, kPageEvents.line, line);
        }
    });
    Web.on(view, kPageEvents.send, (payload?: unknown): void => {
        stopTyping();
        if (typeof payload === "string") {
            send(payload);
        }
    });
    Web.on(view, kPageEvents.blur, stopTyping);
};

Events.on(ChatEvents.line, (payload: unknown): void => {
    const line: ChatLine | null = readChatLine(payload);
    if (line !== null) {
        show(line);
    }
});

// FMP's own lines: (text), (text, author, color), or one object with the fields; whatever comes.
Events.on("chatMessage", (...args: unknown[]): void => {
    if (!loggedNativeShape) {
        loggedNativeShape = true;
        console.log(`[chat] native chatMessage shape: ${JSON.stringify(args).slice(0, 300)}`);
    }
    const [first, second, third] = args;
    const fromObject: ChatLine | null = readChatLine(first);
    if (fromObject !== null) {
        show(fromObject);
        return;
    }
    if (typeof first === "string") {
        show({ text: first, ...(typeof second === "string" && second !== "" ? { author: second } : {}), ...(typeof third === "number" ? { color: third } : {}) });
    }
});

// The box stays empty and closed until the player is somebody: the login page owns the screen before.
Events.on(AuthEvents.done, (): void => {
    loggedIn = true;
    if (view >= 0 && pageReady) {
        Web.emit(view, kPageEvents.visible, true);
    }
});

// While the page has focus it takes the keys itself; this fires only while the game has input.
Key.bind(kOpenKey, "down", startTyping);

create();
