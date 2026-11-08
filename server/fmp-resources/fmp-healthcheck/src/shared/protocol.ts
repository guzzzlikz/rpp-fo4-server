// Wire format between the healthcheck's client and server halves. Touches no global, so both
// halves compile it.

export const kResourceName = "fmp-healthcheck";

export const HealthEvents = {
    // client -> server
    ping: "healthcheck:ping",
    // server -> one client
    pong: "healthcheck:pong",
} as const;

export interface Ping {
    // Client clock when the ping left, echoed back to measure the round trip.
    sentAt: number;
    // Why it was sent: the automatic one after the script loads, or the F9 key.
    reason: "auto" | "key";
}

export interface Pong {
    sentAt: number;
    serverUptimeSec: number;
    playersOnline: number;
    frameworkVersion: string;
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

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

// Client-sent data is untrusted: keep only what we expect, with safe defaults.
export const readPing = (payload: unknown): Ping => {
    const fields = asRecord(payload);
    return { sentAt: num(fields["sentAt"]), reason: fields["reason"] === "key" ? "key" : "auto" };
};

export const readPong = (payload: unknown): Pong => {
    const fields = asRecord(payload);
    return {
        sentAt: num(fields["sentAt"]),
        serverUptimeSec: num(fields["serverUptimeSec"]),
        playersOnline: num(fields["playersOnline"]),
        frameworkVersion: typeof fields["frameworkVersion"] === "string" ? fields["frameworkVersion"] : "",
    };
};
