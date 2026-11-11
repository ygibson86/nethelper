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
- Привязка узла к устройству из шкафов: список сортируется по IP, есть фильтр по hostname/IP и авто-привязка при вводе IP.
- ICMP-индикация доступности узлов: цветной кружок на узле, глобальное отключение в настройках и переопределение для отдельного узла.

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
- Выделенный текст автоматически копируется в буфер; `Ctrl+C` копирует выделение, а без выделения отправляется в SSH-сессию; правый клик вставляет текст из буфера обмена.
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

### TLS прямо в контейнере с локальным CA

Подходит для сети без доступа в интернет. Локальный Root CA подписывает сертификат NetHelper, а Root CA устанавливается в доверенные на рабочих компьютерах. Без доверенного CA Chrome считает origin небезопасным и блокирует Clipboard API.

1. Выпустите сертификат. Скрипт нужно запускать через `sudo`:

```bash
sudo ./scripts/setup-local-tls.sh nethelper.example.internal 192.168.1.10
```

Второй аргумент — необязательный IP-адрес сервера для SAN. Если сертификат уже существует, используйте `--force`, чтобы перевыпустить его без пересоздания CA.

Скрипт создаёт:

```text
/root/nethelper-ca/nethelper-root-ca.crt   # публичный Root CA для клиентов
/root/nethelper-ca/nethelper-root-ca.key   # приватный ключ CA, никому не передавать
certs/fullchain.pem
certs/privkey.pem
```

Каталог `certs/` исключён из Git. Приватный ключ CA нельзя копировать в репозиторий или образ.

2. Укажите в `.env`:

```env
PUBLIC_ORIGIN=https://nethelper.example.internal
NETHELPER_HTTP_PORT=80
NETHELPER_HTTPS_PORT=443
```

`PUBLIC_ORIGIN` должен полностью совпадать с адресом, который открывается в браузере.

3. Запустите приложение с TLS-конфигурацией:

```bash
docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d --build
```

HTTP на порту 80 будет перенаправлять на HTTPS 443. Порты можно изменить через `NETHELPER_HTTP_PORT` и `NETHELPER_HTTPS_PORT`. Для `docker-compose.tls.yml` нужен Docker Compose 2.24 или новее — в нём используется тег `!override` для замены портов.

4. Установите `/root/nethelper-ca/nethelper-root-ca.crt` в доверенные корневые сертификаты на клиентах. На Windows: `certlm.msc` → **Trusted Root Certification Authorities** → **Certificates** → **Import**, затем перезапустите Chrome. Для доменных компьютеров удобнее распространить CA через GPO.

5. Проверьте:

```bash
curl --cacert /root/nethelper-ca/nethelper-root-ca.crt -I https://nethelper.example.internal
```

В Chrome откройте `https://nethelper.example.internal` и проверьте в консоли:

```js
window.isSecureContext   // true
Boolean(navigator.clipboard) // true
```

DNS-имя из сертификата должно указывать на этот хост. Если перед NetHelper уже стоит внешний reverse proxy с валидным сертификатом, встроенный TLS включать не нужно — используйте существующий HTTPS-адрес.

Для SELinux при необходимости добавьте `,Z` к монтированиям в `docker-compose.tls.yml` или выполните `chcon -Rt svirt_sandbox_file_t certs`.

### Автоматический деплой TLS на существующий стенд

Скрипт `scripts/deploy-prod-tls.sh` обновляет уже развёрнутый стенд:

- делает резервную копию PostgreSQL в `backups/` (если стек уже запущен);
- обновляет Git checkout до `origin/main`;
- прописывает в `.env` `PUBLIC_ORIGIN`, `NETHELPER_HTTP_PORT` и `NETHELPER_HTTPS_PORT`;
- выпускает локальный Root CA и сертификат либо переиспользует действующий;
- запускает `docker compose` с `docker-compose.tls.yml`.

Запускать нужно от пользователя, который владеет каталогом репозитория и имеет доступ к Docker, **без `sudo`**:

```bash
cd /opt/nethelper
./scripts/deploy-prod-tls.sh --yes
```

Если каталог другой, укажите его явно:

```bash
./scripts/deploy-prod-tls.sh --dir /path/to/nethelper --yes
```

По умолчанию скрипт настроен на:

```text
domain: nethelper.ad.tarkett.ru
IP:     10.179.37.41
branch: main
```

Их можно переопределить через `--domain`, `--ip` и `--branch`.

