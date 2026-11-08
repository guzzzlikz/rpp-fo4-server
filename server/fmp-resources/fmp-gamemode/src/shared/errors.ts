// Shared by both halves; touches no scripting global.

// The message of anything a catch clause received: an Error's own message, anything else as a string.
export const errorMessage = (thrown: unknown): string => (thrown instanceof Error ? thrown.message : String(thrown));
