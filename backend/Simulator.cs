using System;
using System.Linq;

namespace TransportPolicy;

public static class Simulator
{
    // The fitted model is intended for ordinary policy values. Values above this
    // threshold are still simulated, but callers should treat the result as an
    // extrapolation rather than a calibrated estimate.
    public const double CalibratedGasTaxWarningThreshold = 5.0;

    public static readonly Config Cfg = new();
    public static readonly Params Calibrated = Calibrate(Cfg);

    // Converts a score into a probability between zero and one.
    public static double Sigmoid(double x) => 1.0 / (1.0 + Math.Exp(-x));

    // Converts a probability into its log-odds score.
    public static double Logit(double p) => Math.Log(p / (1.0 - p));

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
        cfg.Miles * (cfg.BaseGasPrice + gasTax) / cfg.Mpg;

    // Calculates the annual electricity cost for an EV.
    public static double EvRunningCost(Config cfg) =>
        cfg.Miles * cfg.KwhPerMile * cfg.ElecPrice;

    // Blends gas and EV costs using the current EV fleet share.
    public static double BlendedDriveCost(Config cfg, double gasTax, double evShare) =>
        (1 - evShare) * GasRunningCost(cfg, gasTax) + evShare * EvRunningCost(cfg);

    // Calculates the annual cost of public transit.
    public static double TransitAnnualCost(Config cfg, double fare) =>
        fare * cfg.TripsPerYear;

    // Calculates the EV purchase incentive from rebates and fuel savings.
    public static double PowertrainTerms(Config cfg, double gasTax, double evRebate)
    {
        double fuelSaving = cfg.PaybackYears * cfg.FuelMyopia *
                            (GasRunningCost(cfg, gasTax) - EvRunningCost(cfg));
        return cfg.BetaRebate * (evRebate - cfg.EvPricePremium + fuelSaving);
    }

    // Estimates the EV share among newly purchased vehicles.
    public static double NewCarEvShare(Config cfg, Params p, double gasTax, double evRebate) =>
        Sigmoid(p.AscEv + PowertrainTerms(cfg, gasTax, evRebate));

    // Updates the fleet EV share using vehicle turnover.
    public static double UpdateEvFleet(Config cfg, double evShare, double pEvNew) =>
        (1 - cfg.Turnover) * evShare + cfg.Turnover * pEvNew;

    // Calculates the target shares for driving, transit, and other travel.
    public static Mode ModeTargetShares(Params p, double driveCost, double transitCost)
    {
        double[] values =
        {
            p.BetaFuel * driveCost,
            p.AscTransit + p.BetaFare * transitCost,
            p.AscOther
        };
        double[] shares = Softmax(values);
        return new Mode(shares[0], shares[1], shares[2]);
    }

    // Moves the current mode shares toward the calculated target shares.
    public static Mode AdjustToward(Mode current, Mode target, double lambda) => new(
        current.Drive + lambda * (target.Drive - current.Drive),
        current.Transit + lambda * (target.Transit - current.Transit),
        current.Other + lambda * (target.Other - current.Other));

    // Fits model parameters so the baseline inputs reproduce baseline shares.
    public static Params Calibrate(Config cfg)
    {
        Mode baseline = cfg.BaseShare;
        double baseDriveCost = BlendedDriveCost(cfg, 0.0, cfg.EvFleetShare0);
        double baseTransitCost = TransitAnnualCost(cfg, cfg.BaseFare);

        double betaFare = cfg.EFare / (baseTransitCost * (1 - baseline.Transit));
        double betaFuel = cfg.EFuelMode / (baseDriveCost * (1 - baseline.Drive));

        double vDriveBase = betaFuel * baseDriveCost;
        double ascTransit = Math.Log(baseline.Transit / baseline.Drive) +
                            vDriveBase - betaFare * baseTransitCost;
        double ascOther = Math.Log(baseline.Other / baseline.Drive) + vDriveBase;
        double ascEv = Logit(cfg.EvNewShareBase) - PowertrainTerms(cfg, 0.0, 0.0);

        return new Params(betaFare, betaFuel, ascTransit, ascOther, ascEv);
    }

    // Advances the transportation state by one year.
    public static State Step(Config cfg, Params p, State state,
                             double gasTax, double evRebate, double fare)
    {
        double driveCost = BlendedDriveCost(cfg, gasTax, state.EvShare);
        double transitCost = TransitAnnualCost(cfg, fare);
        Mode target = ModeTargetShares(p, driveCost, transitCost);
        Mode newMode = AdjustToward(state.Mode, target, cfg.Lambda);

        double pEvNew = NewCarEvShare(cfg, p, gasTax, evRebate);
        double newEvShare = UpdateEvFleet(cfg, state.EvShare, pEvNew);

        return new State(newMode, newEvShare);
    }

    // Runs the configured number of years and returns final travel shares.
    public static Result Simulate(double gasTax, double evRebate, double transitFare)
    {
        ValidateInputs(gasTax, evRebate, transitFare);

        if (Math.Abs(gasTax) > CalibratedGasTaxWarningThreshold)
        {
            Console.Error.WriteLine(
                $"Warning: gas tax ${gasTax:F2} is outside the calibrated range " +
                $"(±${CalibratedGasTaxWarningThreshold:F2}); result is an extrapolation.");
        }

        var state = new State(Cfg.BaseShare, Cfg.EvFleetShare0);

        // Apply the same policy inputs once for each simulated year.
        for (int year = 0; year < Cfg.HorizonYears; year++)
            state = Step(Cfg, Calibrated, state, gasTax, evRebate, transitFare);

        double drive = state.Mode.Drive;
        return new Result(
            GasPct: 100 * drive * (1 - state.EvShare),
            EvPct: 100 * drive * state.EvShare,
            OtherPct: 100 * (1 - drive));
    }

    // Rejects policy values that would make the simulation invalid.
    private static void ValidateInputs(double gasTax, double evRebate, double transitFare)
    {
        if (!double.IsFinite(gasTax))
            throw new ArgumentException("Gas tax must be a finite number.", nameof(gasTax));

        if (!double.IsFinite(evRebate))
            throw new ArgumentException("EV rebate must be a finite number.", nameof(evRebate));

        if (!double.IsFinite(transitFare))
            throw new ArgumentException("Transit fare must be a finite number.", nameof(transitFare));

        if (Cfg.BaseGasPrice + gasTax <= 0)
            throw new ArgumentOutOfRangeException(
                nameof(gasTax), gasTax, "Gas tax would make the gas price non-positive.");

        if (evRebate < 0)
            throw new ArgumentOutOfRangeException(
                nameof(evRebate), evRebate, "EV rebate cannot be negative.");

        if (transitFare < 0)
            throw new ArgumentOutOfRangeException(
                nameof(transitFare), transitFare, "Transit fare cannot be negative.");
    }

    // Returns the percentage-point change compared with the no-policy baseline.
    public static Result PolicyEffect(double gasTax, double evRebate, double transitFare) =>
        Simulate(gasTax, evRebate, transitFare) - Simulate(0.0, 0.0, Cfg.BaseFare);
}
