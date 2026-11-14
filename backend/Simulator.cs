using System;
using System.Linq;
using System.Threading;

namespace TransportPolicy;

public static class Simulator
{
    public static readonly Config Cfg = new();
    public static readonly Params Calibrated = Calibrate(Cfg);

    // Converts utility scores into stable choice probabilities.
    public static double[] CalculateChoiceShares(double[] values)
    {
        double max = values.Max();
        double[] exps = values.Select(v => Math.Exp(v - max)).ToArray();
        double total = exps.Sum();
        return exps.Select(e => e / total).ToArray();
    }

    // Calculates the annual fuel cost for a gas-powered vehicle.
    public static double AnnualGasCost(Config cfg, double gasTax) =>
        cfg.MilesPerYear * (cfg.BaseGasPrice + gasTax) / cfg.Mpg;

    // Calculates the annual electricity cost for an EV.
    public static double AnnualEvCost(Config cfg) =>
        cfg.MilesPerYear * cfg.KwhPerMile * cfg.ElectricityPricePerKwh;

    // Calculates the annual cost of public transit.
    public static double TransitAnnualCost(Config cfg, double fare) =>
        fare * cfg.TripsPerYear;

    // Calculates the EV incentive from rebates and fuel savings.
    public static double CalculateEvFinancialUtility(Config cfg, double gasTax, double evRebate)
    {
        double fuelSaving = cfg.FuelSavingsYears * cfg.FuelMyopia *
                            (AnnualGasCost(cfg, gasTax) - AnnualEvCost(cfg));
        return cfg.BetaRebate * (evRebate - cfg.EvPricePremium + fuelSaving);
    }

    // Calculates target shares for the three mutually exclusive outcomes.
    public static Mode CalculateTargetShares(Config cfg, Params p, double gasTax,
                                        double evRebate, double fare)
    {
        double gasCost = AnnualGasCost(cfg, gasTax);
        double transitCost = TransitAnnualCost(cfg, fare);
        double[] values =
        {
            p.BetaFuel * gasCost,
            p.AscEv + p.BetaFuel * AnnualEvCost(cfg) +
                CalculateEvFinancialUtility(cfg, gasTax, evRebate),
            p.AscNoCar + p.BetaFare * transitCost
        };
        double[] shares = CalculateChoiceShares(values);
        return new Mode(shares[0], shares[1], shares[2]);
    }

    // Moves the current mode shares toward the calculated target shares.
    public static Mode AdjustTowardTarget(Mode current, Mode target,
                                          double shareAdjustmentRate) => new(
        current.Gas + shareAdjustmentRate * (target.Gas - current.Gas),
        current.Ev + shareAdjustmentRate * (target.Ev - current.Ev),
        current.NoCar + shareAdjustmentRate * (target.NoCar - current.NoCar));

    // Fits model parameters so the baseline inputs reproduce baseline shares.
    public static Params Calibrate(Config cfg)
    {
        Mode baseline = cfg.BaseShare;
        double baseGasCost = AnnualGasCost(cfg, 0.0);
        double baseEvCost = AnnualEvCost(cfg);
        double baseTransitCost = TransitAnnualCost(cfg, cfg.BaseFare);

        double betaFare = cfg.EFare / (baseTransitCost * (1 - baseline.NoCar));
        double betaFuel = cfg.EFuel / (baseGasCost * (1 - baseline.Gas));

        double vGasBase = betaFuel * baseGasCost;
        double vEvBase = betaFuel * baseEvCost + CalculateEvFinancialUtility(cfg, 0.0, 0.0);
        double ascEv = Math.Log(baseline.Ev / baseline.Gas) + vGasBase - vEvBase;
        double ascNoCar = Math.Log(baseline.NoCar / baseline.Gas) +
                          vGasBase - betaFare * baseTransitCost;

        return new Params(betaFuel, betaFare, ascEv, ascNoCar);
    }

    // Advances the transportation state by one year.
    public static State Step(Config cfg, Params p, State state,
                             double gasTax, double evRebate, double fare)
    {
        Mode target = CalculateTargetShares(cfg, p, gasTax, evRebate, fare);
        Mode newMode = AdjustTowardTarget(state.Mode, target, cfg.ShareAdjustmentRate);

        return new State(newMode);
    }

