"use strict";
// Shared by both halves; touches no scripting global.
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorMessage = void 0;
// The message of anything a catch clause received: an Error's own message, anything else as a string.
const errorMessage = (thrown) => (thrown instanceof Error ? thrown.message : String(thrown));
exports.errorMessage = errorMessage;
