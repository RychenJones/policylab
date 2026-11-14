namespace TransportPolicy;

public sealed record Result(double GasPct, double EvPct, double OtherPct)
{
    // Calculates the percentage-point change between two results.
    public static Result operator -(Result a, Result b) =>
        new(a.GasPct - b.GasPct, a.EvPct - b.EvPct, a.OtherPct - b.OtherPct);

    // Formats the result for console display.
    public override string ToString() =>
        $"gas {GasPct,6:F2}%   ev {EvPct,5:F2}%   other {OtherPct,5:F2}%";
}
