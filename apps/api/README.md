# HRM API (.NET 8)

ASP.NET Core Web API for business logic, ZKTeco webhooks, SignalR, and payroll engine.

## Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)

## Configuration

Copy secrets into `appsettings.Development.json` or user secrets (never commit):

- `Supabase:JwtSecret` — from Supabase Dashboard → Project Settings → API → JWT Secret
- `Supabase:ServiceRoleKey` — service role key (server only)
- `ConnectionStrings:Default` — Postgres connection string

## Run

```powershell
cd apps/api
dotnet restore
dotnet run
```

Swagger: http://localhost:5080/swagger

Health: http://localhost:5080/api/health

## Next steps (planned)

- Permission authorization handler + `[Permission("module.action")]`
- Audit log middleware
- SignalR `/hubs/attendance`
- ZKTeco push `/iclock/cdata`
- Payroll calculation services
