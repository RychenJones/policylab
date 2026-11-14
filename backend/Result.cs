namespace TransportPolicy;

public sealed record Result(double GasPct, double EvPct, double NoCarPct)
{
    // Calculates the percentage-point change between two results.
    public static Result operator -(Result a, Result b) =>
        new(a.GasPct - b.GasPct, a.EvPct - b.EvPct, a.NoCarPct - b.NoCarPct);

    // Formats the result for console display.
    public override string ToString() =>
        $"gas {GasPct,6:F2}%   ev {EvPct,5:F2}%   no car {NoCarPct,5:F2}%";
}