    // Runs the requested number of years and returns final travel shares.
    // Each scenario is calibrated independently from its immutable configuration.
    public static Result Simulate(Config cfg, double gasTax, double evRebate, double transitFare,
                                  int simulatedYears,
                                  CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var cohorts = ReconcileAggregateBaseline(cfg);
        var cohortResults = new List<CohortResult>(cohorts.Count);
        foreach (var cohort in cohorts)
        {
            var cohortConfig = cfg.ForCohort(cohort);
            var calibrated = Calibrate(cohortConfig);
            var state = new State(cohortConfig.BaseShare);
            var yearlySnapshots = new List<YearSnapshot>(simulatedYears);
            for (int year = 0; year < simulatedYears; year++)
            {
                cancellationToken.ThrowIfCancellationRequested();
                state = Step(cohortConfig, calibrated, state, gasTax, evRebate, transitFare);
                yearlySnapshots.Add(new YearSnapshot(year + 1, 100 * state.Mode.Gas,
                    100 * state.Mode.Ev, 100 * state.Mode.NoCar));
            }

            var final = yearlySnapshots[^1];
            cohortResults.Add(new CohortResult(cohort.Id, cohort.Label,
                100 * cohort.PopulationShare, final.GasPct, final.EvPct, final.NoCarPct,
                yearlySnapshots)
            {
                Baseline = new CohortBaseline(
                    100 * cohortConfig.BaseShare.Gas,
                    100 * cohortConfig.BaseShare.Ev,
                    100 * cohortConfig.BaseShare.NoCar)
            });
        }

        var collectiveYears = Enumerable.Range(0, simulatedYears)
            .Select(year => WeightedSnapshot(cohorts, cohortResults, year)).ToArray();
        var collective = collectiveYears[^1];

        return new Result(collective.GasPct, collective.EvPct, collective.NoCarPct)
        {
            Years = collectiveYears,
            Cohorts = cohortResults
        };
    }

    private static YearSnapshot WeightedSnapshot(IReadOnlyList<CohortConfig> configs,
        IReadOnlyList<CohortResult> results, int year)
    {
        // Combines cohort snapshots using each cohort's population share.
        double gas = 0, ev = 0, noCar = 0;
        for (int i = 0; i < configs.Count; i++)
        {
            var snapshot = results[i].Years[year];
            gas += configs[i].PopulationShare * snapshot.GasPct;
            ev += configs[i].PopulationShare * snapshot.EvPct;
            noCar += configs[i].PopulationShare * snapshot.NoCarPct;
        }
        return new YearSnapshot(year + 1, gas, ev, noCar);
    }

    // Reconciles cohort baselines to the requested aggregate shares while preserving their relative differences.
    private static IReadOnlyList<CohortConfig> ReconcileAggregateBaseline(Config cfg)
    {
        double gas = cfg.Cohorts.Sum(c => c.PopulationShare * c.BaseShare.Gas);
        double ev = cfg.Cohorts.Sum(c => c.PopulationShare * c.BaseShare.Ev);
        double noCar = cfg.Cohorts.Sum(c => c.PopulationShare * c.BaseShare.NoCar);
        if (Math.Abs(gas - cfg.BaseShare.Gas) <= 1e-8 &&
            Math.Abs(ev - cfg.BaseShare.Ev) <= 1e-8 &&
            Math.Abs(noCar - cfg.BaseShare.NoCar) <= 1e-8)
            return cfg.Cohorts;

        var shifted = cfg.Cohorts.Select(c => c with
        {
            BaseShare = new Mode(
                c.BaseShare.Gas + cfg.BaseShare.Gas - gas,
                c.BaseShare.Ev + cfg.BaseShare.Ev - ev,
                c.BaseShare.NoCar + cfg.BaseShare.NoCar - noCar)
        }).ToArray();
        return shifted.All(c => c.BaseShare.Gas > 0 && c.BaseShare.Ev > 0 && c.BaseShare.NoCar > 0)
            ? shifted
            : cfg.Cohorts.Select(c => c with { BaseShare = cfg.BaseShare }).ToArray();
    }

    // Returns the percentage-point change compared with the no-policy baseline.
    public static Result CalculatePolicyEffect(double gasTax, double evRebate, double transitFare, int simulatedYears) =>
        Simulate(Cfg, gasTax, evRebate, transitFare, simulatedYears) -
        Simulate(Cfg, 0.0, 0.0, Cfg.BaseFare, simulatedYears);
}
