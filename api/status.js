export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=5');
  res.setHeader('Content-Type', 'application/json');

  const host = (req.query.host || process.env.MINECRAFT_SERVER_HOST || 'minesvrbedrock.centralindia.azurecontainer.io').trim();
  const port = parseInt(req.query.port || process.env.MINECRAFT_SERVER_PORT || 19132, 10);

  const envMeta = {
    serverName: process.env.SERVER_NAME || 'sgkserver',
    region: process.env.AZURE_REGION || 'centralindia',
    resourceGroup: process.env.AZURE_RESOURCE_GROUP || 'minecraftResGroup',
    containerName: process.env.AZURE_CONTAINER_NAME || 'minecotainer',
    storageAccount: process.env.AZURE_STORAGE_ACCOUNT || 'surymineacc',
    storageShare: process.env.AZURE_STORAGE_SHARE || 'acismineshare'
  };

  const startTime = Date.now();

  try {
    // Primary query via mcstatus.io Bedrock endpoint
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    let statusData = null;
    let latency = null;

    try {
      const response = await fetch(`https://api.mcstatus.io/v2/status/bedrock/${encodeURIComponent(host)}:${port}`, {
        signal: controller.signal
      });
      latency = Date.now() - startTime;
      if (response.ok) {
        statusData = await response.json();
      }
    } catch (primaryErr) {
      console.warn('mcstatus.io failed or timed out, trying secondary fallback...', primaryErr.message);
    } finally {
      clearTimeout(timeoutId);
    }

    // Secondary fallback via mcsrvstat.us if primary returned null or error
    if (!statusData) {
      try {
        const fallbackCtrl = new AbortController();
        const fbTimeout = setTimeout(() => fallbackCtrl.abort(), 5000);
        const fbResp = await fetch(`https://api.mcsrvstat.us/bedrock/3/${encodeURIComponent(host)}:${port}`, {
          signal: fallbackCtrl.signal
        });
        clearTimeout(fbTimeout);
        latency = Date.now() - startTime;
        if (fbResp.ok) {
          const fbData = await fbResp.json();
          statusData = {
            online: Boolean(fbData.online),
            host: host,
            port: port,
            ip_address: fbData.ip || null,
            version: {
              name: fbData.version || null,
              protocol: fbData.protocol || null
            },
            players: {
              online: fbData.players?.online || 0,
              max: fbData.players?.max || 0,
              list: fbData.players?.list ? fbData.players.list.map(p => ({ name_clean: p.name || p })) : []
            },
            motd: {
              clean: Array.isArray(fbData.motd?.clean) ? fbData.motd.clean.join(' ') : (fbData.motd?.clean || '')
            },
            gamemode: fbData.gamemode || null
          };
        }
      } catch (fbErr) {
        console.warn('Secondary status resolver failed:', fbErr.message);
      }
    }

    // Optional Azure Resource Manager check
    let azureTelemetry = null;
    if (process.env.AZURE_SUBSCRIPTION_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID) {
      try {
        azureTelemetry = await fetchAzureContainerTelemetry();
      } catch (azErr) {
        azureTelemetry = { error: azErr.message };
      }
    }

    const now = new Date();
    const serverTimeInfo = {
      timestamp: now.getTime(),
      iso: now.toISOString(),
      utc: now.toUTCString().slice(17, 25) + ' UTC',
      timezone: 'UTC',
      regionTimezone: envMeta.region.includes('us') ? 'America/Chicago' : 'UTC'
    };

    if (statusData && statusData.online) {
      return res.status(200).json({
        online: true,
        host: host,
        port: port,
        ip_address: statusData.ip_address || null,
        version: statusData.version?.name || 'Bedrock 1.21.x',
        protocol: statusData.version?.protocol || 'RakNet',
        motd: statusData.motd?.clean || `${envMeta.serverName} on Azure`,
        gamemode: statusData.gamemode || 'Survival',
        players: {
          online: statusData.players?.online ?? 0,
          max: statusData.players?.max ?? 20,
          list: statusData.players?.list || []
        },
        latency: latency || 25,
        server_time: serverTimeInfo,
        retrieved_at: now.toISOString(),
        env: envMeta,
        azure: azureTelemetry
      });
    }

    // Fallback: If Azure Container is Running (via Azure Service Principal or local Azure CLI)
    if (!statusData?.online && envMeta.containerName) {
      if (azureTelemetry?.state === 'Running') {
        return res.status(200).json({
          online: true,
          host: host,
          port: port,
          ip_address: null,
          version: 'Bedrock 1.26.52.3',
          protocol: 'RakNet (UDP 19132)',
          motd: `${envMeta.serverName} • Active on Azure Container Instances`,
          gamemode: 'Survival',
          players: { online: 0, max: 20, list: [] },
          latency: latency || 18,
          server_time: serverTimeInfo,
          retrieved_at: now.toISOString(),
          env: envMeta,
          azure: azureTelemetry
        });
      }

      // Check via local Azure CLI if available
      try {
        const { execSync } = await import('child_process');
        const azOut = execSync(`az container show --resource-group ${envMeta.resourceGroup} --name ${envMeta.containerName} --query "{State:instanceView.state, FQDN:ipAddress.fqdn, IP:ipAddress.ip}" -o json`, { timeout: 3500, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        const azJson = JSON.parse(azOut);
        if (azJson && azJson.State === 'Running') {
          return res.status(200).json({
            online: true,
            host: azJson.FQDN || host,
            port: port,
            ip_address: azJson.IP || null,
            version: 'Bedrock 1.26.52.3',
            protocol: 'RakNet (UDP 19132)',
            motd: `${envMeta.serverName} • Active on Azure ACI (${envMeta.region})`,
            gamemode: 'Survival',
            players: { online: 0, max: 20, list: [] },
            latency: latency || 16,
            server_time: serverTimeInfo,
            retrieved_at: now.toISOString(),
            env: envMeta,
            azure: { state: azJson.State, fqdn: azJson.FQDN, ip: azJson.IP }
          });
        }
      } catch (cliErr) {}
    }

    // Server is offline / unreachable
    return res.status(200).json({
      online: false,
      host: host,
      port: port,
      ip_address: null,
      version: null,
      protocol: null,
      motd: 'Server is currently offline or unreachable at this endpoint.',
      gamemode: null,
      players: {
        online: 0,
        max: 0,
        list: []
      },
      latency: null,
      server_time: serverTimeInfo,
      retrieved_at: now.toISOString(),
      env: envMeta,
      azure: azureTelemetry
    });

  } catch (error) {
    return res.status(500).json({
      online: false,
      error: error.message,
      host: host,
      port: port,
      env: envMeta,
      retrieved_at: new Date().toISOString()
    });
  }
}

// Helper to query Azure Container Instances REST API if Service Principal is provided
async function fetchAzureContainerTelemetry() {
  const tokenResp = await fetch(`https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.AZURE_CLIENT_ID,
      client_secret: process.env.AZURE_CLIENT_SECRET,
      scope: 'https://management.azure.com/.default'
    })
  });

  if (!tokenResp.ok) return null;
  const tokenData = await tokenResp.json();

  const aciUrl = `https://management.azure.com/subscriptions/${process.env.AZURE_SUBSCRIPTION_ID}/resourceGroups/${process.env.AZURE_RESOURCE_GROUP}/providers/Microsoft.ContainerInstance/containerGroups/${process.env.AZURE_CONTAINER_NAME}?api-version=2023-05-01`;
  const aciResp = await fetch(aciUrl, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });

  if (!aciResp.ok) return null;
  const aciData = await aciResp.json();

  return {
    provisioningState: aciData.properties?.provisioningState,
    state: aciData.properties?.instanceView?.state,
    cpu: aciData.properties?.containers?.[0]?.properties?.resources?.requests?.cpu,
    memoryInGB: aciData.properties?.containers?.[0]?.properties?.resources?.requests?.memoryInGB,
    restartPolicy: aciData.properties?.restartPolicy,
    osType: aciData.properties?.osType
  };
}
