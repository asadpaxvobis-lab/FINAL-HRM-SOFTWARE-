using System.Net;
using System.Text;

namespace Hrm.Agent;

public sealed class LocalZktecoListener : BackgroundService
{
    private static readonly string ZkOptions = string.Join("\r\n", new[]
    {
        "GETOPTIONFROM: 1",
        "Stamp=9999",
        "OpStamp=9999",
        "ErrorDelay=60",
        "Delay=30",
        "TransTimes=0",
        "TransInterval=1",
        "TransFlag=1111000000",
        "Realtime=1",
        "Encrypt=0",
        "TimeZone=5",
        "OK",
    });

    private readonly AgentOptions _options;
    private readonly PunchQueueStore _queue;
    private readonly ILogger<LocalZktecoListener> _log;
    private HttpListener? _listener;

    public LocalZktecoListener(AgentOptions options, PunchQueueStore queue, ILogger<LocalZktecoListener> log)
    {
        _options = options;
        _queue = queue;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _listener = new HttpListener();
        _listener.Prefixes.Add($"http://+:{_options.ListenPort}/");
        try
        {
            _listener.Start();
        }
        catch (HttpListenerException ex)
        {
            _log.LogError(ex, "Could not bind port {Port}. Run as admin or: netsh http add urlacl url=http://+:{Port}/ user=Everyone", _options.ListenPort, _options.ListenPort);
            return;
        }

        _log.LogInformation("Local ZKTeco listener on http://localhost:{Port}/iclock/cdata", _options.ListenPort);

        while (!stoppingToken.IsCancellationRequested)
        {
            HttpListenerContext ctx;
            try
            {
                ctx = await _listener.GetContextAsync().WaitAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Listener error");
                continue;
            }

            _ = Task.Run(() => HandleRequest(ctx), stoppingToken);
        }
    }

    private void HandleRequest(HttpListenerContext ctx)
    {
        try
        {
            var req = ctx.Request;
            var path = req.Url?.AbsolutePath ?? "";
            if (!path.Contains("iclock/cdata", StringComparison.OrdinalIgnoreCase))
            {
                Respond(ctx, 404, "Not Found");
                return;
            }

            var token = req.QueryString["token"] ?? req.Headers["X-Push-Token"];
            if (!string.IsNullOrEmpty(_options.PushToken) && token != _options.PushToken)
            {
                Respond(ctx, 401, "Unauthorized");
                return;
            }

            if (req.HttpMethod == "GET")
            {
                Respond(ctx, 200, ZkOptions);
                return;
            }

            if (req.HttpMethod != "POST")
            {
                Respond(ctx, 405, "Method Not Allowed");
                return;
            }

            using var reader = new StreamReader(req.InputStream, req.ContentEncoding);
            var body = reader.ReadToEnd();
            if (string.IsNullOrWhiteSpace(body))
            {
                Respond(ctx, 200, "OK");
                return;
            }

            var lines = body.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries);
            _queue.EnqueueLines(lines);
            var pending = _queue.PendingCount();
            _log.LogInformation("Received {Count} ATTLOG line(s), {Pending} pending sync", lines.Length, pending);
            Respond(ctx, 200, $"OK:{lines.Length}");
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Request handling failed");
            try { Respond(ctx, 500, "ERROR"); } catch { /* ignore */ }
        }
    }

    private static void Respond(HttpListenerContext ctx, int status, string body)
    {
        ctx.Response.StatusCode = status;
        ctx.Response.ContentType = "text/plain";
        var bytes = Encoding.UTF8.GetBytes(body);
        ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
        ctx.Response.Close();
    }

    public override Task StopAsync(CancellationToken cancellationToken)
    {
        _listener?.Stop();
        _listener?.Close();
        return base.StopAsync(cancellationToken);
    }
}
