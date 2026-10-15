# ==============================================================================
# Azure Minecraft Bedrock Server Deployment Script
# Provisions a dedicated Minecraft Bedrock container with Azure Files persistent storage
# ==============================================================================

[CmdletBinding()]
param (
    [string]$ResourceGroupName = "minecraftResGroup",
    [string]$Location = "centralindia",
    [string]$StorageAccountName = "surymineacc",
    [string]$FileShareName = "acismineshare",
    [string]$ContainerName = "minecotainer",
    [string]$DnsNameLabel = "minesvrbedrock",
    [string]$ServerName = "Azure Bedrock Realm",
    [string]$Gamemode = "survival",
    [string]$Difficulty = "normal",
    [int]$Cpu = 2,
    [int]$MemoryGb = 4
)

$ErrorActionPreference = "Continue"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Azure Bedrock Server Deployment & Configuration" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check Azure CLI
Write-Host "[1/5] Checking Azure CLI login..." -ForegroundColor Yellow
$accountJson = az account show -o json
if (-not $accountJson) {
    Write-Host "Please log in to your Azure account..." -ForegroundColor Cyan
    az login
    $accountJson = az account show -o json
}
$account = $accountJson | ConvertFrom-Json
Write-Host "Logged into Azure Subscription: $($account.name)" -ForegroundColor Green

# 2. Create Resource Group
Write-Host "`n[2/5] Creating / Verifying Resource Group '$ResourceGroupName' in '$Location'..." -ForegroundColor Yellow
az group create --name $ResourceGroupName --location $Location --output none
Write-Host "Resource Group '$ResourceGroupName' ready." -ForegroundColor Green

# 3. Create Storage Account & File Share for persistent Minecraft world
Write-Host "`n[3/5] Setting up persistent Azure Files Storage for world data..." -ForegroundColor Yellow
$storageCheck = az storage account check-name --name $StorageAccountName -o json | ConvertFrom-Json
$existingInSub = az storage account list --resource-group $ResourceGroupName --query "[?name=='$StorageAccountName'].name" -o tsv

if (-not $storageCheck.nameAvailable -and [string]::IsNullOrWhiteSpace($existingInSub)) {
    $randomSuffix = Get-Random -Minimum 1000 -Maximum 9999
    $cleanPrefix = ($StorageAccountName -replace '[^a-z0-9]', '')
    if ($cleanPrefix.Length > 19) { $cleanPrefix = $cleanPrefix.Substring(0, 19) }
    $uniqueStorage = "$cleanPrefix$randomSuffix"
    Write-Host "Notice: Storage account '$StorageAccountName' is taken globally by another Azure user." -ForegroundColor Yellow
    Write-Host "Generating unique available storage account name: '$uniqueStorage'..." -ForegroundColor Cyan
    $StorageAccountName = $uniqueStorage
    az storage account create `
        --resource-group $ResourceGroupName `
        --name $StorageAccountName `
        --location $Location `
        --sku Standard_LRS `
        --kind StorageV2 `
        --output none
} elseif ($storageCheck.nameAvailable) {
    Write-Host "Creating storage account '$StorageAccountName'..." -ForegroundColor Cyan
    az storage account create `
        --resource-group $ResourceGroupName `
        --name $StorageAccountName `
        --location $Location `
        --sku Standard_LRS `
        --kind StorageV2 `
        --output none
} else {
    Write-Host "Using existing storage account '$StorageAccountName' in your subscription." -ForegroundColor Green
}

Write-Host "Retrieving storage account key..." -ForegroundColor Cyan
$STORAGE_KEY = $(az storage account keys list --resource-group $ResourceGroupName --account-name $StorageAccountName --query "[0].value" -o tsv)

Write-Host "Creating Azure File Share '$FileShareName'..." -ForegroundColor Cyan
az storage share create --name $FileShareName --account-name $StorageAccountName --account-key $STORAGE_KEY --output none

# 4. Create Container Instance (ACI)
Write-Host "`n[4/5] Deploying Minecraft Bedrock Server container (ACI)..." -ForegroundColor Yellow
$fqdn = "$DnsNameLabel.$Location.azurecontainer.io"
Write-Host "  - FQDN Target: $fqdn:19132" -ForegroundColor Cyan
Write-Host "  - CPU: $Cpu vCPU | Memory: ${MemoryGb} GB" -ForegroundColor Cyan

