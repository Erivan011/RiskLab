package risklab;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Objects;

/** Deterministic fixed-coverage FX costing. No derivatives pricing. */
public final class Exposure {
    private Exposure() {}
    public record Position(String id, String currency, BigDecimal amount,
            BigDecimal referenceRate, BigDecimal fixedFraction,
            BigDecimal fixedRate, BigDecimal localCost) {
        public Position {
            Objects.requireNonNull(id); Objects.requireNonNull(currency);
            if (id.isBlank() || !List.of("USD", "EUR", "GBP").contains(currency))
                throw new IllegalArgumentException("Invalid position identity");
            for (var value : List.of(amount, referenceRate, fixedFraction, fixedRate, localCost))
                if (value.signum() < 0) throw new IllegalArgumentException("Negative input");
            if (amount.signum() == 0 || referenceRate.signum() == 0 || fixedRate.signum() == 0
                    || fixedFraction.compareTo(BigDecimal.ONE) > 0)
                throw new IllegalArgumentException("Invalid amount, rate or coverage");
        }
    }
    public record Cost(BigDecimal baseline, BigDecimal stressed, BigDecimal impact) {}
    public static Cost price(Position p, BigDecimal shock) {
        Objects.requireNonNull(shock);
        if (shock.compareTo(BigDecimal.ONE.negate()) <= 0 || shock.compareTo(BigDecimal.ONE) > 0)
            throw new IllegalArgumentException("Shock must be greater than -1 and at most 1");
        var uncovered = BigDecimal.ONE.subtract(p.fixedFraction());
        var fixed = p.fixedFraction().multiply(p.fixedRate());
        var floating = uncovered.multiply(p.referenceRate());
        var base = p.amount().multiply(fixed.add(floating)).add(p.localCost()).setScale(2, RoundingMode.HALF_UP);
        var stressed = p.amount().multiply(fixed.add(floating.multiply(BigDecimal.ONE.add(shock))))
                .add(p.localCost()).setScale(2, RoundingMode.HALF_UP);
        return new Cost(base, stressed, stressed.subtract(base));
    }
}
