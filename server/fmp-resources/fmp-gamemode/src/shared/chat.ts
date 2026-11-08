// The gamemode's own chat, replacing FMP's native chat box, whose font and input do not take Cyrillic.
// Lines travel as JSON in script events, which keep any Unicode text intact; the box is a web page
// (ui/chat), which types and draws any script.
//
//   client -> server  send   ChatSend: a line the player typed, speech or a /command
//                     hello  the client's chat is up: which box to use?
//   server -> client  line   ChatLine: a line to show
//                     mode   ChatMode: which box to use; also broadcast when staff switch it

export const ChatEvents = {
    send: "rp:chat:send",
    line: "rp:chat:line",
    hello: "rp:chat:hello",
    mode: "rp:chat:mode",
} as const;

// "custom": the gamemode's box (ui/chat). "native": FMP's own, as a way back should ours misbehave;
// it does not take Cyrillic.
export type ChatModeName = "custom" | "native";

export interface ChatMode {
    mode: ChatModeName;
}

export const readChatMode = (payload: unknown): ChatModeName => (asRecord(payload)["mode"] === "native" ? "native" : "custom");

export const kChatMaxLength = 200;

export interface ChatSend {
    text: string;
}

export interface ChatLine {
    text: string;
    // Packed 0xRRGGBBAA; the page's default when left out.
    color?: number;
    author?: string;
}

const asRecord = (payload: unknown): Record<string, unknown> => {
    if (typeof payload === "string") {
        try {
            payload = JSON.parse(payload);
        } catch {
            return {};
        }
    }
    return typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
};

// Control characters out, surrounding space trimmed, length capped. Untrusted: it comes from a client.
export const cleanChatText = (text: string): string =>
    text
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim()
        .slice(0, kChatMaxLength);

export const readChatSend = (payload: unknown): ChatSend => {
    const text: unknown = asRecord(payload)["text"];
    return { text: typeof text === "string" ? cleanChatText(text) : "" };
};

export const readChatLine = (payload: unknown): ChatLine | null => {
    const fields = asRecord(payload);
    const text: unknown = fields["text"];
    if (typeof text !== "string") {
        return null;
    }
    const color: unknown = fields["color"];
    const author: unknown = fields["author"];
    return {
        text,
        ...(typeof color === "number" && Number.isFinite(color) ? { color } : {}),
        ...(typeof author === "string" && author !== "" ? { author } : {}),
    };
};
