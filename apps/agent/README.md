# HRM ZKTeco Windows Agent

Local .NET 8 worker for **offline branches**: ZKTeco devices push attendance to this agent on the LAN; the agent queues punches in SQLite and syncs them to Supabase when the internet is available.

## How it works

```
ZKTeco device  →  http://<branch-server>:8088/iclock/cdata?token=...&SN=...
                         ↓
                  Local agent (SQLite queue)
                         ↓
                  Supabase `zkteco-push` edge function
```

1. **Local listener** — accepts the same ADMS push protocol as the cloud endpoint
2. **SQLite queue** — stores ATTLOG lines when cloud is unreachable
3. **Cloud sync worker** — POSTs queued lines to your Supabase `zkteco-push` URL every 30s

## Setup

1. Register the device in **Admin → Devices** and copy the **push token**
2. Edit `appsettings.json`:

```json
{
  "Agent": {
    "ListenPort": 8088,
    "DeviceSerial": "BRANCH-HQ-01",
    "PushToken": "your-push-token-here",
    "CloudPushUrl": "https://YOUR_PROJECT.supabase.co/functions/v1/zkteco-push/iclock/cdata",
    "SyncIntervalSeconds": 30,
    "QueueDbPath": "punch-queue.db"
  }
}
```

3. On the ZKTeco device, set the server URL to the **branch PC IP**:

```
http://192.168.1.50:8088/iclock/cdata?token=YOUR_PUSH_TOKEN&SN=BRANCH-HQ-01
```

4. Map each employee **Device PIN** in the HRM web app.

## Run

```powershell
cd apps/agent
dotnet run
```

### Install as Windows Service

```powershell
dotnet publish -c Release -o ./publish
sc create "HrmZKTecoAgent" binPath="C:\path\to\publish\Hrm.Agent.exe"
sc start HrmZKTecoAgent
```

### URL ACL (if port bind fails)

Run once as Administrator:

```powershell
netsh http add urlacl url=http://+:8088/ user=Everyone
```

## Files

| File | Purpose |
|------|---------|
| `LocalZktecoListener.cs` | HTTP listener for device push |
| `PunchQueueStore.cs` | SQLite offline queue |
| `CloudSyncWorker.cs` | Background sync to Supabase |
