# Документация fo4-server

Сервер Fallout 4 на платформе [Fallout Multiplayer (FMP)](https://docs.fallout.mp/).
Здесь описано, как поднять сервер, какой функционал в нём есть и как этот функционал проверить.

## Содержание

| Документ | О чём |
|---|---|
| [getting-started.md](getting-started.md) | Установка, сборка, запуск сервера, консоль |
| [known-issues.md](known-issues.md) | Известные проблемы и обходные пути |
| [resources/fmp-gamemode.md](resources/fmp-gamemode.md) | Стандартный gamemode: наши правки (SQLite), проверка логина и сохранений |
| [resources/pipboy-mod.md](resources/pipboy-mod.md) | Мод RP_Pipboy.esp (Papyrus): сборка в Creation Kit, установка через `mods/`, проверка |
| [resources/pipboy.md](resources/pipboy.md) | Модульный Pip-Boy (часть gamemode): устройства, возможности, команды, проверка |
| [resources/fmp-healthcheck.md](resources/fmp-healthcheck.md) | Ресурс самопроверки: проверка того, что сервер поднялся корректно |

## Правило для документации

Каждый новый ресурс (папка в `server/fmp-resources/`) получает свой файл `docs/resources/<имя-ресурса>.md` по шаблону [resources/_template.md](resources/_template.md).
В файле должно быть:
1. что делает ресурс;
2. команды, события и настройки;
3. **как проверить**: шаги и ожидаемый вывод в логе или в игре;
4. отдельно, что можно проверить без игры и что только с клиентом Fallout 4.
