# NetHelper

NetHelper — веб-приложение для учёта и обслуживания сетевой инфраструктуры. Оно объединяет шкафы и оборудование, интерактивные схемы, лицевые панели core-коммутаторов, шаблоны конфигураций и браузерный SSH-терминал.

## Возможности

### Шкафы и оборудование

- Группы шкафов и физическое расположение оборудования.
- Коммутаторы, маршрутизаторы, серверы, ИБП, NAS, точки доступа, камеры и другие типы устройств.
- Поиск по шкафам, группам, hostname, IP, модели и описанию.
- Фильтр по последнему октету IP.
- Перетаскивание и изменение порядка шкафов и устройств.
- Привязка устройства к сетевой схеме.
- Отметка core-коммутаторов и доступных методов подключения.

### Сетевые схемы

- Интерактивный редактор на базе React Flow.
- Узлы устройств, группы, текстовые элементы и связи.
- Типы соединений: медь, оптоволокно, DAC и беспроводная связь.
- Подписи портов и комментарии к соединениям.
- Копирование и вставка узлов.
- Удаление с возможностью Undo через кнопку или `Ctrl+Z`.
- Трассировка устройства и порта от шкафов и core-панелей.

### Core-коммутаторы

- Лицевые панели на 28 и 56 портов.
- Состояние, IP и назначение каждого порта.
- Переход от порта к устройству или сетевой схеме.
- Изменение физической компоновки панели.

### Шаблоны конфигураций

- Шаблоны Cisco и Eltex.
- Поиск по названию, описанию и содержимому.
- Inline-редактирование и подсветка синтаксиса.
- Копирование конфигурации в буфер обмена.

### Браузерный SSH-терминал

- Терминал xterm.js в отдельной вкладке браузера.
- Подключение из карточки устройства, из узла схемы по IP или по вручную введённому IPv4-адресу.
- В ручном терминале доступны профили `Авто`, `Современный`, `Cisco legacy` и `Eltex legacy`; режим `Авто` определяет производителя по совпадению IP с устройством из шкафов.
- Автоматическая привязка узлов схемы к устройствам при единственном совпадении IP.
- Ручной выбор связанного устройства в редакторе узла схемы.
- Username можно запомнить в браузере; пароль вводится при каждом подключении.
- Пароль не сохраняется в PostgreSQL, Zustand, localStorage или URL.
- SSH target проверяется по списку разрешённых CIDR-подсетей.
- Проверка fingerprint SSH host key при первом и последующих подключениях.
- Блокировка подключения при изменении host key.
- Ограничение числа и продолжительности SSH-сессий.
- Дополнительная совместимость со старыми Eltex и Cisco для устройств соответствующего производителя.
- Постоянная подсветка вывода: состояния, ошибки, предупреждения, IP, MAC, интерфейсы, VLAN и основные команды.
- Если устройство отправляет собственные ANSI-цвета, терминал сохраняет нативное оформление вместо дополнительной подсветки.

## Стек

- React 19, TypeScript, Vite;
- Zustand;
- React Flow;
- xterm.js;
- Fastify;
- `ssh2` и WebSocket;
- PostgreSQL;
- nginx unprivileged;
- Docker Compose.

## Хранение данных

Основная конфигурация хранится в PostgreSQL в одном JSONB-документе. Все авторизованные браузеры работают с общей серверной версией.

- изменения сохраняются автоматически;
- UI показывает состояния сохранения и ошибки;
- параллельное изменение защищено номером revision;
- SSH fingerprints хранятся отдельно в таблице `ssh_host_keys`;
- PostgreSQL размещён в Docker volume `postgres-data`;
- JSON-экспорт рекомендуется делать перед обновлениями;
- пароли SSH не сохраняются.

## Авторизация и ограничения текущей версии

Сейчас используется общий пароль администратора и HttpOnly JWT-cookie. Все вошедшие пользователи имеют одинаковые права. Персональные аккаунты и роли пока не реализованы.

Для production:

- используйте только HTTPS/WSS;
- ограничьте доступ к NetHelper через VPN, reverse proxy или firewall;
- не публикуйте API напрямую;
- разрешите API-контейнеру SSH-egress только в необходимые management-подсети и на TCP/22.

## Требования

- Docker Engine;
- Docker Compose plugin;
- Node.js 22+ для локальной разработки;
- PostgreSQL запускается через Docker Compose;
- для SSH у Docker-хоста должен быть маршрут до management-сетей.

## Быстрый запуск через Docker Compose

```bash
git clone https://github.com/ygibson86/nethelper.git
cd nethelper
cp .env.example .env
chmod 600 .env
```

Заполните `.env`, затем выполните:

```bash
docker compose up -d --build
docker compose ps
```

По умолчанию приложение публикуется на порту из `NETHELPER_PORT`.

