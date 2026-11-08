// The emote wheel's conversation, compiled into both halves.
//
//   client -> server  list   asks for the emotes this server has
//                     play   EmotePlay: plays one on the sender
//                     stop   back to the stance
//   server -> client  list   EmoteList

export const EmoteEvents = {
    list: "rp:emote:list",
    play: "rp:emote:play",
    stop: "rp:emote:stop",
} as const;

export interface EmoteEntry {
    // The key in emotes.json: what the client sends back.
    name: string;
    // What the wheel shows.
    label: string;
}

export interface EmoteList {
    emotes: EmoteEntry[];
}

export interface EmotePlay {
    name: string;
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

export const readEmotePlay = (payload: unknown): EmotePlay => {
    const name: unknown = asRecord(payload)["name"];
    return { name: typeof name === "string" ? name.toLowerCase().slice(0, 24) : "" };
};

export const readEmoteList = (payload: unknown): EmoteList => {
    const raw: unknown = asRecord(payload)["emotes"];
    const emotes: EmoteEntry[] = Array.isArray(raw)
        ? raw.flatMap((entry: unknown): EmoteEntry[] => {
              const fields = asRecord(entry);
              const name: unknown = fields["name"];
              const label: unknown = fields["label"];
              return typeof name === "string" && typeof label === "string" ? [{ name, label }] : [];
          })
        : [];
    return { emotes };
};
