using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddCors(o =>
{
    o.AddDefaultPolicy(p =>
        p.WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:5173"])
            .AllowAnyHeader()
            .AllowAnyMethod());
});

var supabaseUrl = builder.Configuration["Supabase:Url"] ?? "";
var jwtSecret = builder.Configuration["Supabase:JwtSecret"] ?? "";

if (!string.IsNullOrEmpty(jwtSecret))
{
    builder.Services
        .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = $"{supabaseUrl.TrimEnd('/')}/auth/v1",
                ValidateAudience = true,
                ValidAudience = "authenticated",
                ValidateLifetime = true,
                IssuerSigningKey = new SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(jwtSecret)),
            };
        });
    builder.Services.AddAuthorization();
}

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => Results.Ok(new
{
    status = "healthy",
    service = "Hrm.Api",
    time = DateTime.UtcNow,
}))
.WithName("Health")
.AllowAnonymous();

app.MapGet("/api/me", (ClaimsPrincipal user) =>
{
    if (user.Identity?.IsAuthenticated != true)
        return Results.Unauthorized();
    return Results.Ok(new
    {
        sub = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub"),
        email = user.FindFirstValue(ClaimTypes.Email) ?? user.FindFirstValue("email"),
    });
})
.RequireAuthorization();

app.MapControllers();
app.Run();
