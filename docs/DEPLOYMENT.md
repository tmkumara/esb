# ESB Deployment Guide

> **Covers:** Standalone server setup · YAML delivery options · Docker · Kubernetes
> **Today's goal:** Run the runtime on a separate server. Developer stays on their machine.

---

## The Core Answer — Yes, Manual YAML Copy Works

The runtime does **not** need the designer or the developer's machine running to pick up new routes.
Drop a `.yaml` file into the watch directory and the route goes live within 300ms.

```
Developer machine                         Production server
┌──────────────────────┐                  ┌────────────────────────────────┐
│  ESB Designer        │                  │  ESB Runtime (port 9090)       │
│  ESB UI              │   ── YAML ──▶    │                                │
│                      │   (any method)   │  HotReloadWatcher              │
│                      │                  │  watches /opt/esb/routes/      │
│                      │                  │  → picks up in ~300ms          │
└──────────────────────┘                  └────────────────────────────────┘
```

Three ways to get the YAML across (covered in Part 3):
1. Manual `scp` — simplest, fine for now
2. Shared folder (NFS/SMB) — designer writes directly to server mount
3. API push — `curl POST /manage/routes` then `/persist`

---

## Part 1 — Build the Runtime JAR

Run this once on the developer machine after any code change:

```bash
cd D:/FineXaTech/POC/esb
mvn package -pl esb-runtime -am -DskipTests
```

The JAR is produced at:
```
esb-runtime/target/esb-runtime-1.0.0-SNAPSHOT.jar
```

This is a **fat JAR** (Spring Boot repackage) — it contains all dependencies.
The server only needs Java 21. No Maven, no source code.

---

## Part 2 — Set Up the Server (Standalone)

### 2a. Server requirements

| Requirement | Minimum |
|------------|---------|
| OS | Linux (Ubuntu 22.04 / RHEL 9) or Windows Server 2019+ |
| Java | JRE 21+ (`java -version` to check) |
| RAM | 512 MB free (1 GB recommended) |
| CPU | 1 core (2 recommended for concurrent routes) |
| Ports | 9090 open (or whatever port you set) |

Install Java 21 on Ubuntu:
```bash
sudo apt install -y openjdk-21-jre-headless
java -version   # must show 21.x
```

### 2b. Directory structure on the server

```
/opt/esb/
├── esb-runtime-1.0.0-SNAPSHOT.jar   ← the fat JAR
├── application.yaml                  ← server-specific config (overrides built-in)
├── routes/                           ← HotReloadWatcher watches this
│   ├── account-balance.yaml
│   └── customer-lookup.yaml
└── logs/                             ← optional, for log file output
```

Create the directories:
```bash
sudo mkdir -p /opt/esb/routes /opt/esb/logs
sudo chown -R $USER:$USER /opt/esb
```

### 2c. Copy the JAR to the server

```bash
scp esb-runtime/target/esb-runtime-1.0.0-SNAPSHOT.jar \
    user@server-ip:/opt/esb/
```

### 2d. Create the server-side config file

Create `/opt/esb/application.yaml` — this overrides the built-in config inside the JAR:

```yaml
# /opt/esb/application.yaml
spring:
  application:
    name: finexatech-esb
  profiles:
    active: production       # disables MockSoapController

server:
  port: 9090

esb:
  routes:
    scan-pattern: "file:/opt/esb/routes/*.yaml"   # load from filesystem, not classpath
    store-dir: /opt/esb/routes                    # HotReloadWatcher watches this

camel:
  springboot:
    name: ESB-CamelContext
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

logging:
  level:
    com.finexatech.esb: INFO
    org.apache.camel: WARN
    org.springframework: WARN
  file:
    name: /opt/esb/logs/esb-runtime.log
```

Key difference from dev config:
- `scan-pattern` uses `file:` prefix to load YAMLs from the filesystem folder, not from inside the JAR
- Profile `production` — add this to `EsbApplication.java` to conditionally disable demo/mock controllers
- Log to file instead of only console

### 2e. Run the runtime

```bash
java -jar /opt/esb/esb-runtime-1.0.0-SNAPSHOT.jar \
  --spring.config.additional-location=file:/opt/esb/application.yaml
```

Wait for:
```
Started EsbApplication in X.XXX seconds
HotReloadWatcher: watching directory → /opt/esb/routes
```

