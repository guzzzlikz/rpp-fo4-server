# Мод RP_Pipboy: игровая часть модульного Pip-Boy

Модуль Pip-Boy ([pipboy.md](pipboy.md)) сам по себе закрывает V.A.T.S. и Pip-Boy скриптом FMP **после** того, как меню открылось. Мод `RP_Pipboy.esp` делает это средствами самой игры: скрипт Papyrus отключает управление через `InputEnableLayer`, и игра просто не даёт открыть меню.

Это эксперимент. На docs.fallout.mp про моды ничего нет, но в `FMPServer.exe` и `FMPClient.dll` есть поддержка: у ресурса может быть папка `mods/` с файлами `.esp`, `.esm`, `.esl` и `.ba2` (только в её корне), клиент получает их при входе и перезагружает данные игры. DLL-плагины F4SE так раздать нельзя. Работают ли у клиента FMP скрипты Papyrus, неизвестно, и проверка ниже отвечает в первую очередь на это.

## Как это работает

```
сервер (pipboy.ts)                         игра игрока (RP_PipBoyManager.psc)
маска возможностей ── setFactionRank ──►   ранг игрока во фракции RP_PipboyBlock
                                            раз в 0,5 с читает ранг
                                            биты ранга → InputEnableLayer
```

Сервер не может напрямую позвать скрипт Papyrus. Зато он ставит ранг во фракции (`player.setFactionRank`), а FMP передаёт членство в фракции в игру игрока. Ранг — это набор запретов:

| Бит | Что запрещает | Чем | Когда сервер его ставит |
|---|---|---|---|
| 1 | V.A.T.S. | `EnableVATS(false)` | нет `vats` |
| 2 | Pip-Boy и другие меню | `EnableMenu(false)` | `strictPipboyMenu` и нет ни `map`, ни `radio`, ни `biomonitor`, ни `gps` |
| 4 | вкладки Pip-Boy | `EnableJournal(false)` | нет хотя бы одной из `map`, `radio`, `biomonitor`, `gps` (экспериментально) |
| 8 | быстрое перемещение | `EnableFastTravel(false)` | нет `map` |

Ранг 0 или игрок не во фракции: ничего не запрещено. Пока мода нет или `"modFaction": null`, сервер фракцию не трогает, и всё работает как раньше.

Что именно запирают `EnableMenu` и `EnableJournal` под FMP, нужно увидеть в игре. По описанию Creation Kit `EnableMenu` закрывает Pip-Boy; закрывает ли он ещё и меню паузы (Esc), проверь в первую очередь.

## Файлы

| Где | Что |
|---|---|
| `mods-src/RP_Pipboy/Scripts/Source/User/RP_PipBoyManager.psc` | исходник скрипта |
| `server/fmp-resources/fmp-gamemode/mods/` | сюда кладутся собранные `RP_Pipboy.esp` и `RP_Pipboy - Main.ba2` |
| `server/fmp-resources/fmp-gamemode/pipboy.json` | `"modFaction"`: form ID фракции, как его видит игра |

## Сборка

Нужен Fallout 4 с **Creation Kit** (бесплатно в Steam/Bethesda.net). В Creation Kit входят компилятор Papyrus и утилита `Archive2`.

### 1. Плагин

1. Запусти Creation Kit, **File → Data**, отметь только `Fallout4.esm`, **OK**.
2. **Фракция.** Object Window → **Character → Faction**, правый клик → **New**.
   - ID: `RP_PipboyBlock`, Name: `RP Pip-Boy Block`.
   - Флаги не ставь, вкладку отношений (Interfaction Relations) оставь пустой: фракция не должна влиять на враждебность.
   - **OK**.
3. **Квест.** **Character → Quest**, правый клик → **New**.
   - ID: `RP_PipBoyQuest`, Name: `RP Pip-Boy`.
   - Отметь **Start Game Enabled**, сними **Run Once**.
   - **OK**, затем снова открой квест.
4. **Скрипт.** В квесте вкладка **Scripts → Add → [New Script]**.
   - Name: `RP_PipBoyManager`, Extends: `Quest`, **OK**.
   - Правый клик по скрипту → **Edit Source**. Замени всё содержимое текстом из `mods-src/RP_Pipboy/Scripts/Source/User/RP_PipBoyManager.psc` и сохрани: скрипт скомпилируется. Ошибки компиляции видны внизу окна.
   - Правый клик по скрипту → **Properties**. `RP_PipboyBlock` → **Edit Value** → выбери фракцию `RP_PipboyBlock`. `ShowNotifications` оставь `True`. **OK**.
5. **File → Save**, имя `RP_Pipboy.esp`.

Скомпилированный скрипт окажется в `Fallout 4\Data\Scripts\RP_PipBoyManager.pex`.

