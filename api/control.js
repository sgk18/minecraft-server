import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const action = (req.query.action || req.body?.action || '').toLowerCase().trim();
  const allowedActions = ['start', 'stop', 'restart'];

  if (!allowedActions.includes(action)) {
    return res.status(400).json({
      success: false,
      error: `Invalid action '${action}'. Allowed actions: start, stop, restart.`
    });
  }

  // Security check: If ADMIN_PASSWORD is configured, verify it
  const adminSecret = process.env.ADMIN_PASSWORD || process.env.ADMIN_SECRET;
  const providedSecret = req.query.secret || req.headers['x-admin-secret'] || req.body?.secret;

  if (adminSecret && adminSecret !== providedSecret) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid admin secret or password provided.'
    });
  }

  const rg = process.env.AZURE_RESOURCE_GROUP || 'minecraftResGroup';
  const name = process.env.AZURE_CONTAINER_NAME || 'minecotainer';
  const sub = process.env.AZURE_SUBSCRIPTION_ID;
  const tenant = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  try {
    // 1. If Azure Service Principal credentials exist, use Azure REST API
    if (sub && tenant && clientId && clientSecret) {
      const tokenResp = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'https://management.azure.com/.default'
        })
      });

      if (tokenResp.ok) {
        const tokenData = await tokenResp.json();
        const actionUrl = `https://management.azure.com/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.ContainerInstance/containerGroups/${name}/${action}?api-version=2023-05-01`;
        
        const actionResp = await fetch(actionUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json'
          }
        });

        if (actionResp.ok || actionResp.status === 202 || actionResp.status === 204) {
          return res.status(200).json({
            success: true,
            action,
            message: `Successfully dispatched '${action}' command to Azure Container Instance '${name}'.`
          });
        }
      }
    }

    // 2. Local Azure CLI fallback (when running on server.js or local environment)
    const { stdout, stderr } = await execAsync(`az container ${action} --resource-group ${rg} --name ${name} --no-wait`);
    return res.status(200).json({
      success: true,
      action,
      message: `Azure CLI dispatched '${action}' on container '${name}' in resource group '${rg}'.`
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      action,
      error: err.message
    });
  }
}
