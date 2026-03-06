# ESB Platform — End-to-End Fresh Deployment Guide

> **Covers:** Building all three components · Server setup · CORS · systemd services ·
> Nginx for UI · Smoke testing · Docker shortcut
>
> **Architecture:**
> ```
> ┌─────────────────────┐     ┌──────────────────────────┐     ┌─────────────────────────┐
> │   ESB UI            │     │   ESB Designer           │     │   ESB Runtime           │
> │   (Nginx, port 80)  │────▶│   (Java, port 9191)      │────▶│   (Java, port 9090)     │
> │   React static SPA  │────▶│   validate / preview /   │     │   live Camel routes     │
> │                     │     │   save YAML to disk       │     │   hot-reload watcher    │
> └─────────────────────┘     └──────────────────────────┘     └─────────────────────────┘
>                                         │ writes YAML
>                                         ▼
>                               /opt/esb/routes/   ◀── HotReloadWatcher (300 ms)
> ```

---

## Prerequisites

### Developer machine (build)
- Java 21 JDK: `java -version` → `21.x`
- Maven 3.9+: `mvn -version`
- Node.js 20+: `node -v` → `v20.x` and npm: `npm -v`

### Server (target machine)
- OS: Linux (Ubuntu 22.04+ / RHEL 9+) or Windows Server 2019+
- Java 21 JRE: `java -version`
- Nginx (for UI): `nginx -v`
- Open ports: **80** (UI), **9090** (runtime), **9191** (designer — internal only)

Install on Ubuntu:
```bash
sudo apt update
sudo apt install -y openjdk-21-jre-headless nginx
java -version   # confirm 21.x
nginx -v        # confirm installed
```

---

## Step 1 — Build All Artifacts (Developer Machine)

### 1a. Build the Java JARs

```bash
cd D:/FineXaTech/POC/esb

# Build esb-runtime and esb-designer (plus all shared modules they depend on)
mvn package -pl esb-runtime,esb-designer -am -DskipTests
```

Artifacts produced:
```
esb-runtime/target/esb-runtime-1.0.0-SNAPSHOT.jar    ← fat JAR ~50 MB
esb-designer/target/esb-designer-1.0.0-SNAPSHOT.jar  ← fat JAR ~50 MB
```

> **What `-am` does:** also builds ancestor modules (`esb-spec`, `esb-compiler`,
> `esb-adapters`) that the two apps depend on.

### 1b. Build the React UI

```bash
cd esb-ui

# For the full designer+runtime UI (install deps first if not already done):
npm install

# Build designer mode (Builder + Validation + Monitor) — most common
VITE_APP_MODE=designer \
VITE_RUNTIME_URL=https://esb-runtime.yourdomain.com \
VITE_DESIGNER_URL=https://esb-designer.yourdomain.com \
npm run build:designer
```

> If deploying runtime-monitor-only UI (no Builder / Validation pages):
> ```bash
> VITE_APP_MODE=runtime \
> VITE_RUNTIME_URL=https://esb-runtime.yourdomain.com \
> npm run build:runtime
> ```

Static files produced:
```
esb-ui/dist/
├── index.html
├── assets/
│   ├── index-xxxx.js
│   └── index-xxxx.css
└── ...
```

