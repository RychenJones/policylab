namespace TransportPolicy;

public sealed record YearSnapshot(int Year, double GasPct, double EvPct, double NoCarPct);

public sealed record CohortBaseline(double GasPct, double EvPct, double NoCarPct);

public sealed record CohortResult(
    string Id,
    string Label,
    double PopulationPct,
    double GasPct,
    double EvPct,
    double NoCarPct,
    IReadOnlyList<YearSnapshot> Years)
{
    // The cohort's adjusted starting mix before policy effects.
    public CohortBaseline Baseline { get; init; } = new(0, 0, 0);
}

public sealed record Result(double GasPct, double EvPct, double NoCarPct)
{
    // One snapshot for each simulated year, captured after that year's update.
    public IReadOnlyList<YearSnapshot> Years { get; init; } = [];

    public IReadOnlyList<CohortResult> Cohorts { get; init; } = [];

    // Subtracts two simulations to produce percentage-point policy effects.
    public static Result operator -(Result a, Result b) =>
        new(a.GasPct - b.GasPct, a.EvPct - b.EvPct, a.NoCarPct - b.NoCarPct)
        {
            Years = a.Years.Zip(b.Years, (left, right) => new YearSnapshot(
                left.Year, left.GasPct - right.GasPct, left.EvPct - right.EvPct,
                left.NoCarPct - right.NoCarPct)).ToArray(),
            Cohorts = a.Cohorts.Zip(b.Cohorts, (left, right) => new CohortResult(
                left.Id, left.Label, left.PopulationPct,
                left.GasPct - right.GasPct, left.EvPct - right.EvPct,
                left.NoCarPct - right.NoCarPct,
                left.Years.Zip(right.Years, (l, r) => new YearSnapshot(
                    l.Year, l.GasPct - r.GasPct, l.EvPct - r.EvPct,
                    l.NoCarPct - r.NoCarPct)).ToArray())
                {
                    // Preserve baseline metadata because it is not itself a policy delta.
                    Baseline = left.Baseline
                }).ToArray()
        };

    // Formats the result for console display.
    public override string ToString() =>
        $"gas {GasPct,6:F2}%   ev {EvPct,5:F2}%   no car {NoCarPct,5:F2}%";
}
