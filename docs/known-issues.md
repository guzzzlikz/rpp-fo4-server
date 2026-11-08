# Известные проблемы

## fmp-gamemode не стартует на Windows: better-sqlite3

**Симптом** в `server/logs/framework.log`:
```
Failed to start resource fmp-gamemode: Error: A dynamic link library (DLL) initialization routine failed.
...\fmp-gamemode\node_modules\better-sqlite3\build\Release\better_sqlite3.node
```
Без gamemode сервер запускается, но не отвечает на чат-команды и не пускает игроков дальше логина.

**Причина.** Стандартный gamemode хранит аккаунты в SQLite через нативный модуль `better-sqlite3`.
- `npm ci` пытается собрать модуль из исходников и падает без Visual Studio Build Tools.
- У `better-sqlite3` 13.x нет готовых бинарников под Node 25: сервер встраивает Node 25.6.1, ABI 141.
- Готовый бинарник 12.11.1 под ABI 141 скачивается, но внутри `FMPServer.exe` не загружается. Нативные модули Windows ищут функции Node в `node.exe`, а у FMP они лежат в `libnode.dll`.

**Обход.** Пока нет. Варианты:
1. Перевести `fmp-gamemode/src/server/database.ts` на встроенный `node:sqlite` (`DatabaseSync`), без нативных модулей. Это примерно 190 строк, API похож на текущий.
2. Запускать сервер на Linux (`server-linux/`) или в Docker-образе `ghcr.io/fallout-mp/fmp-server`, где нативные модули загружаются нормально (не проверено).
3. Спросить в Discord FMP, как это задумано на Windows.

**Как проверить, что исправлено:** в логе есть `Started JS resource: fmp-gamemode` и нет `Failed to start resource fmp-gamemode`.

## NPC не синхронизируются

**Симптом:** `No Fallout4.esm in ...\Fallout 4\Data. NPCs are not synced`.

**Причина:** серверу нужна папка `Data` из Fallout 4, а распространять её нельзя.

**Обход:** укажи в `server.json` путь в `mod.game_data_path`. Без этого сервер работает, игроки подключаются, но NPC не синхронизируются.

## "Server tick took N ms against a 17 ms budget" при старте

В первые секунды после запуска это нормально: идёт загрузка ресурсов. Если предупреждение повторяется при работающем сервере, нужно искать, какой ресурс тормозит.
