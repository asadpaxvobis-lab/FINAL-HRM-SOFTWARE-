using Microsoft.Data.Sqlite;

namespace Hrm.Agent;

public sealed class PunchQueueStore
{
    private readonly string _dbPath;
    private readonly ILogger<PunchQueueStore> _log;

    public PunchQueueStore(AgentOptions options, ILogger<PunchQueueStore> log)
    {
        _dbPath = options.QueueDbPath;
        _log = log;
        EnsureSchema();
    }

    private void EnsureSchema()
    {
        using var conn = Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE IF NOT EXISTS punch_queue (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              attlog_line TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              synced_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_punch_queue_pending ON punch_queue(synced_at);
            """;
        cmd.ExecuteNonQuery();
    }

    private SqliteConnection Open()
    {
        var conn = new SqliteConnection($"Data Source={_dbPath}");
        conn.Open();
        return conn;
    }

    public void EnqueueLines(IEnumerable<string> lines)
    {
        using var conn = Open();
        using var tx = conn.BeginTransaction();
        foreach (var line in lines)
        {
            var trimmed = line.Trim();
            if (string.IsNullOrEmpty(trimmed)) continue;
            using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = "INSERT INTO punch_queue (attlog_line) VALUES ($line)";
            cmd.Parameters.AddWithValue("$line", trimmed);
            cmd.ExecuteNonQuery();
        }
        tx.Commit();
        _log.LogInformation("Queued {Count} punch line(s)", lines.Count());
    }

    public IReadOnlyList<(long Id, string Line)> GetPending(int limit = 200)
    {
        using var conn = Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT id, attlog_line FROM punch_queue
            WHERE synced_at IS NULL
            ORDER BY id
            LIMIT $limit
            """;
        cmd.Parameters.AddWithValue("$limit", limit);
        using var reader = cmd.ExecuteReader();
        var list = new List<(long, string)>();
        while (reader.Read())
            list.Add((reader.GetInt64(0), reader.GetString(1)));
        return list;
    }

    public void MarkSynced(IEnumerable<long> ids)
    {
        var idList = ids.ToList();
        if (idList.Count == 0) return;
        using var conn = Open();
        using var tx = conn.BeginTransaction();
        foreach (var id in idList)
        {
            using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = "UPDATE punch_queue SET synced_at = datetime('now') WHERE id = $id";
            cmd.Parameters.AddWithValue("$id", id);
            cmd.ExecuteNonQuery();
        }
        tx.Commit();
    }

    public int PendingCount()
    {
        using var conn = Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT COUNT(*) FROM punch_queue WHERE synced_at IS NULL";
        return Convert.ToInt32(cmd.ExecuteScalar());
    }
}