## Настройка `.env`

Пример:

```env
POSTGRES_DB=nethelper
POSTGRES_USER=nethelper
POSTGRES_PASSWORD=LONG_RANDOM_DATABASE_PASSWORD
DATABASE_URL=postgresql://nethelper:LONG_RANDOM_DATABASE_PASSWORD@postgres:5432/nethelper

JWT_SECRET=LONG_RANDOM_JWT_SECRET_AT_LEAST_32_CHARACTERS
ADMIN_PASSWORD_HASH=ARGON2ID_PASSWORD_HASH
JWT_TTL_SECONDS=28800

PUBLIC_ORIGIN=https://nethelper.example.internal
NETHELPER_PORT=8080

SSH_ALLOWED_CIDRS=10.63.10.0/24,192.168.31.0/24
SSH_PORT=22
SSH_CONNECT_TIMEOUT_MS=12000
SSH_IDLE_TIMEOUT_SECONDS=1800
SSH_MAX_SESSIONS=20
SSH_MAX_LIFETIME_SECONDS=28800
SSH_LEGACY_ELTEX=true
SSH_LEGACY_CISCO=true
```

### PostgreSQL

`POSTGRES_PASSWORD` и пароль внутри `DATABASE_URL` должны совпадать.

Не удаляйте volume `postgres-data`, если требуется сохранить данные.

### JWT secret

Сгенерируйте один раз:

```bash
openssl rand -base64 48
```

Результат поместите в `JWT_SECRET`.

### Пароль администратора

В `.env` хранится только Argon2id-хеш. Обычный пароль сохранять нельзя.

Хеш можно получить одноразовым контейнером:

```bash
docker run --rm -it node:22-alpine sh -lc 'npm install --no-save argon2 >/dev/null 2>&1 && node -e "const a=require(\"argon2\"); const r=require(\"readline\").createInterface({input:process.stdin,output:process.stdout}); r.question(\"Admin password: \", async p => { console.log(await a.hash(p,{type:a.argon2id})); r.close() })"'
```

Строку, начинающуюся с `$argon2id$`, поместите в `ADMIN_PASSWORD_HASH`.

### Публичный адрес

`PUBLIC_ORIGIN` должен точно совпадать с адресом, который пользователь открывает в браузере:

```env
PUBLIC_ORIGIN=https://nethelper.example.internal
```

Не добавляйте завершающий `/`. Значение используется при проверке HTTP Origin и WebSocket-подключений.

### Несколько SSH-подсетей

Используйте переменную `SSH_ALLOWED_CIDRS`. Подсети перечисляются через запятую без пробелов или с пробелами:

```env
SSH_ALLOWED_CIDRS=10.63.10.0/24,192.168.31.0/24,172.16.50.0/24
```

Пробелы вокруг значений автоматически удаляются:

```env
SSH_ALLOWED_CIDRS=10.63.10.0/24, 192.168.31.0/24
```

Правила:

- сейчас поддерживаются только IPv4 CIDR;
- ручной терминал принимает только буквальный IPv4-адрес;
- hostname в ручном поле не разрешён;
- адрес должен входить хотя бы в одну указанную подсеть;
- порт пока общий для всех подключений и задаётся через `SSH_PORT`;
- после изменения `.env` необходимо пересоздать API-контейнер.

Применение изменений:

```bash
docker compose up -d --build api nethelper
```

Старая переменная `SSH_ALLOWED_CIDR` поддерживается для совместимости, но для новых установок используйте `SSH_ALLOWED_CIDRS`.

### Параметры SSH

| Переменная | Назначение | Значение по умолчанию |
|---|---|---:|
| `SSH_ALLOWED_CIDRS` | Разрешённые IPv4-подсети через запятую | `10.63.10.0/24` |
| `SSH_PORT` | SSH-порт для всех подключений | `22` |
| `SSH_CONNECT_TIMEOUT_MS` | Timeout установки SSH | `12000` |
| `SSH_IDLE_TIMEOUT_SECONDS` | Завершение неактивной сессии | `1800` |
| `SSH_MAX_SESSIONS` | Максимум параллельных сессий | `20` |
| `SSH_MAX_LIFETIME_SECONDS` | Абсолютная длительность сессии | `28800` |
| `SSH_LEGACY_ELTEX` | Дополнительные алгоритмы только для устройств Eltex | `true` |
| `SSH_LEGACY_CISCO` | Legacy KEX, `ssh-rsa` и CBC только для устройств Cisco | `true` |

## Сетевая доступность SSH

SSH-соединение устанавливает API-контейнер, а не браузер:

```text
Браузер → HTTPS/WSS → nginx → API-контейнер → TCP/22 → устройство
```

Проверка маршрута с Docker-хоста:

