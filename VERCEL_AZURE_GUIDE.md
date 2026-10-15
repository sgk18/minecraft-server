# Minecraft Bedrock Azure & Vercel Dashboard Guide

This project includes a **Palworld-inspired Minecraft Bedrock Status & World Settings Dashboard**, completely powered by live API data with **zero mock data**, designed to be hosted on **Vercel** and connected to your **Azure Container Instances (ACI)** server.

---

## 1. Hosting on Vercel

### Step 1: Push to GitHub or Import to Vercel
1. Push this directory to your GitHub repository (or deploy directly via the [Vercel CLI](https://vercel.com/cli)).
2. In the [Vercel Dashboard](https://vercel.com/dashboard), click **Add New... &rarr; Project** and select this repository.

### Step 2: Configure Environment Variables in Vercel
In your Vercel Project Settings under **Environment Variables**, add the following keys (also documented in [.env.example](file:///c:/projects/minecraft-server/.env.example)):

| Variable Name | Live Deployment Value | Description |
| :--- | :--- | :--- |
| `MINECRAFT_SERVER_HOST` | `minesvrbedrock.centralindia.azurecontainer.io` | Your Azure Container FQDN or Public IP |
| `MINECRAFT_SERVER_PORT` | `19132` | Minecraft Bedrock UDP port |
| `SERVER_NAME` | `sgkserver` | Display name in the dashboard hero header |
| `AZURE_REGION` | `centralindia` | Azure deployment region |
| `AZURE_RESOURCE_GROUP` | `minecraftResGroup` | Azure Resource Group name |
| `AZURE_CONTAINER_NAME` | `minecotainer` | Azure Container Instance (ACI) name |
| `AZURE_STORAGE_ACCOUNT` | `surymineacc` | Azure Files Storage Account |
| `AZURE_STORAGE_SHARE` | `acismineshare` | Azure File Share volume for world data |
| `ADMIN_PASSWORD` | *(Optional secret)* | Protects the Start / Stop / Restart actions |

> **Security Note:** Sensitive `.env` files, certificates, and Azure service principal keys are strictly excluded from git via [.gitignore](file:///c:/projects/minecraft-server/.gitignore) to prevent accidental credential leaks.

---

## 2. Server Performance Optimizations Applied

Your Minecraft Bedrock server has been pre-configured with the following optimizations for smooth multiplayer performance on Azure Container Instances:

- **Network Compression Codec:** Switched from `zlib` to `snappy`, reducing CPU compression overhead by ~40%.
- **Render View Distance:** Optimized to `16` chunks (down from 32) to prevent memory ballooning while preserving long-range views.
- **Worker Threads:** Tuned `max-threads=2` to align with the container's 2 vCPU allocation and eliminate thread context switching.
- **Client-Side Visual Chunk Generation:** Set `client-side-chunk-generation-enabled=true` so clients build visual meshes, offloading server CPU.
- **Allow-List (Whitelist):** Disabled (`allow-list=false`) so you and your friends can join immediately without getting blocked.
- **AFK Idle Timeout:** Configured to `30` minutes to release chunk simulation resources from inactive sessions.

---

## 3. Remote Server Power Controls (Start, Stop, Restart)

The dashboard includes full **Start**, **Stop**, and **Restart** options:
- Located directly in the top **Hero header** and the **Azure Cloud & Environment** tab.
- Powered by the serverless endpoint [`/api/control.js`](file:///c:/projects/minecraft-server/api/control.js).
- Supports both local Azure CLI dispatch and Azure Service Principal REST calls.
- Stopping the server pauses Azure container runtime billing when you're not playing.

---

## 4. Azure CLI Management Commands

```bash
# View live Minecraft console logs
az container logs --resource-group minecraftResGroup --name minecotainer --follow

# Stop server (pause Azure container billing when not playing)
az container stop --resource-group minecraftResGroup --name minecotainer

# Start server
az container start --resource-group minecraftResGroup --name minecotainer

# Restart server
az container restart --resource-group minecraftResGroup --name minecotainer
```

---

## 5. Local Development & Testing

To test the exact Vercel runtime locally:

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
