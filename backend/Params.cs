namespace TransportPolicy;

public sealed record Params(
    double BetaFare,
    double BetaFuel,
    double AscTransit,
    double AscOther,
    double AscEv);
