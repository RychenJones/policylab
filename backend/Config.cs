namespace TransportPolicy;

public sealed record Config
{
    // Prices / physical constants (PLACEHOLDERS).
    public double BaseGasPrice { get; init; } = 3.10;
    public double BaseFare { get; init; } = 1.75;
    public double TripsPerYear { get; init; } = 480;
    public double MilesPerYear { get; init; } = 12_000;
    public double Mpg { get; init; } = 26.0;
    public double KwhPerMile { get; init; } = 0.30;
    public double ElectricityPricePerKwh { get; init; } = 0.17;
    public double EvPricePremium { get; init; } = 8_000;

    // Baselines (ACS 2024 commuters, WFH excluded). The three shares are
    // mutually exclusive: gas vehicle, EV, and no car.
    public Mode BaseShare { get; init; } = new(0.904 * (1.0 - 0.02), 0.904 * 0.02, 1.0 - 0.904);
    // Dynamics.
    public double ShareAdjustmentRate { get; init; } = 1.0 / 3.0;

    // Behavior.
    public double FuelSavingsYears { get; init; } = 3;
    public double FuelMyopia { get; init; } = 0.5;
    public double EFare { get; init; } = -0.35;
    public double EFuel { get; init; } = -0.30 * 0.15;
    public double BetaRebate { get; init; } = 5e-5;
}
