using System;
using System.Linq;

namespace TransportPolicy;

public static class Simulator
{
    public static readonly Config Cfg = new();
    public static readonly Params Calibrated = Calibrate(Cfg);

    // Converts utility scores into stable choice probabilities.
    public static double[] Softmax(double[] values)
    {
        double max = values.Max();
        double[] exps = values.Select(v => Math.Exp(v - max)).ToArray();
        double total = exps.Sum();
        return exps.Select(e => e / total).ToArray();
    }

    // Calculates the annual fuel cost for a gas-powered vehicle.
    public static double GasRunningCost(Config cfg, double gasTax) =>
        cfg.MilesPerYear * (cfg.BaseGasPrice + gasTax) / cfg.Mpg;

    // Calculates the annual electricity cost for an EV.
    public static double EvRunningCost(Config cfg) =>
        cfg.MilesPerYear * cfg.KwhPerMile * cfg.ElecPrice;

    // Calculates the annual cost of public transit.
    public static double TransitAnnualCost(Config cfg, double fare) =>
        fare * cfg.TripsPerYear;

    // Calculates the EV incentive from rebates and fuel savings.
    public static double PowertrainTerms(Config cfg, double gasTax, double evRebate)
    {
        double fuelSaving = cfg.FuelSavingsYears * cfg.FuelMyopia *
                            (GasRunningCost(cfg, gasTax) - EvRunningCost(cfg));
        return cfg.BetaRebate * (evRebate - cfg.EvPricePremium + fuelSaving);
    }

    // Calculates target shares for the three mutually exclusive outcomes.
    public static Mode ModeTargetShares(Config cfg, Params p, double gasTax,
                                        double evRebate, double fare)
    {
        double gasCost = GasRunningCost(cfg, gasTax);
        double transitCost = TransitAnnualCost(cfg, fare);
        double[] values =
        {
            p.BetaFuel * gasCost,
            p.AscEv + p.BetaFuel * EvRunningCost(cfg) +
                PowertrainTerms(cfg, gasTax, evRebate),
            p.AscNoCar + p.BetaFare * transitCost
        };
        double[] shares = Softmax(values);
        return new Mode(shares[0], shares[1], shares[2]);
    }

    // Moves the current mode shares toward the calculated target shares.
    public static Mode AdjustToward(Mode current, Mode target, double lambda) => new(
        current.Gas + lambda * (target.Gas - current.Gas),
        current.Ev + lambda * (target.Ev - current.Ev),
        current.NoCar + lambda * (target.NoCar - current.NoCar));

    // Fits model parameters so the baseline inputs reproduce baseline shares.
    public static Params Calibrate(Config cfg)
    {
        Mode baseline = cfg.BaseShare;
        double baseGasCost = GasRunningCost(cfg, 0.0);
        double baseEvCost = EvRunningCost(cfg);
        double baseTransitCost = TransitAnnualCost(cfg, cfg.BaseFare);

        double betaFare = cfg.EFare / (baseTransitCost * (1 - baseline.NoCar));
        double betaFuel = cfg.EFuel / (baseGasCost * (1 - baseline.Gas));

        double vGasBase = betaFuel * baseGasCost;
        double vEvBase = betaFuel * baseEvCost + PowertrainTerms(cfg, 0.0, 0.0);
        double ascEv = Math.Log(baseline.Ev / baseline.Gas) + vGasBase - vEvBase;
        double ascNoCar = Math.Log(baseline.NoCar / baseline.Gas) +
                          vGasBase - betaFare * baseTransitCost;

        return new Params(betaFuel, betaFare, ascEv, ascNoCar);
    }

    // Advances the transportation state by one year.
    public static State Step(Config cfg, Params p, State state,
                             double gasTax, double evRebate, double fare)
    {
        Mode target = ModeTargetShares(cfg, p, gasTax, evRebate, fare);
        Mode newMode = AdjustToward(state.Mode, target, cfg.ShareAdjustmentRate);

        return new State(newMode);
    }

    // Runs the configured number of years and returns final travel shares.
    public static Result Simulate(double gasTax, double evRebate, double transitFare)
    {
        var state = new State(Cfg.BaseShare);

        // Apply the same policy inputs once for each simulated year.
        for (int year = 0; year < Cfg.SimulatedYears; year++)
            state = Step(Cfg, Calibrated, state, gasTax, evRebate, transitFare);

        return new Result(
            GasPct: 100 * state.Mode.Gas,
            EvPct: 100 * state.Mode.Ev,
            NoCarPct: 100 * state.Mode.NoCar);
    }

    // Returns the percentage-point change compared with the no-policy baseline.
    public static Result PolicyEffect(double gasTax, double evRebate, double transitFare) =>
        Simulate(gasTax, evRebate, transitFare) - Simulate(0.0, 0.0, Cfg.BaseFare);
}
