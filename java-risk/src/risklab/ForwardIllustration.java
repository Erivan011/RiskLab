package risklab;

/** Educational interest-factor illustration; not executable NDF pricing. */
public final class ForwardIllustration {
    private ForwardIllustration() {}
    public static double rate(double spot, double domestic, double foreign,
                              int businessDays, int calendarDays) {
        if (!Double.isFinite(spot) || !Double.isFinite(domestic) || !Double.isFinite(foreign)
                || spot <= 0 || domestic <= -1 || businessDays < 0 || calendarDays < 0
                || 1 + foreign * calendarDays / 360.0 <= 0)
            throw new IllegalArgumentException("Invalid rate or day-count inputs");
        return spot * Math.pow(1 + domestic, businessDays / 252.0)
                / (1 + foreign * calendarDays / 360.0);
    }
    public static void main(String[] args) {
        if (args.length != 5) throw new IllegalArgumentException("Five inputs required");
        System.out.printf(java.util.Locale.ROOT, "%.10f%n", rate(Double.parseDouble(args[0]),
            Double.parseDouble(args[1]), Double.parseDouble(args[2]),
            Integer.parseInt(args[3]), Integer.parseInt(args[4])));
    }
}
