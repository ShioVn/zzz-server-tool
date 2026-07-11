// Centralized configuration for Remielle bridge defaults.
export const DEFAULT_PLAYER_UID = "666";
export const SERVER_PORT = 20501;
export const SERVER_BASENAME = "zzzsrv";
export const SERVER_PID_FILENAME = `${SERVER_BASENAME}_pid.txt`;
export const SERVER_BAT_FILENAME = `${SERVER_BASENAME}.bat`;
export const SERVER_START_SCRIPT = `${SERVER_BASENAME}_start.ps1`;
// Path relative to server root for the encoded player bin (use POSIX-style segments)
export const BIN_REL = "Persistent/LocalStorage/USD_666.bin";
