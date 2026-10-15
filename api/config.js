export default function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
  res.setHeader('Content-Type', 'application/json');

  const config = {
    host: process.env.MINECRAFT_SERVER_HOST || 'minesvrbedrock.southcentralus.azurecontainer.io',
    port: parseInt(process.env.MINECRAFT_SERVER_PORT, 10) || 19132,
    serverName: process.env.SERVER_NAME || 'Azure Bedrock Realm',
    region: process.env.AZURE_REGION || 'southcentralus',
    resourceGroup: process.env.AZURE_RESOURCE_GROUP || 'mineResGroup',
    containerName: process.env.AZURE_CONTAINER_NAME || 'minecotainer',
    storageAccount: process.env.AZURE_STORAGE_ACCOUNT || 'acismineacc',
    storageShare: process.env.AZURE_STORAGE_SHARE || 'acismineshare',
    hasAzureAuth: Boolean(process.env.AZURE_SUBSCRIPTION_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET)
  };

  res.status(200).json(config);
}