Test it:
```bash
curl http://server-ip:9090/manage/health
# → {"status":"UP","totalRoutes":N,...}
```

### 2f. Run as a systemd service (Linux — keeps running after logout/reboot)

Create `/etc/systemd/system/esb-runtime.service`:

```ini
[Unit]
Description=FineXaTech ESB Runtime
After=network.target

[Service]
Type=simple
User=esb
WorkingDirectory=/opt/esb
ExecStart=java -jar /opt/esb/esb-runtime-1.0.0-SNAPSHOT.jar \
  --spring.config.additional-location=file:/opt/esb/application.yaml
Restart=on-failure
RestartSec=10
StandardOutput=append:/opt/esb/logs/esb-runtime.log
StandardError=append:/opt/esb/logs/esb-runtime.log

# Graceful shutdown timeout — let in-flight requests finish
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo useradd -r -s /bin/false esb           # dedicated service user
sudo chown -R esb:esb /opt/esb
sudo systemctl daemon-reload
sudo systemctl enable esb-runtime           # auto-start on boot
sudo systemctl start esb-runtime
sudo systemctl status esb-runtime           # check it's running
```

Useful commands:
```bash
sudo systemctl restart esb-runtime          # restart (e.g. after new JAR)
sudo systemctl stop esb-runtime
journalctl -u esb-runtime -f               # follow live logs
tail -f /opt/esb/logs/esb-runtime.log      # file logs
```

---

## Part 3 — YAML Delivery: Developer Machine → Server

### Option A — Manual SCP (do this now)

After saving the YAML on your developer machine:

```bash
scp esb-runtime/routes/account-balance.yaml \
    user@server-ip:/opt/esb/routes/
```

The runtime's HotReloadWatcher detects the new file within ~300ms and starts the route.
No restart. No API call. Just copy.

To update an existing route:
```bash
scp esb-runtime/routes/account-balance.yaml \
    user@server-ip:/opt/esb/routes/
# → HotReloadWatcher detects ENTRY_MODIFY → hot-reloads the route
```

To remove a route:
```bash
ssh user@server-ip "rm /opt/esb/routes/account-balance.yaml"
# → HotReloadWatcher detects ENTRY_DELETE → deregisters the route
```

### Option B — Shared Network Folder (NFS/SMB)

Mount the server's routes directory on the developer machine:

```bash
# On developer machine (Linux):
sudo mount server-ip:/opt/esb/routes /mnt/esb-routes

# Then configure the Designer to save directly there:
# -Desb.designer.routes-output-dir=/mnt/esb-routes
```

Now "Save to Disk" in the Designer writes directly to the server's watch directory.
No SCP step needed.

On Windows developer + Linux server, use SAMBA instead:
```
# Map \\server-ip\esb-routes as a network drive (e.g. Z:\)
# -Desb.designer.routes-output-dir=Z:\
```

### Option C — API Push (no file access to server)

If you can't SCP (firewall, no SSH):

```bash
# Step 1: Deploy in-memory (immediate, lost on restart)
curl -X POST http://server-ip:9090/manage/routes \
  -H "Content-Type: text/plain" \
  --data-binary @account-balance.yaml

# Step 2: Persist to disk (survives restart)
curl -X POST http://server-ip:9090/manage/routes/account-balance/persist \
  -H "Content-Type: text/plain" \
  --data-binary @account-balance.yaml
```

This requires port 9090 to be accessible from the developer machine.
Lock this down in production — the management API should NOT be publicly reachable.

### Option D — Git-Based (recommended for team)

Store all YAMLs in a Git repo. A simple deploy script runs on the server:

```bash
# deploy-routes.sh — run on the server
#!/bin/bash
cd /opt/esb-routes-repo
git pull origin main
cp routes/*.yaml /opt/esb/routes/
echo "Routes deployed at $(date)"
```

Call this from the developer machine after pushing:
```bash
git push origin main
ssh user@server-ip "bash /opt/esb/deploy-routes.sh"
```

Benefits:
- Full history of every route change
- Rollback = `git revert` + redeploy
- Review via pull requests before routes go live

---

## Part 4 — Docker (Next Step)

When you want repeatable, portable deployments.

### Dockerfile — Runtime

