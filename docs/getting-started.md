# Установка и запуск

## Что нужно

| Компонент | Зачем | Обязательно |
|---|---|---|
| Релиз FMP (берётся в Discord проекта, ссылка на https://fallout.mp) | сервер, клиент, стандартный gamemode | да |
| Node.js **22+** с npm | компиляция TypeScript-ресурсов | да, для сборки |
| Fallout 4 из Steam | подключиться к серверу как игрок | только для проверок в игре |
| Папка `Data` из Fallout 4 | синхронизация NPC на сервере | нет |
| VS Code | автодополнение по API | нет |

Сам сервер работает без Node.js: внутри `FMPServer.exe` встроен свой Node (**25.6.1**, `server/libnode.dll`).

## Структура репозитория

```
fo4-server/
├── docs/                        документация (этот каталог)
├── server/                      Windows-сервер целиком в git: клонировал и запустил
│   ├── FMPServer.exe            сервер
│   ├── libnode.dll              встроенный Node 25.6.1 (без него exe не стартует)
│   ├── server.json              рабочий конфиг
│   ├── server.example.json      шаблон конфига
│   ├── logs/                    логи (не в git)
│   ├── fmp-data/gamemode.sqlite база аккаунтов и персонажей (не в git, делай бэкапы)
│   └── fmp-resources/           ресурсы, которые загружает сервер; собранные dist/ тоже в git
│       ├── fmp-gamemode/        стандартный gamemode из релиза
│       ├── fmp-healthcheck/     наш ресурс самопроверки
│       └── fmp-asset-demo/      демо стриминга ассетов из релиза
├── client/                      лаунчер и клиент (из релиза, не в git)
├── server-linux/                Linux-сервер (из релиза, не в git)
└── fmp-resources/               запасная копия gamemode из релиза (не в git)
```

Сервер для Windows лежит в git полностью, вместе с собранными ресурсами: `git clone`, затем `server\FMPServer.exe`.
Клиент (`client/`) и Linux-сервер в репо нет, их берут из архива релиза FMP.
`node_modules` в git тоже нет, они нужны только для сборки.

## Первый запуск

Если нужно только запустить сервер, сразу переходи к шагу 3. Шаги 1–2 нужны, когда меняешь код ресурсов.

```powershell
# 1. Конфиг (server.json уже в репо; шаблон на случай, если его испортили)
Copy-Item server\server.example.json server\server.json

# 2. Сборка ресурсов (после изменений в src/; собранные dist/ коммитим)
cd server\fmp-resources\fmp-healthcheck
npm ci
npm run build

cd ..\fmp-gamemode
npm ci
npm run build

# 3. Запуск
cd ..\..
.\FMPServer.exe
```

Сервер стартует примерно 20–40 секунд. Готовность видна по строке `FMP Server successfully started`.

### Порты

| Порт | Протокол | Назначение |
|---|---|---|
| 27015 | UDP | игра |
| 27016 | TCP | HTTP API |

Если сервер должен быть доступен снаружи, открой оба порта в брандмауэре.

### server.json

| Ключ | Описание |
|---|---|
| `host` / `port` | адрес и порт игры |
| `apihost` / `apiport` | адрес и порт HTTP API |
| `maxplayers` | лимит игроков |
| `password` | пароль на вход, пусто означает без пароля |
| `mod.game_data_path` | путь к папке `Fallout 4\Data`. **Не оставляй пустым**: тогда сервер ищет путь в реестре и может упасть, см. [known-issues.md](known-issues.md). Без игры укажи `"game-data"`, NPC при этом не синхронизируются |
| `mod.stream_range` | дистанция стриминга игроков |
| `server-token` | токен для анонса в мастер-лист; секрет, в git не коммитить |

## Консоль сервера

Команды вводятся прямо в окне `FMPServer.exe`.

| Команда | Действие |
|---|---|
| `help` | список команд |
| `status` | имя, адрес, число игроков |
| `refresh` | пересканировать `fmp-resources/` и найти новые ресурсы |
| `ensure <ресурс>` | запустить ресурс или перезагрузить его без отключения игроков |
| `start` / `stop` / `restart <ресурс>` | управление отдельным ресурсом |
| `refreshall` | пересканировать и перезагрузить все ресурсы |
| `quit` | остановить сервер |

Нераспознанные команды передаются скриптам как событие `consoleCommand`. Так работает, например, `hc` из [fmp-healthcheck](resources/fmp-healthcheck.md).

## Цикл разработки

```powershell
cd server\fmp-resources\<ресурс>
npm run watch            # пересборка серверной части при сохранении
npm run watch:client     # пересборка клиентской части (во втором терминале)
```

После сохранения файла выполни в консоли сервера `ensure <ресурс>`.

## Новый ресурс

1. Скопируй `server/fmp-resources/fmp-healthcheck` как шаблон и переименуй. Поле `name` в `package.json` должно совпадать с именем папки.
2. Версию `@falloutmp/types` держи равной версии релиза сервера; сейчас это `0.2.5`. Если версии расходятся, типы описывают несуществующие или пропускают существующие функции.
3. В tsconfig нужен `"module": "CommonJS"`, потому что ресурсы загружаются через `require()`.
4. Клиентские данные считай недоверенными и проверяй их на сервере.
5. **Не подключай нативные npm-модули** (`*.node`, например `better-sqlite3`, `bcrypt`): внутри Windows `FMPServer.exe` они не загружаются. Для SQLite используй `node:sqlite`, для хэшей `node:crypto`. Подробности в [known-issues.md](known-issues.md).
6. Напиши `docs/resources/<имя>.md` по [шаблону](resources/_template.md).

Документация API: https://docs.fallout.mp/reference/server/ и https://docs.fallout.mp/reference/client/
