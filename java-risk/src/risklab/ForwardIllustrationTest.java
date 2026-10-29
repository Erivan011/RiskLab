package risklab;
public final class ForwardIllustrationTest {
    public static void main(String[] args) {
        double computed = ForwardIllustration.rate(5.714, .1125, .0485, 63, 90);
        if (Math.abs(computed - 5.798038417963) > 1e-10)
            throw new AssertionError("Mismatch against Python reference fixture");
        if (ForwardIllustration.rate(5, 0, 0, 63, 90) != 5)
            throw new AssertionError("Zero-rate identity");
        if (!(computed < ForwardIllustration.rate(5.714, .1125, .0485, 63, 63)))
            throw new AssertionError("Separate day-count bases");
        try { ForwardIllustration.rate(-1,.1,.05,63,90); throw new AssertionError("Invalid spot accepted"); }
        catch (IllegalArgumentException expected) { }
        System.out.println("Forward illustration reference checks passed");
    }
}
