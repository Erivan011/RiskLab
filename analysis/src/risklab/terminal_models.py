"""Validated extensions adapted from the supplied V4; no regulatory certification."""
import math
import numpy as np
from scipy import stats


def sample(values, minimum=20):
    arr=np.asarray(values,dtype=float)
    if arr.ndim!=1 or len(arr)<minimum or not np.isfinite(arr).all():
        raise ValueError('Insufficient or non-finite sample')
    return arr


def tail_metrics(fx_returns, confidence=.99, df=5):
    """Upper FX-return loss for a BRL payer with a foreign-currency liability."""
    arr=sample(fx_returns)
    if not .9<confidence<1 or df<=2:
        raise ValueError('Invalid confidence or degrees of freedom')
    mu=float(arr.mean());sigma=float(arr.std(ddof=1));z=float(stats.norm.ppf(confidence))
    skew=float(stats.skew(arr,bias=False)) if sigma else 0.
    kurt=float(stats.kurtosis(arr,fisher=True,bias=False)) if sigma else 0.
    z_cf=z+(z*z-1)*skew/6+(z**3-3*z)*kurt/24-(2*z**3-5*z)*skew**2/36
    t=float(stats.t.ppf(confidence,df));scale=sigma*math.sqrt((df-2)/df)
    return dict(gaussian=max(0.,mu+z*sigma),cornish_fisher=max(0.,mu+z_cf*sigma),
      student=max(0.,mu+t*scale),student_es=max(0.,mu+scale*float(stats.t.pdf(t,df))/(1-confidence)*(df+t*t)/(df-1)),
      skew=skew,excess_kurtosis=kurt,cf_warning=abs(skew)>1 or abs(kurt)>3)


def coverage_diagnostics(losses, forecasts, confidence=.99):
    x=sample(losses,2);v=sample(forecasts,2)
    if len(x)!=len(v) or not .9<confidence<1:
        raise ValueError('Mismatched samples or invalid confidence')
    hits=(x>v).astype(int);n=len(hits);breaches=int(hits.sum());expected=1-confidence
    def ll(zero,one,p):
        return (zero*math.log1p(-p) if zero else 0.)+(one*math.log(p) if one else 0.)
    lr=max(0.,2*(ll(n-breaches,breaches,breaches/n)-ll(n-breaches,breaches,expected)))
    counts=[sum(int(a==i and b==j) for a,b in zip(hits[:-1],hits[1:])) for i,j in [(0,0),(0,1),(1,0),(1,1)]]
    a,b,c,d=counts
    ind=None
    if a+b and c+d:
        p0=b/(a+b);p1=d/(c+d);pooled=(b+d)/(n-1)
        ind=max(0.,2*(ll(a,b,p0)+ll(c,d,p1)-ll(a+c,b+d,pooled)))
    return dict(observations=n,breaches=breaches,expectedBreaches=n*expected,
      kupiecLR=lr,kupiecP=float(stats.chi2.sf(lr,1)),transitionCounts=counts,
      independenceLR=ind,independenceP=float(stats.chi2.sf(ind,1)) if ind is not None else None,
      conditionalP=float(stats.chi2.sf(lr+ind,2)) if ind is not None else None,
      interpretation='Failure to reject is not model approval; asymptotic p-values have low power with few exceptions.')


def forward_illustration(spot, domestic_annual, foreign_annual, business_days, calendar_days):
    if not all(math.isfinite(v) for v in [spot,domestic_annual,foreign_annual,business_days,calendar_days]) or spot<=0 or domestic_annual<=-1 or business_days<0 or calendar_days<0:
        raise ValueError('Invalid forward inputs')
    denominator=1+foreign_annual*calendar_days/360
    if denominator<=0:raise ValueError('Invalid foreign accrual factor')
    return spot*(1+domestic_annual)**(business_days/252)/denominator


def conditional_paths(training_returns, evaluation_returns, lam=.94, alpha=.09, beta=.89):
    train=sample(training_returns,60);evaluation=sample(evaluation_returns,1)
    if not 0<lam<1 or alpha<0 or beta<0 or alpha+beta>=1:raise ValueError('Invalid volatility parameters')
    initial=max(1e-12,float(np.mean(train**2)));omega=initial*(1-alpha-beta)
    ewma=garch=initial;output=[]
    for r in evaluation:
        output.append(dict(ewma=ewma,garch=garch))
        ewma=max(1e-12,lam*ewma+(1-lam)*r*r)
        garch=max(1e-12,omega+alpha*r*r+beta*garch)
    return dict(predictions=output,initial=initial,omega=omega,alpha=alpha,beta=beta,lambda_=lam,
      longRunAnnual=math.sqrt(252*initial),halfLife=math.log(.5)/math.log(alpha+beta))
