# SketchGit – Kubernetes / microk8s Deployment

This directory contains Kubernetes manifests for deploying SketchGit in a
[microk8s](https://microk8s.io/) cluster managed by
[ArgoCD](https://argo-cd.readthedocs.io/).

## Directory layout

```
infrastructure/k8s/
├── argocd-application.yaml   # ArgoCD Application resource
├── namespace.yaml            # sketchgit Namespace
├── configmap.yaml            # Non-sensitive runtime configuration
├── secret.yaml               # App secrets (template – fill before applying)
├── postgres-secret.yaml      # PostgreSQL credentials (template)
├── postgres-pvc.yaml         # PersistentVolumeClaim for PostgreSQL data
├── postgres-statefulset.yaml # PostgreSQL 16 StatefulSet
├── postgres-service.yaml     # PostgreSQL ClusterIP Service
├── redis-deployment.yaml     # Redis 7 Deployment (pub/sub relay)
├── redis-service.yaml        # Redis ClusterIP Service
├── app-deployment.yaml       # SketchGit app Deployment + migration init-container
├── app-service.yaml          # App ClusterIP Service
├── ingress.yaml              # Nginx Ingress (HTTP + WebSocket)
└── kustomization.yaml        # Kustomize resource list
```

## Prerequisites

### 1. microk8s add-ons

```bash
microk8s enable dns
microk8s enable ingress      # nginx ingress controller (class: nginx)
microk8s enable hostpath-storage   # microk8s-hostpath StorageClass for PVCs
# Optional – automated TLS via Let's Encrypt:
microk8s enable cert-manager
```

### 2. ArgoCD

```bash
kubectl create namespace argocd
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/install.yaml
```

Wait for all pods to be `Running`:

```bash
kubectl -n argocd rollout status deploy/argocd-server
```

### 3. Container image

Build and publish the SketchGit image to a registry accessible from the cluster.

**Option A – GitHub Container Registry (recommended):**

```bash
docker build -t ghcr.io/steffenkoenig/sketchgit:<tag> .
docker push ghcr.io/steffenkoenig/sketchgit:<tag>
```

Update the `image:` field in `app-deployment.yaml` accordingly.

**Option B – microk8s built-in registry:**

```bash
microk8s enable registry          # starts registry at localhost:32000
docker build -t localhost:32000/sketchgit:<tag> .
docker push localhost:32000/sketchgit:<tag>
```

Set `image: localhost:32000/sketchgit:<tag>` in `app-deployment.yaml`.

## Configuration

### Required: fill in secret values

Edit `secret.yaml` and replace every `CHANGE_ME` placeholder with a real value
**before** committing or applying the file:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string – use `postgres` as the hostname |
| `AUTH_SECRET` | Random string ≥ 32 chars (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Public URL of the app (e.g. `https://sketchgit.example.com`) |
| `INVITATION_SECRET` | Random string ≥ 32 chars (`openssl rand -hex 32`) |

Edit `postgres-secret.yaml` and replace `CHANGE_ME` with the PostgreSQL
password. This **must** match the password in `DATABASE_URL`.

> **Security note:** For production deployments consider using
> [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) or the
> [External Secrets Operator](https://external-secrets.io/) so that plaintext
> secrets are never stored in git.

### Optional: adjust configmap.yaml

The `configmap.yaml` contains non-sensitive defaults. Override values as
needed (e.g. `LOG_LEVEL`, `MAX_CLIENTS_PER_ROOM`, rate-limit settings).

### Optional: enable TLS

Uncomment the `tls` block in `ingress.yaml` and add the
`cert-manager.io/cluster-issuer` annotation once cert-manager is configured.

## Deployment

### Option A – ArgoCD (recommended)

1. Fill in all `CHANGE_ME` placeholders in `secret.yaml` and
   `postgres-secret.yaml` (or use a secret management solution).
2. Set the correct image reference in `app-deployment.yaml`.
3. Set your actual hostname in `ingress.yaml` and `secret.yaml`
   (`NEXTAUTH_URL`).
4. Register the repository with ArgoCD (if private):

   ```bash
   argocd repo add https://github.com/steffenkoenig/sketchgit.git \
     --username <user> --password <token>
   ```

5. Apply the ArgoCD Application resource:

   ```bash
   kubectl apply -f infrastructure/k8s/argocd-application.yaml
   ```

6. ArgoCD will automatically sync all resources into the `sketchgit` namespace.

   Monitor progress:

   ```bash
   argocd app get sketchgit
   argocd app sync sketchgit   # trigger manual sync if needed
   ```

### Option B – kubectl / kustomize (manual)

```bash
# 1. Apply all manifests
kubectl apply -k infrastructure/k8s/

# 2. Wait for PostgreSQL to be ready
kubectl -n sketchgit rollout status statefulset/postgres

# 3. Wait for the app to be ready
kubectl -n sketchgit rollout status deployment/sketchgit
```

## Verifying the deployment

```bash
# Pod status
kubectl -n sketchgit get pods

# App logs
kubectl -n sketchgit logs -l app=sketchgit -f

# Health endpoint (from inside the cluster)
kubectl -n sketchgit exec deploy/sketchgit -- wget -qO- http://localhost:3000/api/health
```

## Scaling

The app supports horizontal scaling when Redis is available (set via
`REDIS_URL`). The bundled Redis deployment is already wired up.

```bash
kubectl -n sketchgit scale deployment/sketchgit --replicas=3
```

## Updating the app

With ArgoCD automated sync enabled, push a new image tag to your registry,
update `image:` in `app-deployment.yaml`, and commit. ArgoCD will detect the
change and roll out the new version.

For a manual rollout:

```bash
kubectl -n sketchgit set image deployment/sketchgit \
  sketchgit=ghcr.io/steffenkoenig/sketchgit:<new-tag>
kubectl -n sketchgit rollout status deployment/sketchgit
```