```dockerfile
# esb-runtime/Dockerfile
FROM eclipse-temurin:21-jre-alpine AS runtime

WORKDIR /opt/esb

# Copy the fat JAR
COPY target/esb-runtime-1.0.0-SNAPSHOT.jar app.jar

# Routes directory — mounted as a volume at runtime
RUN mkdir -p /opt/esb/routes

# Management port
EXPOSE 9090

# Override config via env vars (Spring Boot reads SPRING_* and ESB_* automatically)
ENV ESB_ROUTES_STORE_DIR=/opt/esb/routes
ENV SERVER_PORT=9090

ENTRYPOINT ["java", "-jar", "app.jar"]
```

Build and run:
```bash
# Build
mvn package -pl esb-runtime -am -DskipTests
docker build -f esb-runtime/Dockerfile -t finexatech/esb-runtime:1.0.0 .

# Run — mount local routes directory into the container
docker run -d \
  --name esb-runtime \
  -p 9090:9090 \
  -v /opt/esb/routes:/opt/esb/routes \
  finexatech/esb-runtime:1.0.0
```

The volume mount (`-v`) means:
- Drop a YAML into `/opt/esb/routes/` on the HOST machine
- HotReloadWatcher inside the container sees it immediately
- No container rebuild needed for new routes

### docker-compose.yml — Full Stack

```yaml
# docker-compose.yml (at repo root)
version: "3.9"

services:
  esb-runtime:
    image: finexatech/esb-runtime:1.0.0
    build:
      context: .
      dockerfile: esb-runtime/Dockerfile
    ports:
      - "9090:9090"
    volumes:
      - esb-routes:/opt/esb/routes
    environment:
      ESB_ROUTES_STORE_DIR: /opt/esb/routes
      SPRING_PROFILES_ACTIVE: production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9090/manage/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  esb-designer:
    image: finexatech/esb-designer:1.0.0
    build:
      context: .
      dockerfile: esb-designer/Dockerfile
    ports:
      - "9191:9191"
    volumes:
      - esb-routes:/opt/esb/routes      # same volume → designer writes, runtime reads
    environment:
      ESB_DESIGNER_ROUTES_OUTPUT_DIR: /opt/esb/routes
    restart: unless-stopped

volumes:
  esb-routes:
    driver: local
```

Start everything:
```bash
docker compose up -d
docker compose logs -f esb-runtime   # follow logs
```

**The shared volume is the key**: designer saves to `/opt/esb/routes`, runtime watches the same directory. Same workflow as local dev, but containerized.

### Dockerfile — Designer

```dockerfile
# esb-designer/Dockerfile
FROM eclipse-temurin:21-jre-alpine AS designer

WORKDIR /opt/esb-designer

COPY target/esb-designer-1.0.0-SNAPSHOT.jar app.jar
RUN mkdir -p /opt/esb/routes

EXPOSE 9191

ENV ESB_DESIGNER_ROUTES_OUTPUT_DIR=/opt/esb/routes
ENV SERVER_PORT=9191

ENTRYPOINT ["java", "-jar", "app.jar"]
```

---

## Part 5 — Kubernetes (Future)

When you need: high availability, auto-scaling, rolling deploys.

### How routes work in k8s

Routes (YAML files) are stored as **ConfigMap** entries.
The runtime Pod mounts the ConfigMap as a filesystem volume.
When you `kubectl apply` a new ConfigMap, k8s updates the volume files.
HotReloadWatcher detects the file change and reloads the route — no Pod restart.

```
Developer                  k8s cluster
  │                          │
  │  kubectl apply           │
  │  routes-configmap.yaml   │
  │ ────────────────────────▶│
  │                          │  ConfigMap updated
  │                          │  Volume files updated (~60s)
  │                          │  HotReloadWatcher detects change
  │                          │  → Route hot-reloaded
```

### Kubernetes manifests

**ConfigMap — routes:**
```yaml
# k8s/routes-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: esb-routes
  namespace: finexatech
data:
  account-balance.yaml: |
    apiVersion: esb/v1
    kind: Route
    metadata:
      name: account-balance
    source:
      type: rest
      method: GET
      path: /v1/accounts/{accountId}/balance
    target:
      type: soap
      endpointUrl: http://core-banking-svc:8080/soap/balance
    transform:
      request:
        type: groovy
        inline: '...'
      response:
        type: jolt
        inline: '[...]'
```

