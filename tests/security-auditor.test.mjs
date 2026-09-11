import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateTaxRisk,
  auditContractBytecode,
  checkSocialCloning,
  classifyDevCluster,
  STANDARD_FLAP_IMPLS
} from '../src/utils/security-auditor.js';

describe('Security Auditor - Tax Risk Evaluation', () => {
  it('accepts zero and normal taxes under threshold', () => {
    const res = evaluateTaxRisk(0, 0);
    assert.equal(res.isHighTax, false);
    assert.equal(res.status, 'ACCEPTABLE');

    const res3 = evaluateTaxRisk(3, 3);
    assert.equal(res3.isHighTax, false);
    assert.equal(res3.buyTax, 3);
  });

  it('flags predatory taxes above threshold (> 9%)', () => {
    const res10 = evaluateTaxRisk(10, 2);
    assert.equal(res10.isHighTax, true);
    assert.equal(res10.status, 'HIGH_RISK_TAX');

    const resSell = evaluateTaxRisk(1, 15);
    assert.equal(resSell.isHighTax, true);
  });

  it('handles null / undefined / edge cases gracefully', () => {
    const resNull = evaluateTaxRisk(null, undefined);
    assert.equal(resNull.buyTax, 0);
    assert.equal(resNull.isHighTax, false);
  });
});

describe('Security Auditor - Bytecode Analysis (ERC-1167)', () => {
  it('identifies standard Flap minimal proxy implementations', () => {
    const standardImpl = STANDARD_FLAP_IMPLS[0]; // 0x024f18294970b5c76c0691b87f138a0317156422
    const bytecode = `0x363d3d373d3d3d363d73${standardImpl.slice(2)}5af43d82803e903d91602b57fd5bf3`;
    
    const result = auditContractBytecode(bytecode);
    assert.equal(result.type, 'STANDARD_PROXY');
    assert.equal(result.isProxy, true);
    assert.equal(result.isStandard, true);
    assert.equal(result.implementation, standardImpl.toLowerCase());
  });

  it('flags unverified custom proxy implementations as suspicious', () => {
    const customImpl = '0x1111111111111111111111111111111111111111';
    const bytecode = `0x363d3d373d3d3d363d73${customImpl.slice(2)}5af43d82803e903d91602b57fd5bf3`;
    
    const result = auditContractBytecode(bytecode);
    assert.equal(result.type, 'CUSTOM_PROXY');
    assert.equal(result.isProxy, true);
    assert.equal(result.isStandard, false);
    assert.equal(result.implementation, customImpl);
  });

  it('handles native non-proxy contracts and empty bytecode', () => {
    const nativeCode = '0x608060405234801561001057600080fd5b50...';
    assert.equal(auditContractBytecode(nativeCode).type, 'NATIVE_CONTRACT');
    assert.equal(auditContractBytecode('0x').type, 'UNKNOWN');
    assert.equal(auditContractBytecode(null).type, 'UNKNOWN');
  });
});

describe('Security Auditor - Social Media Clone & Phishing Detection', () => {
  it('detects famous project copycats on popular social blacklists', () => {
    const res = checkSocialCloning('https://t.me/pepecoineth_official', '0x1234');
    assert.ok(res);
    assert.equal(res.type, 'FAMOUS_PROJECT_COPYCAT');
  });

  it('detects duplicate social handles across different tokens', () => {
    const registry = {
      'https://t.me/mycommunity': '0xaaaa111122223333444455556666777788889999'
    };

    const duplicateRes = checkSocialCloning(
      'https://t.me/mycommunity',
      '0xbbbb111122223333444455556666777788889999',
      registry
    );

    assert.ok(duplicateRes);
    assert.equal(duplicateRes.type, 'DUPLICATE_SOCIAL_ACROSS_TOKENS');
    assert.equal(duplicateRes.originalToken, '0xaaaa111122223333444455556666777788889999');
  });

  it('ignores official launchpad links and short queries', () => {
    assert.equal(checkSocialCloning('https://t.me/flap_channel', '0x1234'), null);
    assert.equal(checkSocialCloning('https://flap.sh', '0x1234'), null);
    assert.equal(checkSocialCloning('', '0x1234'), null);
  });
});

describe('Security Auditor - Dev Wallet Clustering', () => {
  it('classifies high-volume funding wallets as exchanges or bridges', () => {
    const res = classifyDevCluster(1500, false);
    assert.equal(res.category, 'INSTITUTIONAL_OR_EXCHANGE');
    assert.equal(res.risk, 'LOW');
  });

  it('flags serial deployers with medium transaction volume (>20)', () => {
    const res = classifyDevCluster(45, false);
    assert.equal(res.category, 'SERIAL_DEPLOYER');
    assert.equal(res.risk, 'HIGH');
  });

  it('identifies fresh or low-activity private wallets', () => {
    const res = classifyDevCluster(3, false);
    assert.equal(res.category, 'FRESH_OR_PRIVATE_WALLET');
    assert.equal(res.risk, 'NEUTRAL');
  });
});
