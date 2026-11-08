# fmp-healthcheck

**Папка:** `server/fmp-resources/fmp-healthcheck`
**Статус:** готов; серверная часть проверена 2026-11-08, клиентская часть ещё не проверялась в игре

## Что делает

Проверяет, что сервер и скриптовый рантайм поднялись корректно. Это первое, что стоит смотреть после запуска или обновления релиза.

1. **Самотест при старте.** Проверяет API сервера и пишет в лог `PASS` или `FAIL` по каждой проверке, затем итог.
2. **Отчёт о состоянии** по команде `hc` в консоли сервера.
3. **Heartbeat.** Каждые 5 минут пишет в лог время работы и число игроков.
4. **Проверка связи клиент–сервер.** Игра каждого игрока отправляет ping при входе и по клавише F9, сервер отвечает pong, игрок видит время ответа в HUD.

## Функционал

### Команды консоли сервера
| Команда | Действие |
|---|---|
| `hc` или `healthcheck` | отчёт: версии, uptime, время и погода в мире, игроки, NPC |
| `hc selftest` | повторно запустить самотест |

### Проверки самотеста
| Проверка | Что значит FAIL |
|---|---|
| runtime is the server | скрипт запущен не в серверном рантайме |
| game is Fallout 4 | в `server.json` указан `mod.game` не `fo4` |
| framework version known | рантайм не сообщил версию framework |
| world clock readable | глобальный объект `World` недоступен или сломан |
| player list readable | `Player.all()` не работает |
| npc list readable | `Npc.all()` не работает |
| exports register | не удалось зарегистрировать экспорт |
| timers fire | `setTimeout` не сработал за 5 секунд |
| local events deliver | шина событий ресурса не доставляет события |

### Для игрока
- При входе (`playerReady`) приходит сообщение в чат: `Server OK, up …. Press F9 to ping the server.`
- **F9** отправляет ping, в HUD появляется `Healthcheck OK: N ms round trip, M online, framework X`.
- Через 3 секунды после загрузки клиентского скрипта ping отправляется автоматически. Пока открыт экран логина gamemode, HUD скрыт, поэтому ответ виден только в логе клиента.

### События и экспорты
| Имя | Направление | Payload |
|---|---|---|
| `healthcheck:ping` | клиент → сервер | `{ sentAt: number, reason: "auto" \| "key" }` |
| `healthcheck:pong` | сервер → клиент | `{ sentAt, serverUptimeSec, playersOnline, frameworkVersion }` |
| export `status` | другим ресурсам | `Exports.get("fmp-healthcheck", "status")()` возвращает `string[]`, те же строки, что выводит `hc` |

## Сборка

```powershell
cd server\fmp-resources\fmp-healthcheck
npm ci
npm run build
```

## Как проверить

### Без игры (только сервер)

1. Собери ресурс и запусти `server\FMPServer.exe`.
2. Дождись `FMP Server successfully started`.
   **Ожидается** в логе:
   ```
   [fmp-healthcheck] [healthcheck] started; running self-test
   [fmp-healthcheck] [healthcheck] PASS runtime is the server
   ... (всего 9 строк PASS)
   [fmp-healthcheck] [healthcheck] SELFTEST OK: 9/9 checks passed
   [fmp-healthcheck] [healthcheck] framework 37.0.4, mod 0.2.5, game Fallout 4 (fo4)
   ```
   Если есть хотя бы одна строка `FAIL` или `SELFTEST FAILED`, запуск некорректен. Причины перечислены в таблице проверок выше.
3. Введи в консоли `hc`.
   **Ожидается:** 5 строк отчёта, `players online: 0`, uptime растёт.
4. Введи `hc selftest`.
   **Ожидается:** снова `SELFTEST OK: 9/9`.
5. Перезагрузка без рестарта: `ensure fmp-healthcheck`.
   **Ожидается:** `stopped after …`, затем снова `started; running self-test` и `SELFTEST OK`.
6. Введи `quit`.
   **Ожидается:** `[healthcheck] stopped after …`.

### С клиентом Fallout 4 (нужен тестер с игрой)

1. Подключись к серверу через `client\FMPLauncher.exe`.
2. **Ожидается** в логе сервера: `player ready: <ник>`, затем `ping from <ник> (auto)`.
3. В чате игры должно прийти сообщение `Server OK, up …` от `Healthcheck`.
4. После входа в мир нажми F9.
   **Ожидается:** в HUD слева сверху `Healthcheck OK: … ms round trip`, в логе сервера `ping from <ник> (key)`.
5. В консоли сервера выполни `hc`.
   **Ожидается:** `players online: 1 -> <ник>`, `client pings answered` не меньше 2.
6. Лог клиента `client\logs\FMP.log` должен содержать `[healthcheck] client script loaded`.

## Известные ограничения
- Не проверяет, запустились ли другие ресурсы, например `fmp-gamemode`. Это видно в логе по строкам `Started JS resource` и `Failed to start resource`.
- Если сервер стартует медленно, первый `timers fire` может показать несколько секунд вместо 250 мс. Это нормально, проверка всё равно `PASS`.