**Deployment — runtime:**
```yaml
# k8s/esb-runtime-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: esb-runtime
  namespace: finexatech
spec:
  replicas: 2                           # 2 instances for HA
  selector:
    matchLabels:
      app: esb-runtime
  template:
    metadata:
      labels:
        app: esb-runtime
    spec:
      containers:
        - name: esb-runtime
          image: finexatech/esb-runtime:1.0.0
          ports:
            - containerPort: 9090
          env:
            - name: ESB_ROUTES_STORE_DIR
              value: /opt/esb/routes
            - name: SPRING_PROFILES_ACTIVE
              value: production
          volumeMounts:
            - name: routes-volume
              mountPath: /opt/esb/routes  # ← ConfigMap files appear here
          readinessProbe:
            httpGet:
              path: /manage/health
              port: 9090
            initialDelaySeconds: 20
            periodSeconds: 10
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
      volumes:
        - name: routes-volume
          configMap:
            name: esb-routes             # ← mounts the ConfigMap above
```

**Service + Ingress:**
```yaml
# k8s/esb-runtime-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: esb-runtime-svc
  namespace: finexatech
spec:
  selector:
    app: esb-runtime
  ports:
    - port: 9090
      targetPort: 9090
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: esb-runtime-ingress
  namespace: finexatech
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
    - host: esb.finexatech.internal
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: esb-runtime-svc
                port:
                  number: 9090
```

Deploy everything:
```bash
kubectl apply -f k8s/routes-configmap.yaml
kubectl apply -f k8s/esb-runtime-deployment.yaml
kubectl apply -f k8s/esb-runtime-service.yaml
```

Deploy a new route (zero-downtime):
```bash
# Edit the ConfigMap to add/change a route YAML
kubectl edit configmap esb-routes -n finexatech
# OR apply an updated file:
kubectl apply -f k8s/routes-configmap.yaml
# k8s propagates the file change to the volume within ~60s
# HotReloadWatcher picks it up → route is live
```

### Clustering note — what to solve before scaling to replicas > 1

| Concern | Problem | Solution |
|---------|---------|---------|
| Route state | Each Pod loads routes independently from ConfigMap — this is fine, ConfigMap is shared | No action needed |
| In-flight requests on reload | Route hot-reload during active request | Camel graceful stop (already handled by `stopRoute` before `removeRoute`) |
| Sticky sessions | REST source routes receive requests from any Pod | Load balancer must NOT require stickiness — Camel REST is stateless, so this is fine |
| Management API | `POST /manage/routes` deploys to ONE Pod only | Use ConfigMap approach for k8s, not the API |
| Metrics aggregation | Each Pod has its own Prometheus counters | Prometheus federation or push-gateway scrapes all Pods |

---

## Configuration Reference — Runtime

All properties can be set in `application.yaml` OR as env vars (replace `.` with `_`, uppercase):

| Property | Default | Env var | Purpose |
|----------|---------|---------|---------|
| `server.port` | `9090` | `SERVER_PORT` | HTTP port |
| `esb.routes.store-dir` | `${user.dir}/routes` | `ESB_ROUTES_STORE_DIR` | HotReloadWatcher directory |
| `esb.routes.scan-pattern` | `classpath:routes/*.yaml` | `ESB_ROUTES_SCAN_PATTERN` | Startup classpath scan |
| `spring.profiles.active` | `demo` | `SPRING_PROFILES_ACTIVE` | `production` disables mock controllers |
| `camel.springboot.name` | `ESB-CamelContext` | `CAMEL_SPRINGBOOT_NAME` | CamelContext display name |
| `logging.level.com.finexatech.esb` | `DEBUG` | `LOGGING_LEVEL_COM_FINEXATECH_ESB` | Log verbosity |
| `logging.file.name` | _(none)_ | `LOGGING_FILE_NAME` | Write logs to file |

---

## Summary — Deployment Path

```
TODAY (Dev → Server)
  Build JAR → scp JAR to server → java -jar on server
  New routes → scp YAML to /opt/esb/routes/ → live in 300ms

SOON (Repeatable)
  Add Dockerfiles → docker compose up
  New routes → scp YAML into Docker volume → live in 300ms

FUTURE (Scale)
  Push image to registry → kubectl apply → k8s manages Pods
  New routes → kubectl apply configmap → live in ~60s (ConfigMap propagation)
```

No architectural change is needed between stages — the HotReloadWatcher + YAML contract works identically in all three.
