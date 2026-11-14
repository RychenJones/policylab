namespace TransportPolicy;

public sealed record Config
{
    // Prices / physical constants (PLACEHOLDERS).
    public double BaseGasPrice { get; init; } = 3.10;
    public double BaseFare { get; init; } = 1.75;
    public double TripsPerYear { get; init; } = 480;
    public double Miles { get; init; } = 12_000;
    public double Mpg { get; init; } = 26.0;
    public double KwhPerMile { get; init; } = 0.30;
    public double ElecPrice { get; init; } = 0.17;
    public double EvPricePremium { get; init; } = 8_000;

    // Baselines (ACS 2024 commuters, WFH excluded).
    public Mode BaseShare { get; init; } = new(0.904, 0.043, 0.053);
    public double EvFleetShare0 { get; init; } = 0.02;
    public double EvNewShareBase { get; init; } = 0.06;

    // Dynamics.
    public int HorizonYears { get; init; } = 5;
    public double Turnover { get; init; } = 0.07;
    public double Lambda { get; init; } = 1.0 / 3.0;

    // Behavior.
    public double PaybackYears { get; init; } = 3;
    public double FuelMyopia { get; init; } = 0.5;
    public double EFare { get; init; } = -0.35;
    public double EFuelMode { get; init; } = -0.30 * 0.15;
    public double BetaRebate { get; init; } = 5e-5;
}
