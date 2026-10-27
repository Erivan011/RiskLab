package risklab;
import java.math.BigDecimal;
public final class ExposureTest {
    static BigDecimal n(String value) { return new BigDecimal(value); }
    static void equal(String expected, BigDecimal actual) {
        if (n(expected).compareTo(actual) != 0) throw new AssertionError(expected + " != " + actual);
    }
    public static void main(String[] args) {
        var p = new Exposure.Position("IMP-1", "USD", n("1000"), n("5"), n("0.25"), n("4.8"), n("100"));
        var cost = Exposure.price(p, n("0.1"));
        equal("5050.00", cost.baseline()); equal("5425.00", cost.stressed()); equal("375", cost.impact());
        var covered = new Exposure.Position("IMP-2", "EUR", n("1000"), n("6"), n("1"), n("5.5"), n("0"));
        equal("0", Exposure.price(covered, n("0.2")).impact());
        try { Exposure.price(p, n("-1")); throw new AssertionError("Invalid shock accepted"); }
        catch (IllegalArgumentException expected) {}
        String json = Server.calculate("currency=USD&amount=1000&referenceRate=5&fixedFraction=0.25&fixedRate=4.8&localCost=100&shock=0.1");
        if (!json.contains("\"impact\":375.00")) throw new AssertionError(json);
        try { Server.calculate("amount=1&amount=2"); throw new AssertionError("Duplicate accepted"); }
        catch (IllegalArgumentException expected) {}
        System.out.println("Exposure checks passed");
    }
}
