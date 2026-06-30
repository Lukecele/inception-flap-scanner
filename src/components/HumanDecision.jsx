import React, { useState } from 'react';
import { Target, CheckCircle, Crosshair, Brain, Fingerprint, Code, Globe, Send } from 'lucide-react';
import './HumanDecision.css';

const HumanDecision = () => {
  const [status, setStatus] = useState('pending'); // pending, sniping, rejected

  const handleAction = (action) => {
    setStatus(action);
    setTimeout(() => {
      setStatus('pending');
    }, 3000);
  };

  return (
    <div className="glass-panel decision-container">
      {status !== 'pending' && (
        <div className={`overlay-status ${status === 'sniping' ? 'overlay-success' : 'overlay-danger'}`}>
          <div className="overlay-content font-mono">
            {status === 'sniping' ? (
              <>
                <Target size={48} className="text-green mb-4 animate-pulse" />
                <h2 className="text-green text-2xl font-bold">EXECUTING SNIPE...</h2>
                <p>Entering on mathematical floor</p>
              </>
            ) : (
              <>
                <Crosshair size={48} className="text-red mb-4 animate-pulse" />
                <h2 className="text-red text-2xl font-bold">TARGET REJECTED</h2>
                <p>Awaiting next candidate</p>
              </>
            )}
          </div>
        </div>
      )}

      <div className="decision-header">
        <div className="flex-row">
          <Brain className="text-cyan" size={24} />
          <h2 className="font-mono text-bright">PHASE 3 & 4: HUMAN OVERRIDE</h2>
        </div>
        <div className="pulse-indicator">
          <div className="pulse-dot"></div>
          <span className="font-mono text-cyan text-sm">TARGET ACQUIRED</span>
        </div>
      </div>

      <div className="target-card">
        <div className="target-top">
          <div className="target-identity">
            <div className="token-logo font-mono text-2xl text-bright">G<span className="text-cyan">P</span></div>
            <div>
              <h3 className="text-2xl font-bold text-bright">GameProtocol <span className="text-sm font-mono text-cyan ml-2">$GPRO</span></h3>
              <div className="flex-row mt-1 text-sm">
                <span className="badge-small bg-green-dim text-green border-green">TAX: 0/0</span>
                <span className="badge-small bg-cyan-dim text-cyan border-cyan">NO BUNDLE</span>
              </div>
            </div>
          </div>
          <div className="time-elapsed font-mono text-right">
            <div className="text-sm text-muted">Time on Curve</div>
            <div className="text-xl text-bright">0.8s</div>
          </div>
        </div>

        <div className="analysis-grid">
          {/* Phase 2: Archetype */}
          <div className="analysis-box">
            <div className="box-header text-purple font-mono">
              <Fingerprint size={16} /> PHASE 2: ARCHETYPE
            </div>
            <div className="box-content">
              <div className="flex-row justify-between mb-2">
                <span className="text-bright">Model:</span>
                <span className="text-cyan font-bold">Marketing-Driven</span>
              </div>
              <div className="flex-row justify-between text-sm">
                <span>Web Clone Check:</span>
                <span className="text-green flex-row"><CheckCircle size={14}/> Unique DOM</span>
              </div>
              <div className="socials-list mt-3">
                <div className="social-tag"><Globe size={14}/> Validated (Created 2022)</div>
                <div className="social-tag"><Send size={14}/> 450 Organic Members</div>
              </div>
            </div>
          </div>

          {/* Phase 4: Dev History */}
          <div className="analysis-box">
            <div className="box-header text-green font-mono">
              <ShieldIcon size={16} /> PHASE 4: DEV ON-CHAIN
            </div>
            <div className="box-content">
              <div className="code-snippet font-mono text-sm">
                <div>Funding: <span className="text-cyan">Binance (0.5 BNB)</span></div>
                <div>Hop Distance: <span className="text-green">Clean (0 Hops to Scam)</span></div>
                <div>Age: <span className="text-cyan">2 Days</span></div>
                <div className="mt-2 text-muted text-xs">No Tornado Cash interaction detected.</div>
              </div>
            </div>
          </div>

          {/* Phase 3: Mechanism / Innovation */}
          <div className="analysis-box full-width">
            <div className="box-header text-bright font-mono border-b-cyan pb-2">
              <Code size={16} className="text-cyan" /> PHASE 3: MECHANISM INSPECTION (HUMAN REVIEW)
            </div>
            <div className="box-content mt-2">
              <p className="text-sm mb-3">Bot extracted unique logic pattern not found in standard Flap.sh templates:</p>
              <div className="code-block font-mono text-sm">
                <span className="text-purple">function</span> <span className="text-green">claimGameRewards</span>() <span className="text-purple">external</span> {'{'} <br/>
                &nbsp;&nbsp;<span className="text-muted">// Requires holding for 100 blocks + signature</span><br/>
                &nbsp;&nbsp;<span className="text-cyan">require</span>(block.number <span className="text-red">&gt;</span> lastTransfer[msg.sender] <span className="text-red">+</span> 100);<br/>
                &nbsp;&nbsp;<span className="text-muted">// Dynamic emission based on curve progress</span><br/>
                &nbsp;&nbsp;<span className="text-cyan">uint256</span> reward <span className="text-red">=</span> calculateDynamicEmission(curveSupply);<br/>
                {'}'}
              </div>
              <div className="mt-3 text-sm flex-row">
                <Brain size={16} className="text-cyan" />
                <span className="text-bright font-bold">Your Call:</span> Is this real innovation or over-engineered garbage?
              </div>
            </div>
          </div>
        </div>

        <div className="action-buttons">
          <button 
            className="btn btn-danger font-mono"
            onClick={() => handleAction('rejected')}
          >
            <Crosshair size={18} className="mr-2" />
            DISCARD (TRASH)
          </button>
          <button 
            className="btn btn-success font-mono pulse-btn"
            onClick={() => handleAction('sniping')}
          >
            <Target size={18} className="mr-2" />
            ENTER FLOOR (SNIPE)
          </button>
        </div>
      </div>
    </div>
  );
};

const ShieldIcon = ({ size, className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
  </svg>
);

export default HumanDecision;