> **Why bake URLs into the build?**
> Vite replaces `import.meta.env.VITE_*` at build time with string literals.
> In production there is no Vite dev proxy — the browser calls the backends directly,
> so the URLs must be correct at build time.
> For on-premise deployments where you don't know the URL in advance, see
> [Runtime URL injection](#optional-runtime-url-injection-nginx-trick) below.

---

## Step 2 — Prepare Directories on the Server

SSH into the server and run:

```bash
# Application directories
sudo mkdir -p /opt/esb/runtime/logs
sudo mkdir -p /opt/esb/designer/logs
sudo mkdir -p /opt/esb/routes          # shared — designer writes, runtime reads
sudo mkdir -p /opt/esb/ui              # nginx serves from here

# Dedicated service user (no login shell, safer)
sudo useradd -r -s /bin/false esb

# Ownership
sudo chown -R esb:esb /opt/esb
```

Final directory layout:
```
/opt/esb/
├── runtime/
│   ├── esb-runtime-1.0.0-SNAPSHOT.jar
│   ├── application.yaml           ← runtime prod config
│   └── logs/
│       └── esb-runtime.log
├── designer/
│   ├── esb-designer-1.0.0-SNAPSHOT.jar
│   ├── application.yaml           ← designer prod config
│   └── logs/
│       └── esb-designer.log
├── routes/                        ← SHARED route YAML store
│   ├── account-balance.yaml
│   └── ...
└── ui/                            ← nginx root (static React files)
    ├── index.html
    └── assets/
```

---

## Step 3 — Copy Artifacts to Server

```bash
# From developer machine

# JARs
scp esb-runtime/target/esb-runtime-1.0.0-SNAPSHOT.jar \
    user@SERVER_IP:/opt/esb/runtime/

scp esb-designer/target/esb-designer-1.0.0-SNAPSHOT.jar \
    user@SERVER_IP:/opt/esb/designer/

# React static files (recursive)
scp -r esb-ui/dist/* user@SERVER_IP:/opt/esb/ui/
```

---

## Step 4 — Write Production Config Files

### 4a. ESB Runtime config

Create `/opt/esb/runtime/application.yaml` on the server:

```yaml
# /opt/esb/runtime/application.yaml
spring:
  application:
    name: finexatech-esb-runtime
  profiles:
    active: production   # disables MockSoapController and demo routes

server:
  port: 9090

esb:
  routes:
    # Load routes from filesystem — NOT classpath — on production
    scan-pattern: "file:/opt/esb/routes/*.yaml"
    store-dir: /opt/esb/routes
  cors:
    allowed-origins:
      - https://esb.yourdomain.com    # ← your deployed UI domain
      # Add more if needed:
      # - https://esb-internal.yourdomain.com

camel:
  springboot:
    name: ESB-Runtime-CamelContext
    main-run-controller: true
    jmx-enabled: false
  servlet:
    mapping:
      context-path: "/api/*"

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  endpoint:
    health:
      show-details: always

logging:
  level:
    com.finexatech.esb: INFO
    org.apache.camel: WARN
    org.springframework: WARN
  file:
    name: /opt/esb/runtime/logs/esb-runtime.log
  pattern:
    console: "%d{HH:mm:ss.SSS} [%thread] %-5level [%X{correlationId}] [%X{routeName}] %logger{36} - %msg%n"
```

### 4b. ESB Designer config

Create `/opt/esb/designer/application.yaml` on the server:

```yaml
# /opt/esb/designer/application.yaml
spring:
  application:
    name: finexatech-esb-designer

server:
  port: 9191

esb:
  designer:
    # Designer writes validated YAMLs here; Runtime watches the same dir
    routes-output-dir: /opt/esb/routes
  cors:
    allowed-origins:
      - https://esb.yourdomain.com    # ← your deployed UI domain

camel:
  springboot:
    name: ESB-Designer-CamelContext
    main-run-controller: false
    jmx-enabled: false

logging:
  level:
    com.finexatech.esb: INFO
    org.apache.camel: WARN
    org.springframework: WARN
  file:
    name: /opt/esb/designer/logs/esb-designer.log
  pattern:
    console: "%d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n"
```

> **CORS note:** `esb.cors.allowed-origins` is a list of origins the browser UI is served
> from. Both backends must allow the same UI origin for the browser to reach them.

---

## Step 5 — Install systemd Services

### 5a. ESB Runtime service

Create `/etc/systemd/system/esb-runtime.service`:

```ini
[Unit]
Description=FineXaTech ESB Runtime (port 9090)
After=network.target

[Service]
Type=simple
User=esb
WorkingDirectory=/opt/esb/runtime
ExecStart=java \
  -jar /opt/esb/runtime/esb-runtime-1.0.0-SNAPSHOT.jar \
  --spring.config.additional-location=file:/opt/esb/runtime/application.yaml
Restart=on-failure
RestartSec=10
TimeoutStopSec=30
StandardOutput=append:/opt/esb/runtime/logs/esb-runtime.log
StandardError=append:/opt/esb/runtime/logs/esb-runtime.log

[Install]
WantedBy=multi-user.target
```

### 5b. ESB Designer service

Create `/etc/systemd/system/esb-designer.service`:

```ini
[Unit]
Description=FineXaTech ESB Designer (port 9191)
After=network.target

[Service]
Type=simple
User=esb
WorkingDirectory=/opt/esb/designer
ExecStart=java \
  -jar /opt/esb/designer/esb-designer-1.0.0-SNAPSHOT.jar \
  --spring.config.additional-location=file:/opt/esb/designer/application.yaml
Restart=on-failure
RestartSec=10
TimeoutStopSec=15
StandardOutput=append:/opt/esb/designer/logs/esb-designer.log
StandardError=append:/opt/esb/designer/logs/esb-designer.log

[Install]
WantedBy=multi-user.target
```

### 5c. Enable and start both services

```bash
sudo systemctl daemon-reload

sudo systemctl enable esb-runtime esb-designer
sudo systemctl start  esb-runtime esb-designer

# Check status
sudo systemctl status esb-runtime
sudo systemctl status esb-designer
```

Wait for the startup log line:
```
Started EsbApplication in X.XXX seconds
```

Useful day-to-day commands:
```bash
# Restart after deploying a new JAR
sudo systemctl restart esb-runtime
sudo systemctl restart esb-designer

# Follow live logs
journalctl -u esb-runtime  -f
journalctl -u esb-designer -f

# View last 50 lines
journalctl -u esb-runtime  -n 50
```

---

## Step 6 — Configure Nginx for the UI

Nginx serves the React static files and handles SPA routing (all unknown paths → `index.html`).

Create `/etc/nginx/sites-available/esb-ui`:

```nginx
server {
    listen 80;
    server_name esb.yourdomain.com;   # ← your domain or server IP

    root /opt/esb/ui;
    index index.html;

    # SPA routing — React Router handles client-side paths
    # Any path without a file extension (no dot) falls through to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Static assets — long cache, filename-hashed by Vite
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/esb-ui \
           /etc/nginx/sites-enabled/esb-ui

# Remove default if it conflicts
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t                 # test config syntax
sudo systemctl reload nginx
```

---

## Step 7 — Smoke Test (End-to-End Verification)

Run these checks in order after everything is started.

### 7a. Runtime health
```bash
curl http://SERVER_IP:9090/manage/health
# Expected: {"status":"UP",...}
```

### 7b. Designer health
```bash
curl http://SERVER_IP:9191/manage/health
# Expected: {"status":"UP",...}
```

### 7c. List registered adapters (confirms esb-adapters loaded correctly)
```bash
curl http://SERVER_IP:9191/manage/components
# Expected: {"sources":[{"protocol":"rest",...}],"targets":[...],"transforms":[...]}
```

### 7d. List live routes (empty on fresh deploy)
```bash
curl http://SERVER_IP:9090/manage/routes
# Expected: []
```

### 7e. UI loads in browser
Open: `http://SERVER_IP` (or your domain)
- Dashboard page should load
- No browser console CORS errors
- "Builder" and "Validation" nav items visible (designer mode build)

### 7f. Deploy a test route end-to-end

Create a minimal test route YAML on the server:
```bash
cat > /opt/esb/routes/ping-test.yaml << 'EOF'
apiVersion: esb/v1
kind: Route
metadata:
  name: ping-test
source:
  type: rest
  method: GET
  path: /v1/ping
target:
  type: mock-response
  mockBody: '{"status":"pong","runtime":"ok"}'
  mockStatusCode: 200
EOF
```

HotReloadWatcher picks this up within ~300 ms. Verify:
```bash
# Route appears in registry
curl http://SERVER_IP:9090/manage/routes
# Expected: [{"name":"ping-test","status":"RUNNING",...}]

# Route is actually serving traffic
curl http://SERVER_IP:9090/api/v1/ping
# Expected: {"status":"pong","runtime":"ok"}
```

Remove the test route:
```bash
rm /opt/esb/routes/ping-test.yaml
# Route deregistered automatically within ~300 ms
```

### 7g. Validate a route YAML via designer API
```bash
curl -X POST http://SERVER_IP:9191/manage/routes/validate \
  -H "Content-Type: text/plain" \
  -d '
apiVersion: esb/v1
kind: Route
metadata:
  name: test-validate
source:
  type: rest
  method: GET
  path: /v1/test
target:
  type: rest
  endpointUrl: http://example.com/api
'
# Expected: {"passed":true,"errors":[],...}
```

---

## Step 8 — Deploying Route Updates (Day-2 Operations)

Once the platform is running, deploying a new or updated route is:

### Option A — File drop (simplest)
```bash
scp my-route.yaml user@SERVER_IP:/opt/esb/routes/
# Runtime picks it up in ~300 ms. No restart.
```

### Option B — API push (no SSH needed)
```bash
# Validate first (designer)
curl -X POST http://SERVER_IP:9191/manage/routes/validate \
  -H "Content-Type: text/plain" \
  --data-binary @my-route.yaml

# Deploy to runtime (in-memory, lost on restart)
curl -X POST http://SERVER_IP:9090/manage/routes \
  -H "Content-Type: text/plain" \
  --data-binary @my-route.yaml

# Persist to disk (survives restart)
curl -X POST http://SERVER_IP:9090/manage/routes/my-route/persist \
  -H "Content-Type: text/plain" \
  --data-binary @my-route.yaml
```

### Option C — Designer UI save
1. Open `http://SERVER_IP` in the browser
2. Build / edit the route in the Builder canvas
3. Click **Save to Disk** → designer validates + writes to `/opt/esb/routes/`
4. Runtime auto-loads in ~300 ms

---

## Step 9 — Deploying a New JAR Version (Code Update)

When you change Java code (new adapter, bug fix):

```bash
# 1. Build on developer machine
mvn package -pl esb-runtime -am -DskipTests       # or esb-designer

# 2. Copy new JAR to server
scp esb-runtime/target/esb-runtime-1.0.0-SNAPSHOT.jar \
    user@SERVER_IP:/opt/esb/runtime/

# 3. Restart the service
ssh user@SERVER_IP "sudo systemctl restart esb-runtime"

# 4. Verify it's up
curl http://SERVER_IP:9090/manage/health
```

> Routes stored in `/opt/esb/routes/` survive the restart — HotReloadWatcher
> re-scans the directory on startup and restores all routes automatically.

---

## Step 10 — Deploying a New UI Build

When you change UI code:

```bash
# 1. Build on developer machine
cd esb-ui
VITE_APP_MODE=designer \
VITE_RUNTIME_URL=https://esb-runtime.yourdomain.com \
VITE_DESIGNER_URL=https://esb-designer.yourdomain.com \
npm run build:designer

# 2. Copy new static files to server (rsync is cleaner than scp for directories)
rsync -av --delete dist/ user@SERVER_IP:/opt/esb/ui/

# 3. Nginx doesn't need restart — static files are served directly
#    Just clear browser cache or hard-reload (Ctrl+Shift+R)
```

---

## Optional: Runtime URL Injection (Nginx Trick)

If the backend URL isn't known at build time (e.g., on-premise installers), inject the
URLs at startup via a small nginx snippet instead of baking them into the build.

```nginx
# In nginx server block — before location / block
location = /env-config.js {
    default_type application/javascript;
    return 200 'window.__ESB_RUNTIME_URL__="http://YOUR_SERVER_IP:9090"; window.__ESB_DESIGNER_URL__="http://YOUR_SERVER_IP:9191";';
}
```

Add to `index.html` (before other scripts):
```html
<script src="/env-config.js"></script>
```

Then in `esb-api.ts` fall back to window globals:
```typescript
const RUNTIME_BASE  = import.meta.env.VITE_RUNTIME_URL  ?? (window as any).__ESB_RUNTIME_URL__  ?? '';
const DESIGNER_BASE = import.meta.env.VITE_DESIGNER_URL ?? (window as any).__ESB_DESIGNER_URL__ ?? '';
```

This way the same `dist/` bundle works on any server — just change the nginx config.

---

## Docker Shortcut (Alternative to Steps 2–6)

If Docker is available on the server, skip the manual setup entirely.

### Dockerfiles

**`esb-runtime/Dockerfile`:**
```dockerfile
FROM eclipse-temurin:21-jre-alpine
WORKDIR /opt/esb/runtime
COPY target/esb-runtime-1.0.0-SNAPSHOT.jar app.jar
RUN mkdir -p /opt/esb/routes
EXPOSE 9090
ENTRYPOINT ["java", "-jar", "app.jar", \
            "--spring.config.additional-location=file:/opt/esb/runtime/application.yaml"]
```

**`esb-designer/Dockerfile`:**
```dockerfile
FROM eclipse-temurin:21-jre-alpine
WORKDIR /opt/esb/designer
COPY target/esb-designer-1.0.0-SNAPSHOT.jar app.jar
EXPOSE 9191
ENTRYPOINT ["java", "-jar", "app.jar", \
            "--spring.config.additional-location=file:/opt/esb/designer/application.yaml"]
```

**`esb-ui/Dockerfile`:**
```dockerfile
FROM nginx:alpine
COPY dist/ /usr/share/nginx/html/
# SPA routing — unknown paths → index.html
RUN echo 'server { listen 80; root /usr/share/nginx/html; location / { try_files $uri $uri/ /index.html; } }' \
    > /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### docker-compose.yml (repo root)

```yaml
services:
  esb-runtime:
    build:
      context: .
      dockerfile: esb-runtime/Dockerfile
    ports:
      - "9090:9090"
    volumes:
      - esb-routes:/opt/esb/routes
      - ./esb-runtime/application-prod.yaml:/opt/esb/runtime/application.yaml:ro
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:9090/manage/health || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3

  esb-designer:
    build:
      context: .
      dockerfile: esb-designer/Dockerfile
    ports:
      - "9191:9191"
    volumes:
      - esb-routes:/opt/esb/routes           # same volume — designer writes, runtime reads
      - ./esb-designer/application-prod.yaml:/opt/esb/designer/application.yaml:ro
    restart: unless-stopped

  esb-ui:
    build:
      context: esb-ui
      dockerfile: Dockerfile
    ports:
      - "80:80"
    depends_on:
      esb-runtime:
        condition: service_healthy
    restart: unless-stopped

volumes:
  esb-routes:   # shared named volume — persists across restarts
```

Deploy:
```bash
# Build JARs + UI dist first
mvn package -pl esb-runtime,esb-designer -am -DskipTests
cd esb-ui && npm run build:designer && cd ..

# Start everything
docker compose up -d

# Verify
docker compose ps
docker compose logs -f esb-runtime
curl http://SERVER_IP:9090/manage/health
```

---

## Configuration Reference

### Environment variables (override any application.yaml property)

Camel-case → UPPER_SNAKE_CASE with dots replaced by underscores:

| Property | Env var | Example value |
|----------|---------|---------------|
| `server.port` | `SERVER_PORT` | `9090` |
| `esb.routes.store-dir` | `ESB_ROUTES_STORE_DIR` | `/opt/esb/routes` |
| `esb.routes.scan-pattern` | `ESB_ROUTES_SCAN_PATTERN` | `file:/opt/esb/routes/*.yaml` |
| `esb.cors.allowed-origins[0]` | `ESB_CORS_ALLOWED_ORIGINS_0` | `https://esb.yourdomain.com` |
| `esb.designer.routes-output-dir` | `ESB_DESIGNER_ROUTES_OUTPUT_DIR` | `/opt/esb/routes` |
| `spring.profiles.active` | `SPRING_PROFILES_ACTIVE` | `production` |
| `logging.file.name` | `LOGGING_FILE_NAME` | `/opt/esb/runtime/logs/esb-runtime.log` |

---

## Troubleshooting Checklist

| Symptom | Check |
|---------|-------|
| `connection refused :9090` | `systemctl status esb-runtime` — is it running? Port firewall? |
| `connection refused :9191` | `systemctl status esb-designer` — same checks |
| Browser CORS error | `esb.cors.allowed-origins` must exactly match the browser's `Origin` header (include `https://`, no trailing slash) |
| Route not loading | Check `/opt/esb/routes/` permissions — file must be readable by `esb` user |
| Route loads but returns 404 | `scan-pattern` must use `file:` prefix for filesystem routes, not `classpath:` |
| HotReloadWatcher not reacting | `journalctl -u esb-runtime -n 100` — look for "WatchService" errors |
| UI shows blank page | nginx `error.log` — check file permissions on `/opt/esb/ui/`, ensure `index.html` exists |
| UI shows old version | Hard-reload browser (Ctrl+Shift+R) — assets are fingerprinted, not cached if changed |
| `OutOfMemoryError` | Add `-Xmx512m` to `ExecStart` in the systemd unit file |
| Designer can't write YAML | `/opt/esb/routes/` must be writable by `esb` user: `chown esb:esb /opt/esb/routes` |

---

## Summary — Fresh Deployment Checklist

```
BUILD (developer machine)
  [ ] mvn package -pl esb-runtime,esb-designer -am -DskipTests
  [ ] cd esb-ui && npm run build:designer (with correct VITE_*_URL env vars)

SERVER SETUP
  [ ] Java 21 JRE installed
  [ ] Nginx installed
  [ ] /opt/esb/{runtime,designer,routes,ui} directories created
  [ ] esb system user created, chown -R esb:esb /opt/esb

ARTIFACTS
  [ ] esb-runtime-*.jar copied to /opt/esb/runtime/
  [ ] esb-designer-*.jar copied to /opt/esb/designer/
  [ ] esb-ui/dist/* copied to /opt/esb/ui/

CONFIG
  [ ] /opt/esb/runtime/application.yaml  (production profile, CORS origins, file: scan-pattern)
  [ ] /opt/esb/designer/application.yaml (CORS origins, routes-output-dir → /opt/esb/routes)
  [ ] /etc/nginx/sites-enabled/esb-ui   (root /opt/esb/ui, try_files SPA routing)

SERVICES
  [ ] esb-runtime.service enabled + started
  [ ] esb-designer.service enabled + started
  [ ] nginx enabled + started

VERIFY
  [ ] curl :9090/manage/health → UP
  [ ] curl :9191/manage/health → UP
  [ ] curl :9191/manage/components → lists adapters
  [ ] Browser http://SERVER_IP → Dashboard loads, no CORS errors
  [ ] Drop ping-test.yaml into /opt/esb/routes/ → curl :9090/api/v1/ping → pong
  [ ] Remove ping-test.yaml → route deregistered automatically
```
