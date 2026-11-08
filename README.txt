Fallout Multiplayer (FMP)

Fallout 4 must be installed through Steam, and the Steam client must be
running. The launcher asks Steam for the install directory, so nothing
here has to be copied into the game folder and the game's own files are
never modified.

  1. Unpack this folder anywhere you like.
  2. Start Steam.
  3. Run client/FMPLauncher.exe.

On the first run the launcher writes FMP_launcher.json next to itself
with the resolved game path. Delete that file to have it detected again.

The launcher updates itself on every start, then restarts; what it did
is in client/.mafiahub/logs/patcher.log. Unpack the archive rather than
copying files out of it, or the update check has nothing to go on.

Logs are written to logs/ next to the launcher.

Needs the Microsoft Visual C++ 2015-2022 x64 redistributable, which the
game itself already installs.

server/ and server-linux/ hold the dedicated server for each platform.
Each carries its own fmp-resources/, and fmp-resources/ at the top of
this folder is the same gamemode on its own, to edit or to upload to a
hosted server. The gamemode ships as TypeScript so you can read and
change it: run `npm ci` and `npm run build` inside
fmp-resources/fmp-gamemode before starting the server, or it answers no
commands.

NPC synchronisation reads the game's own Data folder, which cannot be
redistributed: point the server at yours with the "game_data_path" key
in server.json. Without it the server still runs and players still
connect; NPCs are not synced.