```bash
ip route get 10.63.10.10
nc -vz -w 5 10.63.10.10 22
```

Проверка из API-контейнера:

```bash
docker compose exec api node -e "const net=require('net');const s=net.createConnection({host:'10.63.10.10',port:22,timeout:5000},()=>{console.log('reachable');s.destroy()});s.on('timeout',()=>{console.log('timeout');s.destroy()});s.on('error',e=>console.log(e.code))"
```

`ssh-egress` в Compose предоставляет API исходящий сетевой интерфейс, но не заменяет firewall. На production-хосте рекомендуется ограничить исходящий трафик API-контейнера разрешёнными подсетями и TCP/22 через nftables/iptables/DOCKER-USER.

## SSH host key

При первом подключении NetHelper показывает SHA256 fingerprint. Сверьте его с fingerprint устройства и только после этого нажмите «Доверять и подключиться».

При изменении ключа подключение блокируется. Удаляйте сохранённый fingerprint только после проверки причины изменения: переустановка устройства, замена оборудования или регенерация SSH-ключей.

Для подключения из карточки fingerprint привязан к ID устройства. Для ручного подключения — к IP-адресу.

## HTTPS и reverse proxy

В production обязательно используйте HTTPS. WebSocket терминала автоматически использует WSS при открытии приложения через HTTPS.

Встроенный nginx уже проксирует `/api/ssh/` с WebSocket Upgrade. Внешний Caddy/nginx/Traefik также должен поддерживать WebSocket и не обрывать долгие соединения.

Не открывайте production-интерфейс по обычному HTTP: SSH-пароль передаётся через WebSocket только на время подключения и должен быть защищён TLS.

## Первоначальный импорт

После первого входа:

1. откройте **Настройки**;
2. нажмите **Импортировать данные**;
3. выберите JSON backup;
4. подтвердите замену;
5. дождитесь статуса успешного сохранения.

Импорт проходит runtime-валидацию на frontend и backend.

## Локальная разработка

Установка зависимостей frontend:

```bash
npm ci
npm run dev
```

Проверки:

```bash
npm run lint
npm run build
```

Backend:

```bash
cd backend
npm ci
npm run build
```

Vite отдельно не запускает PostgreSQL и API. Для проверки авторизации, сохранения и SSH используйте Docker Compose.

## Обновление

Перед обновлением экспортируйте JSON из раздела **Настройки** и желательно сделайте PostgreSQL backup.

```bash
git pull
docker compose up -d --build
docker compose ps
```

После обновления frontend выполните принудительное обновление страницы: `Ctrl+Shift+R`.

## Резервное копирование

### JSON

Используйте раздел **Настройки → Резервная копия**. JSON удобен для переноса и восстановления конфигурации через интерфейс.

### PostgreSQL

```bash
docker compose exec -T postgres pg_dump -U nethelper nethelper > nethelper-postgres-backup.sql
```

Проверяйте, что имя пользователя и базы соответствует вашему `.env`.

## Диагностика

Состояние контейнеров:

```bash
docker compose ps
```

Общие журналы:

```bash
docker compose logs -f
```

API и SSH:

```bash
docker compose logs -f api
```

PostgreSQL:

```bash
docker compose logs -f postgres
```

Проверка HTTP:

```bash
curl -I http://127.0.0.1:${NETHELPER_PORT:-8080}/
```

Частые причины проблем SSH:

- IP не входит в `SSH_ALLOWED_CIDRS`;
- у API-контейнера нет маршрута до management VLAN;
- TCP/22 блокируется firewall;
- внешний reverse proxy не поддерживает WebSocket Upgrade;
- `PUBLIC_ORIGIN` не совпадает с адресом браузера;
- устройство требует дополнительный legacy SSH-алгоритм;
- изменился host key устройства.

## Остановка

```bash
docker compose down
```

Не используйте команду ниже без отдельной резервной копии:

```bash
docker compose down -v
```

Опция `-v` удаляет PostgreSQL volume и данные приложения.

## Архитектура контейнеров

```text
                      ┌─────────────────────┐
Browser ─ HTTPS/WSS ─▶│ nginx / React       │
                      └──────────┬──────────┘
                                 │ /api
                      ┌──────────▼──────────┐
                      │ Fastify API         │──── SSH/TCP 22 ───▶ Management networks
                      └──────────┬──────────┘
                                 │
                      ┌──────────▼──────────┐
                      │ PostgreSQL          │
                      └─────────────────────┘
```

- `internal` — изолированная сеть nginx/API/PostgreSQL;
- `public` — сеть frontend-контейнера;
- `ssh-egress` — исходящая сеть API для SSH;
- порт API наружу не публикуется;
- nginx обслуживает SPA и проксирует HTTP/WebSocket API.

## Лицензия

До выбора лицензии все права сохранены за владельцем репозитория.
