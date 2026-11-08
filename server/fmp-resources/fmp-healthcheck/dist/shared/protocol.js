"use strict";
// Wire format between the healthcheck's client and server halves. Touches no global, so both
// halves compile it.
Object.defineProperty(exports, "__esModule", { value: true });
exports.readPong = exports.readPing = exports.HealthEvents = exports.kResourceName = void 0;
exports.kResourceName = "fmp-healthcheck";
exports.HealthEvents = {
    // client -> server
    ping: "healthcheck:ping",
    // server -> one client
    pong: "healthcheck:pong",
};
const asRecord = (payload) => {
    if (typeof payload === "string") {
        try {
            payload = JSON.parse(payload);
        }
        catch {
            return {};
        }
    }
    return typeof payload === "object" && payload !== null ? payload : {};
};
const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
// Client-sent data is untrusted: keep only what we expect, with safe defaults.
const readPing = (payload) => {
    const fields = asRecord(payload);
    return { sentAt: num(fields["sentAt"]), reason: fields["reason"] === "key" ? "key" : "auto" };
};
exports.readPing = readPing;
const readPong = (payload) => {
    const fields = asRecord(payload);
    return {
        sentAt: num(fields["sentAt"]),
        serverUptimeSec: num(fields["serverUptimeSec"]),
        playersOnline: num(fields["playersOnline"]),
        frameworkVersion: typeof fields["frameworkVersion"] === "string" ? fields["frameworkVersion"] : "",
    };
};
exports.readPong = readPong;
