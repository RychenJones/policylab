using System.Text.Json;

namespace TransportPolicy;

public static class WebHost
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = args,
            WebRootPath = Path.Combine(AppContext.BaseDirectory, "wwwroot")
        });
        builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 16 * 1024);
        var origins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? ["http://localhost:5173"];
        builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.WithOrigins(origins)
            .WithMethods("GET", "POST", "OPTIONS").WithHeaders("Content-Type", "Accept")));
        var app = builder.Build();
        app.Use(async (context, next) =>
        {
            try
            {
                await next(context);
                if (context.Response.StatusCode >= 400 && !context.Response.HasStarted)
                    await Problem(context, context.Response.StatusCode, "request_rejected");
            }
            catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { context.Abort(); }
            catch (BadHttpRequestException error)
            {
                if (!context.Response.HasStarted) await Problem(context, error.StatusCode, "invalid_request");
                else context.Abort();
            }
            catch (Exception error)
            {
                app.Logger.LogError(error, "API failure {TraceId}", context.TraceIdentifier);
                if (!context.Response.HasStarted) await Problem(context, 500, "simulation_failed");
                else context.Abort();
            }
        });
        app.UseRouting();
        app.UseCors();
        app.UseDefaultFiles();
        app.UseStaticFiles();
        app.MapGet("/api/health", () => Results.Json(new { status = "ok" }));
        app.MapGet("/api/config", () => Results.Json(new
        {
            defaults = ApiBoundary.Defaults, inputs = ApiBoundary.Inputs,
            simulatedYears = Simulator.Cfg.SimulatedYears,
            assumptions = new[] {
                "Deterministic aggregate model; exploratory estimates, not forecasts.",
                "Starting shares are fractions and must sum to 1. Each category must be at least 0.001% for calibration.",
                "The model returns gas, EV, and no-car percentages. No individual households are simulated.",
                "Any displayed household counts are equivalent shares of 5,000, not observed switching households."
            }
        }));
        app.MapPost("/api/simulate", async (HttpContext context) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            if (!context.Request.HasJsonContentType())
            {
                await Validation(context, new() { ["body"] = ["Send JSON with Content-Type: application/json."] });
                return;
            }
            JsonDocument body;
            try { body = await JsonDocument.ParseAsync(context.Request.Body, new JsonDocumentOptions { MaxDepth = 8 }, context.RequestAborted); }
            catch (JsonException)
            {
                await Validation(context, new() { ["body"] = ["Send a valid JSON object."] });
                return;
            }
            using (body)
            {
                var (request, errors) = ApiBoundary.Read(body.RootElement);
                if (request is null) { await Validation(context, errors); return; }
                var result = ApiBoundary.Calculate(request, context.RequestAborted);
                await context.Response.WriteAsJsonAsync(result, context.RequestAborted);
            }
        });
        app.Run();
    }

    private static Task Validation(HttpContext context, Dictionary<string, string[]> errors) =>
        Results.ValidationProblem(errors, extensions: new Dictionary<string, object?> { ["traceId"] = context.TraceIdentifier }).ExecuteAsync(context);

    private static Task Problem(HttpContext context, int status, string code) => Results.Problem(statusCode: status,
        title: Microsoft.AspNetCore.WebUtilities.ReasonPhrases.GetReasonPhrase(status),
        extensions: new Dictionary<string, object?> { ["code"] = code, ["traceId"] = context.TraceIdentifier }).ExecuteAsync(context);
}