Чтобы обновить код и `.env`, но не трогать сертификаты и контейнеры, используйте `--prepare-only`:

```bash
./scripts/deploy-prod-tls.sh --prepare-only --yes
```

Если старая версия репозитория ещё не содержит скрипт, его можно скачать отдельно и запустить:

```bash
curl -fsSLo deploy-prod-tls.sh \
  https://raw.githubusercontent.com/ygibson86/nethelper/main/scripts/deploy-prod-tls.sh
chmod +x deploy-prod-tls.sh
./deploy-prod-tls.sh --dir /opt/nethelper --yes
```

Перед запуском проверьте, что:

- установлен Docker Compose 2.24 или новее;
- порты 80 и 443 свободны;
- `nethelper.ad.tarkett.ru` резолвится в `10.179.37.41` или клиенты получат эту запись через DNS/hosts;
- в существующем `.env` заполнены реальные секреты (скрипт остановится, если найдёт placeholder).

После деплоя публичный Root CA лежит в `certs/nethelper-root-ca.crt`. Его нужно установить на клиентские компьютеры. Приватный ключ CA остаётся в `/root/nethelper-ca` и в репозиторий не попадает.

Если на стенде уже запущена другая версия и нужно сохранить её `.env`, скрипт не перезаписывает секреты: он меняет только `PUBLIC_ORIGIN` и TLS-порты, а предыдущий `.env` сохраняет в `backups/`.

Перед обновлением скрипт делает дамп PostgreSQL в `backups/` и сохраняет текущий образ как `nethelper:pre-tls-<timestamp>`. Для отката верните предыдущий коммит и пересоберите стек без `docker-compose.tls.yml`; данные PostgreSQL останутся в volume `postgres-data`.

Скрипт обновляет ветку `main`, то есть подтягивает все изменения репозитория, а не только TLS. Если production-хост без доступа в интернет, заранее передайте туда Git-репозиторий или `git bundle` и укажите локальный путь через `--repo`. Если код уже скопирован или применён из bundle, запускайте скрипт с `--no-update`, чтобы он не пытался обращаться к GitHub.

## ICMP-мониторинг узлов

Схема может показывать доступность узлов по ICMP: на карточке узла появляется небольшой кружок.

- зелёный — узел отвечает, в подсказке виден RTT;
- красный — узел не ответил за 2 секунды;
- серый пульсирующий — идёт первая проверка.

Глобальный переключатель: **Настройки → Внешний вид → ICMP-проверка** (по умолчанию выключен). Для отдельного узла в карточке параметров есть поле **ICMP-проверка**: «Как в настройках», «Включена», «Отключена». Глобальный переключатель — главный: при выключенном мониторинге проверки не выполняются ни для одного узла.

Правила работы:

- проверяются только узлы с корректным IP-адресом (IPv4 или IPv6) в поле **IP-адрес** карточки узла; IP связанного устройства из шкафа не используется;
- группы и текстовые элементы не проверяются;
- опрос идёт раз в 30 секунд, запросы выполняет backend-контейнер через `POST /api/ping` (нужна активная сессия, до 64 адресов за запрос);
- при ошибке API статус не меняется, чтобы сетевой сбой не окрашивал живые узлы в красный;
- если браузерная вкладка скрыта, опрос приостанавливается и возобновляется при возврате.

ICMP отправляет API-контейнер. В образе `ping` получает файловую capability `cap_net_raw` (`backend/Dockerfile`), поэтому контейнер не запускается от root и не требует `--privileged`. Если ICMP за пределы подсети запрещён политикой сети, узлы будут красными — это ограничение сети, а не приложения.

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

### Версии

Начиная с 1.20 версия приложения хранится в `package.json` и показывается в
разделе **Настройки → О программе**. Она подставляется в сборку через
`vite.config.ts` (`__APP_VERSION__`), поэтому номер версии на стенде всегда
соответствует исходникам.

Порядок выпуска:

1. поднять версию: `npm version minor --no-git-tag-version` (или вручную в `package.json` и `package-lock.json`);
2. `npm ci && npm run build`;
3. закоммитить `package.json` и `package-lock.json` вместе с изменениями;
4. зафиксировать в отчёте пару «коммит ↔ тег образа».

Версия отображается как `major.minor`, пока патч равен нулю (`1.20`), и как
`major.minor.patch` после патч-релиза (`1.20.1`).

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