# Check if DNS label is taken and auto-resolve if needed
$deploySuccess = $false
$activeDns = $DnsNameLabel

try {
    az container create `
        --resource-group $ResourceGroupName `
        --name $ContainerName `
        --image itzg/minecraft-bedrock-server `
        --os-type Linux `
        --dns-name-label $activeDns `
        --ports 19132 19133 `
        --protocol udp `
        --cpu $Cpu `
        --memory $MemoryGb `
        --restart-policy OnFailure `
        --environment-variables `
            EULA="TRUE" `
            SERVER_NAME="$ServerName" `
            GAMEMODE="$Gamemode" `
            DIFFICULTY="$Difficulty" `
            LEVEL_NAME="Bedrock level" `
            SERVER_PORT=19132 `
            SERVER_PORT_V6=19133 `
        --azure-file-volume-account-name $StorageAccountName `
        --azure-file-volume-account-key $STORAGE_KEY `
        --azure-file-volume-share-name $FileShareName `
        --azure-file-volume-mount-path /data `
        --output none
    $deploySuccess = $true
} catch {
    Write-Host "DNS label '$activeDns' was taken or failed. Retrying with unique DNS label..." -ForegroundColor Yellow
    $activeDns = "$DnsNameLabel$(Get-Random -Minimum 100 -Maximum 999)"
    az container create `
        --resource-group $ResourceGroupName `
        --name $ContainerName `
        --image itzg/minecraft-bedrock-server `
        --os-type Linux `
        --dns-name-label $activeDns `
        --ports 19132 19133 `
        --protocol udp `
        --cpu $Cpu `
        --memory $MemoryGb `
        --restart-policy OnFailure `
        --environment-variables `
            EULA="TRUE" `
            SERVER_NAME="$ServerName" `
            GAMEMODE="$Gamemode" `
            DIFFICULTY="$Difficulty" `
            LEVEL_NAME="Bedrock level" `
            SERVER_PORT=19132 `
            SERVER_PORT_V6=19133 `
        --azure-file-volume-account-name $StorageAccountName `
        --azure-file-volume-account-key $STORAGE_KEY `
        --azure-file-volume-share-name $FileShareName `
        --azure-file-volume-mount-path /data `
        --output none
    $deploySuccess = $true
}

$fqdn = "$activeDns.$Location.azurecontainer.io"

# Automatically update .env file for local dev & Vercel
$envPath = Join-Path $PSScriptRoot ".env"
$envContent = @"
MINECRAFT_SERVER_HOST=$fqdn
MINECRAFT_SERVER_PORT=19132
SERVER_NAME=$ServerName
AZURE_REGION=$Location
AZURE_RESOURCE_GROUP=$ResourceGroupName
AZURE_CONTAINER_NAME=$ContainerName
AZURE_STORAGE_ACCOUNT=$StorageAccountName
AZURE_STORAGE_SHARE=$FileShareName
AZURE_SUBSCRIPTION_ID=$($account.id)
AZURE_TENANT_ID=$($account.tenantId)
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
"@
Set-Content -Path $envPath -Value $envContent -Encoding utf8
Write-Host "`nUpdated .env with live Azure deployment endpoint: $fqdn" -ForegroundColor Green

# 5. Success Summary
Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  Server Deployed Successfully on Azure!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Server Name:       $ServerName" -ForegroundColor White
Write-Host "Connection Domain: $fqdn" -ForegroundColor Cyan
Write-Host "IPv4 Port:         19132 (UDP)" -ForegroundColor Cyan
Write-Host "IPv6 Port:         19133 (UDP)" -ForegroundColor Cyan
Write-Host "Storage Account:   $StorageAccountName" -ForegroundColor Yellow
Write-Host "Dashboard File:    index.html (or server-status.html)" -ForegroundColor Yellow
Write-Host "`nUseful Commands:" -ForegroundColor White
Write-Host "  View Logs:       az container logs -g $ResourceGroupName -n $ContainerName --follow"
Write-Host "  Stop Server:     az container stop -g $ResourceGroupName -n $ContainerName"
Write-Host "  Start Server:    az container start -g $ResourceGroupName -n $ContainerName"
Write-Host "  Restart Server:  az container restart -g $ResourceGroupName -n $ContainerName"
Write-Host "==========================================================`n" -ForegroundColor Green
