using System.Text.Json;

namespace TransportPolicy;

public sealed record InputRule(double Min, double Max, double Step);
public sealed record PolicyDefaults(double BaseGasShare, double BaseEvShare, double BaseNoCarShare,
    double GasTax, double EvRebate, double TransitFare);
public sealed record SimulationRequest(double BaseGasShare, double BaseEvShare, double BaseNoCarShare,
    double GasTax, double EvRebate, double TransitFare, int SimulatedYears);

public static class ApiBoundary
{
    // Fraction precision matches the frontend's 0.001 percentage-point entry.
    // All three categories must be positive for logarithmic calibration.
    public static readonly IReadOnlyDictionary<string, InputRule> Inputs = new Dictionary<string, InputRule>
    {
        ["baseGasShare"] = new(0.00001, 0.99998, 0.00001),
        ["baseEvShare"] = new(0.00001, 0.99998, 0.00001),
        ["baseNoCarShare"] = new(0.00001, 0.99998, 0.00001),
        ["gasTax"] = new(0, 10, 0.05),
        ["evRebate"] = new(0, 20000, 250),
        ["transitFare"] = new(0, 15, 0.25),
        ["simulatedYears"] = new(1, 100, 1)
    };

    public static PolicyDefaults Defaults => new(Simulator.Cfg.BaseShare.Gas, Simulator.Cfg.BaseShare.Ev,
        Simulator.Cfg.BaseShare.NoCar, 1, 7500, Simulator.Cfg.BaseFare);

    public static (SimulationRequest? Request, Dictionary<string, string[]> Errors) Read(JsonElement root)
    {
        var errors = new Dictionary<string, string[]>();
        var values = new Dictionary<string, double>();
        var seen = new HashSet<string>();
        if (root.ValueKind != JsonValueKind.Object)
            return (null, new() { ["body"] = ["Send a JSON object with the seven scenario fields."] });
        foreach (var property in root.EnumerateObject())
        {
            if (!Inputs.TryGetValue(property.Name, out var rule))
                errors["body"] = ["Unknown scenario field. Send only the six documented fields."];
            else if (!seen.Add(property.Name)) errors[property.Name] = ["Duplicate fields are not allowed."];
            else if (property.Value.ValueKind != JsonValueKind.Number || !property.Value.TryGetDouble(out var value) || !double.IsFinite(value))
                errors[property.Name] = ["Enter a finite JSON number."];
            else if (value < rule.Min || value > rule.Max)
                errors[property.Name] = [FormattableString.Invariant($"Enter a value from {rule.Min} to {rule.Max}.")];
            else values[property.Name] = value;
        }
        foreach (var field in Inputs.Keys)
            if (!seen.Contains(field)) errors[field] = ["Required."];
        string[] shares = ["baseGasShare", "baseEvShare", "baseNoCarShare"];
        if (shares.All(values.ContainsKey) && Math.Abs(shares.Sum(key => values[key]) - 1) > 1e-8)
            errors["body"] = ["Starting shares must sum to 1 (100%)."];
        if (errors.Count > 0) return (null, errors);
        if (values.ContainsKey("simulatedYears") && Math.Truncate(values["simulatedYears"]) != values["simulatedYears"])
            errors["simulatedYears"] = ["Enter a whole number of years."];
        if (errors.Count > 0) return (null, errors);
        return (new(values["baseGasShare"], values["baseEvShare"], values["baseNoCarShare"],
            values["gasTax"], values["evRebate"], values["transitFare"], (int)values["simulatedYears"]), errors);
    }

    public static Result Calculate(SimulationRequest request, CancellationToken token = default)
    {
        var config = Simulator.Cfg with {
            BaseShare = new Mode(request.BaseGasShare, request.BaseEvShare, request.BaseNoCarShare)
        };
        var result = Simulator.Simulate(config, request.GasTax, request.EvRebate, request.TransitFare,
            request.SimulatedYears, token);
        double[] shares = [result.GasPct, result.EvPct, result.NoCarPct];
        if (shares.Any(value => !double.IsFinite(value) || value < 0 || value > 100) || Math.Abs(shares.Sum() - 100) > 1e-6)
            throw new InvalidOperationException("Simulation returned invalid shares.");
        if (result.Cohorts.Count != config.Cohorts.Count || result.Years.Count != request.SimulatedYears ||
            result.Cohorts.Any(cohort => cohort.Years.Count != request.SimulatedYears ||
                new[] { cohort.GasPct, cohort.EvPct, cohort.NoCarPct }.Any(value => !double.IsFinite(value) || value < 0 || value > 100) ||
                Math.Abs(cohort.GasPct + cohort.EvPct + cohort.NoCarPct - 100) > 1e-6))
            throw new InvalidOperationException("Simulation returned invalid cohort results.");
        // Return the final values plus the yearly snapshots. Never clamp,
        // normalize, fabricate household outcomes, or expose internal model objects.
        return result;
    }
}
