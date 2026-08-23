# NetHelper

Веб-приложение для учёта сетевой инфраструктуры: шкафов, оборудования, схем сети и портов core-коммутаторов.

## Возможности

- Шкафы и группы шкафов с поиском, сортировкой и защищённым режимом редактирования.
- Устройства разных типов: коммутаторы, маршрутизаторы, серверы, ИБП, NAS, точки доступа и другие.
- Интерактивные схемы: узлы, связи, типы кабелей, номера портов, группы/шкафы на холсте.
- Трассировка от порта core-коммутатора к устройству на схеме.
- Лицевые панели core-коммутаторов с шаблонами 28 и 56 портов.
- Общая серверная авторизация с единым паролем администратора.
- Общее хранение конфигурации в PostgreSQL для всех авторизованных браузеров.
- Экспорт и импорт данных в JSON.

## Хранение данных

Production-версия использует PostgreSQL. После входа все браузеры работают с одной общей конфигурацией.

- данные сохраняются автоматически на сервере;
- PostgreSQL хранится в Docker volume `postgres-data`;
- JSON-экспорт остаётся резервной копией и рекомендуется перед обновлениями;
- исходный код содержит только безопасные демонстрационные данные — боевую конфигурацию в Git не добавляйте.

## Локальный запуск frontend

Требования: Node.js 22 или новее.

```bash
npm ci
npm run dev
```

Локальный Vite-режим не запускает API и PostgreSQL. Для проверки общей авторизации используйте Docker Compose.

## Production через Docker Compose

### Требования

- Docker Engine;
- Docker Compose plugin;
- публичный HTTPS-адрес приложения для production-использования.

### 1. Получить исходники и настроить окружение

```bash
git clone https://github.com/ygibson86/nethelper.git
cd nethelper
cp .env.example .env
chmod 600 .env
```

Откройте `.env` и заполните значения:

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
```

### 2. Сгенерировать секрет JWT

```bash
openssl rand -base64 48
```

Вставьте результат в `JWT_SECRET`.

### 3. Сгенерировать хеш пароля администратора

Команда запустит одноразовый контейнер и попросит пароль:

```bash
docker run --rm -it node:22-alpine sh -lc 'npm install --no-save argon2 >/dev/null 2>&1 && node -e "const a=require(\"argon2\"); const r=require(\"readline\").createInterface({input:process.stdin,output:process.stdout}); r.question(\"Admin password: \", async p => { console.log(await a.hash(p,{type:a.argon2id})); r.close() })"'
```

Скопируйте полученную строку, начинающуюся с `$argon2id$`, в `ADMIN_PASSWORD_HASH`.

Не сохраняйте обычный пароль в `.env`.

### 4. Первый запуск

```bash
sudo docker compose up -d --build
sudo docker compose ps
```

Откройте:

```text
https://nethelper.example.internal
```

или, до настройки HTTPS:

```text
http://SERVER_IP:8080
```

Войдите с паролем, чей Argon2id-хеш указан в `.env`.

### 5. Первый импорт боевой конфигурации

После входа:

1. откройте **Настройки**;
2. выберите **Импортировать данные**;
3. загрузите сохраненный JSON backup;
4. подтвердите замену данных.

Импорт сохранится в PostgreSQL и будет доступен во всех браузерах после входа.

### Изменить внешний порт

В `.env`:

```env
NETHELPER_PORT=8090
```

Затем:

```bash
sudo docker compose up -d
```

### Обновление

Перед обновлением рекомендуется экспортировать JSON из интерфейса.

```bash
cd nethelper
git pull
sudo docker compose up -d --build
```

### Диагностика

```bash
sudo docker compose ps
sudo docker compose logs -f
sudo docker compose logs -f api
sudo docker compose logs -f postgres
```

### Резервная копия PostgreSQL

```bash
sudo docker compose exec -T postgres pg_dump -U nethelper nethelper > nethelper-postgres-backup.sql
```

Восстановление выполняйте только при остановленном приложении и после отдельного резервного копирования текущей БД.

### Остановка

```bash
sudo docker compose down
```

Не используйте `docker compose down -v`, если хотите сохранить конфигурацию: эта команда удаляет Docker volume с PostgreSQL.

## HTTPS

В production используйте HTTPS. Cookie авторизации в production передаётся только по защищённому соединению.

Можно поставить перед контейнером Caddy, nginx или Traefik. Укажите в `.env` точный внешний адрес в `PUBLIC_ORIGIN`, например:

```env
PUBLIC_ORIGIN=https://nethelper.example.internal
```

## Архитектура

- React + TypeScript + Vite;
- Zustand для UI-состояния;
- React Flow (`@xyflow/react`) для схем;
- Fastify API с HttpOnly cookie-сессией;
- PostgreSQL JSONB для общей конфигурации;
- nginx unprivileged для frontend и reverse proxy `/api`.

## Лицензия

До выбора лицензии все права сохранены за владельцем репозитория.
