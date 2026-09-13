import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTaxRisk } from '../src/utils/security-auditor.js';

describe('Bonding Curve Telemetry - Progress Calculation', () => {
  const calculateCurvePercent = (progress) => {
    if (progress === undefined || progress === null) return 0;
    return Math.min(100, Math.max(0, Math.round(progress * 100)));
  };

  test('correctly calculates and clamps normal curve progress percentages', () => {
    assert.strictEqual(calculateCurvePercent(0), 0);
    assert.strictEqual(calculateCurvePercent(0.154), 15);
    assert.strictEqual(calculateCurvePercent(0.50), 50);
    assert.strictEqual(calculateCurvePercent(0.999), 100);
    assert.strictEqual(calculateCurvePercent(1.0), 100);
  });

  test('gracefully handles boundary overshoots and negative progress', () => {
    assert.strictEqual(calculateCurvePercent(-0.1), 0);
    assert.strictEqual(calculateCurvePercent(1.5), 100);
    assert.strictEqual(calculateCurvePercent(undefined), 0);
    assert.strictEqual(calculateCurvePercent(null), 0);
  });
});

describe('Mempool & Launch Feed - Chronological Sorting', () => {
  const sortTokensDescending = (tokens) => {
    return [...tokens].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  };

  test('sorts live token launches strictly by timestamp descending', () => {
    const rawTokens = [
      { id: 1, symbol: 'OLD', timestamp: 1700000000 },
      { id: 2, symbol: 'NEWEST', timestamp: 1700000500 },
      { id: 3, symbol: 'MID', timestamp: 1700000250 }
    ];

    const sorted = sortTokensDescending(rawTokens);
    assert.strictEqual(sorted[0].symbol, 'NEWEST');
    assert.strictEqual(sorted[1].symbol, 'MID');
    assert.strictEqual(sorted[2].symbol, 'OLD');
  });

  test('handles missing or zero timestamps gracefully at the tail', () => {
    const rawTokens = [
      { id: 1, symbol: 'NOTIME' },
      { id: 2, symbol: 'LIVE', timestamp: 1700000500 }
    ];

    const sorted = sortTokensDescending(rawTokens);
    assert.strictEqual(sorted[0].symbol, 'LIVE');
    assert.strictEqual(sorted[1].symbol, 'NOTIME');
  });
});

describe('Security Filter - 8% Tax Threshold Enforcement', () => {
  test('strictly enforces <= 8% safe tax threshold', () => {
    const safeResult = evaluateTaxRisk(8, 8);
    assert.strictEqual(safeResult.isHighTax, false);
    assert.strictEqual(safeResult.status, 'ACCEPTABLE');

    const boundaryFailBuy = evaluateTaxRisk(8.01, 5);
    assert.strictEqual(boundaryFailBuy.isHighTax, true);
    assert.strictEqual(boundaryFailBuy.status, 'HIGH_RISK_TAX');

    const boundaryFailSell = evaluateTaxRisk(5, 8.5);
    assert.strictEqual(boundaryFailSell.isHighTax, true);
    assert.strictEqual(boundaryFailSell.status, 'HIGH_RISK_TAX');
  });
});
