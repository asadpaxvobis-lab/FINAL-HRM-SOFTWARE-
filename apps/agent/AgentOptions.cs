namespace Hrm.Agent;

public sealed class AgentOptions
{
    public const string Section = "Agent";

    public int ListenPort { get; set; } = 8088;
    public string DeviceSerial { get; set; } = "LOCAL-001";
    public string PushToken { get; set; } = "";
    public string CloudPushUrl { get; set; } = "";
    public int SyncIntervalSeconds { get; set; } = 30;
    public string QueueDbPath { get; set; } = "punch-queue.db";
}
