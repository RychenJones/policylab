namespace TransportPolicy;

public sealed record Config
{
    // Prices and physical assumptions used by the cost calculations.
    public double BaseGasPrice { get; init; } = 3.10;
    public double BaseFare { get; init; } = 1.75;
    public double TripsPerYear { get; init; } = 480;
    public double MilesPerYear { get; init; } = 12_000;
    public double Mpg { get; init; } = 26.0;
    public double KwhPerMile { get; init; } = 0.30;
    public double ElectricityPricePerKwh { get; init; } = 0.17;
    public double EvPricePremium { get; init; } = 8_000;

    // Baseline commuter shares, excluding work-from-home commuters; categories are mutually exclusive.
    public Mode BaseShare { get; init; } = new(0.904 * (1.0 - 0.02), 0.904 * 0.02, 1.0 - 0.904);
    // Dynamics.
    public double ShareAdjustmentRate { get; init; } = 1.0 / 3.0;

    // Behavior.
    public double FuelSavingsYears { get; init; } = 3;
    public double FuelMyopia { get; init; } = 0.5;
    public double EFare { get; init; } = -0.35;
    public double EFuel { get; init; } = -0.30 * 0.15;
    public double BetaRebate { get; init; } = 5e-5;

    // National household-income cohorts aggregated from the 2024 ACS B19001 distribution.
    public IReadOnlyList<CohortConfig> Cohorts { get; init; } = DefaultCohorts;

    private static IReadOnlyList<CohortConfig> DefaultCohorts =>
    [
        new("under-50k", "Under $50k", 0.28, 25_000,
            new Mode(0.896, 0.005, 0.099), 10_800, 1.05, 1.05, 1.25),
        new("50k-100k", "$50k–$100k", 0.31, 75_000,
            new Mode(0.889, 0.010, 0.101), 12_000, 1.00, 1.00, 1.00),
        new("100k-150k", "$100k–$150k", 0.21, 125_000,
            new Mode(0.883, 0.020, 0.097), 12_800, 0.95, 0.95, 0.85),
        new("150k-plus", "$150k+", 0.20, 200_000,
            new Mode(0.8701, 0.0469, 0.083), 13_500, 0.90, 0.90, 0.70)
    ];

    // Applies a cohort's starting shares, mileage, and sensitivity multipliers.
    public Config ForCohort(CohortConfig cohort) => this with
    {
        BaseShare = cohort.BaseShare,
        MilesPerYear = cohort.MilesPerYear,
        EFare = EFare * cohort.FareSensitivity,
        EFuel = EFuel * cohort.FuelSensitivity,
        BetaRebate = BetaRebate * cohort.RebateSensitivity
    };
}

public sealed record CohortConfig(
    string Id,
    string Label,
    double PopulationShare,
    double RepresentativeIncome,
    Mode BaseShare,
    double MilesPerYear,
    double FuelSensitivity,
    double FareSensitivity,
    double RebateSensitivity);
