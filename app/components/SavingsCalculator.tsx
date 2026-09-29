import { Button, TextField } from "@shopify/polaris";
import { useEffect, useMemo, useState } from "react";
import { estimateSavings } from "../lib/savings";

function money(value: number) {
  return `$${Math.round(value).toLocaleString()}`;
}

export function SavingsCalculator() {
  const [monthlyOrders, setMonthlyOrders] = useState("2500");
  const [averageOrderValue, setAverageOrderValue] = useState("85");
  const [errorRate, setErrorRate] = useState("6.2");
  const [reshipCost, setReshipCost] = useState("12");
  const [supportCost, setSupportCost] = useState("8");
  const [correctionRate, setCorrectionRate] = useState("70");
  const [animKey, setAnimKey] = useState(0);
  const [hasCalculated, setHasCalculated] = useState(false);

  const result = useMemo(
    () =>
      estimateSavings({
        monthlyOrders: Number(monthlyOrders) || 0,
        averageOrderValue: Number(averageOrderValue) || 0,
        errorRate: Number(errorRate) || 0,
        reshipCost: Number(reshipCost) || 0,
        supportCost: Number(supportCost) || 0,
        correctionRate: Number(correctionRate) || 0,
      }),
    [monthlyOrders, averageOrderValue, errorRate, reshipCost, supportCost, correctionRate],
  );

  useEffect(() => {
    if (!hasCalculated) return;
    setAnimKey((key) => key + 1);
  }, [result.total, result.roi, hasCalculated]);

  const calculate = () => {
    setHasCalculated(true);
    setAnimKey((key) => key + 1);
  };

  const stats = [
    { label: "Monthly address errors", value: result.monthlyErrors.toLocaleString() },
    { label: "Prevented delivery issues", value: result.prevented.toLocaleString() },
    { label: "Saved shipping cost", value: money(result.savedShipping), green: true },
    { label: "Saved support cost", value: money(result.savedSupport), green: true },
    {
      label: "AddressVerify cost",
      value: `$${result.usageCost.toFixed(2)}`,
    },
    { label: "Estimated ROI", value: `${result.roi}x`, green: true },
  ];

  return (
    <div className="av-calc" id="savings-calculator">
      <div className="av-calc__layout">
        <section className="av-calc__panel">
          <div className="av-calc__panel-head">
            <h2 className="av-calc__panel-title">Savings calculator</h2>
            <p className="av-calc__panel-desc">
              Adjust the numbers to match your order volume and current address error rate.
            </p>
          </div>
          <div className="av-calc__panel-body">
            <div className="av-calc__fields">
              <TextField
                label="Monthly orders"
                type="number"
                value={monthlyOrders}
                onChange={setMonthlyOrders}
                autoComplete="off"
              />
              <TextField
                label="Average order value"
                type="number"
                prefix="$"
                value={averageOrderValue}
                onChange={setAverageOrderValue}
                autoComplete="off"
              />
              <TextField
                label="Address error rate"
                type="number"
                suffix="%"
                value={errorRate}
                onChange={setErrorRate}
                autoComplete="off"
              />
              <TextField
                label="Correction rate"
                type="number"
                suffix="%"
                value={correctionRate}
                onChange={setCorrectionRate}
                autoComplete="off"
              />
              <TextField
                label="Average reshipping cost"
                type="number"
                prefix="$"
                value={reshipCost}
                onChange={setReshipCost}
                autoComplete="off"
              />
              <TextField
                label="Average support cost"
                type="number"
                prefix="$"
                value={supportCost}
                onChange={setSupportCost}
                autoComplete="off"
              />
            </div>
            <div className="av-calc__actions">
              <Button variant="primary" onClick={calculate}>
                Calculate estimate
              </Button>
              <span className="av-calc__hint">Updates instantly as you change inputs</span>
            </div>
          </div>
        </section>

        <section className="av-calc__panel av-calc__panel--results">
          <div className="av-calc__panel-head">
            <h2 className="av-calc__panel-title">Estimated monthly impact</h2>
            <p className="av-calc__panel-desc">Planning figures only — not a guarantee of savings.</p>
          </div>
          <div className="av-calc__panel-body" key={animKey}>
            <div className={`av-calc__hero${hasCalculated ? " av-calc__hero--animate" : ""}`}>
              <p className="av-calc__hero-label">Estimated total savings</p>
              <p className="av-calc__hero-value">{money(result.total)}</p>
              <p className="av-calc__hero-sub">
                Based on {Number(monthlyOrders || 0).toLocaleString()} monthly orders
              </p>
              <div className="av-calc__roi-pill">ROI {result.roi}x</div>
            </div>

            <div className="av-calc__stats">
              {stats.map((stat) => (
                <div className="av-calc__stat" key={stat.label}>
                  <p className="av-calc__stat-label">{stat.label}</p>
                  <p className={`av-calc__stat-value${stat.green ? " av-calc__stat-value--green" : ""}`}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            <p className="av-calc__footer">
              Usage cost uses your volume tier ({Number(monthlyOrders || 0).toLocaleString()} orders × $
              {result.pricePerOrder.toFixed(2)}). Actual results depend on catalog, carriers, and rule settings.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
