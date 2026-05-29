using System.Net.Http.Headers;
using System.Text;

namespace Hrm.Agent;

public sealed class CloudSyncWorker : BackgroundService
{
    private readonly AgentOptions _options;
    private readonly PunchQueueStore _queue;
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<CloudSyncWorker> _log;

    public CloudSyncWorker(
        AgentOptions options,
        PunchQueueStore queue,
        IHttpClientFactory httpFactory,
        ILogger<CloudSyncWorker> log)
    {
        _options = options;
        _queue = queue;
        _httpFactory = httpFactory;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (string.IsNullOrWhiteSpace(_options.CloudPushUrl) || string.IsNullOrWhiteSpace(_options.PushToken))
        {
            _log.LogWarning("CloudPushUrl or PushToken not configured — sync worker idle");
            return;
        }

        _log.LogInformation("Cloud sync worker started (every {Sec}s)", _options.SyncIntervalSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SyncBatchAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _log.LogError(ex, "Cloud sync batch failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(_options.SyncIntervalSeconds), stoppingToken);
        }
    }

    private async Task SyncBatchAsync(CancellationToken ct)
    {
        var pending = _queue.GetPending();
        if (pending.Count == 0) return;

        var body = string.Join("\r\n", pending.Select(p => p.Line));
        var url = BuildCloudUrl();

        var client = _httpFactory.CreateClient("cloud");
        using var content = new StringContent(body, Encoding.UTF8, "text/plain");
        content.Headers.ContentType = new MediaTypeHeaderValue("text/plain");

        using var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = content };
        req.Headers.Add("X-Push-Token", _options.PushToken);

        var res = await client.SendAsync(req, ct);
        var text = await res.Content.ReadAsStringAsync(ct);

        if (!res.IsSuccessStatusCode)
        {
            _log.LogWarning("Cloud push failed {Status}: {Body}", res.StatusCode, text);
            return;
        }

        _queue.MarkSynced(pending.Select(p => p.Id));
        _log.LogInformation("Synced {Count} punch line(s) to cloud — {Response}", pending.Count, text.Trim());
    }

    private string BuildCloudUrl()
    {
        var baseUrl = _options.CloudPushUrl.TrimEnd('/');
        var sep = baseUrl.Contains('?') ? '&' : '?';
        return $"{baseUrl}{sep}token={Uri.EscapeDataString(_options.PushToken)}&SN={Uri.EscapeDataString(_options.DeviceSerial)}&table=ATTLOG";
    }
}