Предметы-устройства (компас, дозиметр, КПК) для первой проверки не нужны. Их можно добавить позже: **Items → MiscItem**, затем вписать их form ID в `devices` в `pipboy.json`.

### 2. Архив со скриптом

Скрипт должен лежать в архиве рядом с плагином. Свободных файлов `mods/` не принимает.

1. Запусти `Fallout 4\Tools\Archive2\Archive2.exe`.
2. **File → New**, формат **General**.
3. Добавь файл `Data\Scripts\RP_PipBoyManager.pex` так, чтобы путь внутри архива был `Scripts\RP_PipBoyManager.pex`. Проще всего перетащить папку `Data\Scripts` и удалить из архива всё, кроме этого файла.
4. **Save As** → `RP_Pipboy - Main.ba2`. Имя должно быть ровно таким: игра сама подхватывает архив `<плагин> - Main.ba2`.

### 3. Установка

1. Создай папку `server/fmp-resources/fmp-gamemode/mods/` и положи в её корень `RP_Pipboy.esp` и `RP_Pipboy - Main.ba2`. Больше ничего туда не клади: FMP принимает в `mods/` только `.esp`, `.esm`, `.esl` и `.ba2`, без подпапок.
2. Перезапусти сервер. Плагины применяются при следующем входе игрока.
3. **Убери у себя** `Fallout 4\Data\RP_Pipboy.esp` и `Data\Scripts\RP_PipBoyManager.pex`. Иначе твоя игра возьмёт их из своей папки, и проверка покажет то, чего у других игроков не будет.

## Проверка

### Шаг 1. Грузится ли плагин и работает ли Papyrus

Зайди на сервер.

| Что видно | Значит |
|---|---|
| Сверху `RP Pip-Boy mod: loaded`, затем `RP Pip-Boy: blocks 0` | плагин пришёл, Papyrus работает. Иди к шагу 2 |
| Сообщений нет, но в консоли игры (`~`) `help RP_PipboyBlock 4` находит фракцию | плагин грузится, а скрипт нет: либо FMP не запускает Papyrus, либо нет архива `.ba2` |
| `help RP_PipboyBlock 4` ничего не находит | плагин не пришёл. Пришли лог сервера при старте и строки из `client\logs\FMP.log` со словами `plugin`, `mods`, `Streamed` |

### Шаг 2. Form ID фракции

1. В консоли игры введи `help RP_PipboyBlock 4`. В ответе будет строка вида `FACT: RP_PipboyBlock (FE000800) 'RP Pip-Boy Block'`. Число в скобках — form ID фракции так, как её загрузила игра.
2. Впиши его в `pipboy.json`: `"modFaction": "0xFE000800"` (твоё число).
3. В консоли сервера `pipboy reload`. В логе: `pipboy: on; …; mod: faction 0xFE000800`.

Если у двух игроков числа разные, порядок загрузки плагинов у них не совпадает. Тогда пришли оба числа: придётся искать фракцию другим способом.

### Шаг 3. Запреты

Нужен ранг moderator.

| Команда | Ожидается в игре | В логе сервера |
|---|---|---|
| `/pipboy revoke <игрок> vats` | `RP Pip-Boy: blocks 1` (или больше), Q не открывает V.A.T.S. вообще, без мигания | `pipboy: <username> mod blocks …` |
| `/pipboy revoke <игрок> map` | быстрое перемещение на карте не работает; посмотри, что стало с вкладками (бит 4) | то же |
| `"strictPipboyMenu": true`, `pipboy reload`, `/pipboy revoke <игрок> full` | Tab не открывает Pip-Boy; **проверь, открывается ли Esc** | то же |
| `/pipboy reset <игрок>` | `RP Pip-Boy: blocks 0`, всё вернулось | то же |

Пришли, что получилось в каждой строке, особенно что именно запирает бит 4 (вкладки) и работает ли Esc при бите 2. По этому решим, какие биты оставить.

## Если что-то не так

| Проблема | Что делать |
|---|---|
| В логе `mod faction refused (…)` | неверный `modFaction`: сверь с `help RP_PipboyBlock 4` |
| В логе `mod blocks N (not set: gone, or in 16 factions)` | у игрока уже 16 фракций от сервера; FMP больше не даёт |
| Блоки не меняются, хотя в логе `mod blocks N` | скрипт не работает (шаг 1) или не тот form ID (шаг 2) |
| Esc не открывается | убери бит 2: не ставь `strictPipboyMenu`. Клиентский модуль тогда по-прежнему закрывает Pip-Boy сам |
| После проверки хочу убрать мод | удали файлы из `mods/`, поставь `"modFaction": null`, `pipboy reload`, перезапусти сервер |

Когда проверка пройдёт, `ShowNotifications` в свойствах скрипта можно выключить (**Properties → ShowNotifications → False**) и пересобрать плагин.
