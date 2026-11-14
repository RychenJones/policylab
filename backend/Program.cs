using System;

namespace TransportPolicy;

public static class Program
{
    // Prints a simulation result with a readable label.
    private static void Show(string label, Result result) =>
        Console.WriteLine($"{label,-28} {result}");

    // Runs a few example policy scenarios.
    public static void Main()
    {
        double fare = Simulator.Cfg.BaseFare;

        Show("No policy (5 yr)", Simulator.Simulate(0.0, 0.0, fare));
        Show("Gas tax +$1.00", Simulator.Simulate(1.00, 0.0, fare));
        Show("EV rebate $7,500", Simulator.Simulate(0.0, 7500, fare));
        Show("Free transit", Simulator.Simulate(0.0, 0.0, 0.0));
        Show("All three combined", Simulator.Simulate(1.00, 7500, 0.0));

        Console.WriteLine();
        Console.WriteLine("Policy effect (pp vs no policy), gas tax +$1 / rebate $7.5k / fare halved:");
        Console.WriteLine(Simulator.CalculatePolicyEffect(1.00, 7500, fare / 2));
    }
}
