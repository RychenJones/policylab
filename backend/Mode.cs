namespace TransportPolicy;

// Mutually exclusive transportation outcomes.
public sealed record Mode(double Gas, double Ev, double NoCar);
