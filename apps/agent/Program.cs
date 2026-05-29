using Hrm.Agent;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddWindowsService(options => options.ServiceName = "Hrm ZKTeco Agent");

var agentOptions = builder.Configuration.GetSection(AgentOptions.Section).Get<AgentOptions>() ?? new AgentOptions();
builder.Services.AddSingleton(agentOptions);
builder.Services.AddSingleton<PunchQueueStore>();
builder.Services.AddHttpClient("cloud", c => c.Timeout = TimeSpan.FromSeconds(60));

builder.Services.AddHostedService<LocalZktecoListener>();
builder.Services.AddHostedService<CloudSyncWorker>();

var host = builder.Build();
host.Run();
