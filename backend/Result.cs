namespace TransportPolicy;

public sealed record YearSnapshot(int Year, double GasPct, double EvPct, double NoCarPct);

public sealed record Result(double GasPct, double EvPct, double NoCarPct)
{
    // One snapshot for each simulated year, captured after that year's update.
    public IReadOnlyList<YearSnapshot> Years { get; init; } = [];

    // Calculates the percentage-point change between two results.
    public static Result operator -(Result a, Result b) =>
        new(a.GasPct - b.GasPct, a.EvPct - b.EvPct, a.NoCarPct - b.NoCarPct);

    // Formats the result for console display.
    public override string ToString() =>
        $"gas {GasPct,6:F2}%   ev {EvPct,5:F2}%   no car {NoCarPct,5:F2}%";
}
