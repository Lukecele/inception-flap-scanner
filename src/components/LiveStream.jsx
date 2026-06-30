import React, { useState, useEffect } from 'react';
import { AlertTriangle, Filter, Trash2, XCircle } from 'lucide-react';
import './LiveStream.css';

const MOCK_STREAM = [
  { id: 1, name: 'SafeMoonX', tax: '11/11', reason: 'High Tax Bot (>9%)', time: '1s ago' },
  { id: 2, name: 'DogeInu2', tax: '0/0', reason: 'Clone/Proxy Detected', time: '4s ago' },
  { id: 3, name: 'PepeKiller', tax: '10/10', reason: 'High Tax Bot (>9%)', time: '12s ago' },
  { id: 4, name: 'FlapTest', tax: '0/0', reason: 'Dev Wallet Scam Cluster', time: '21s ago' },
  { id: 5, name: 'YieldAI', tax: '0/0', reason: 'Socials Cloned', time: '35s ago' }
];

const LiveStream = () => {
  const [stream, setStream] = useState(MOCK_STREAM);

  // Simulate incoming bot rejections
  useEffect(() => {
    const interval = setInterval(() => {
      const newItems = ['GPTCoin', 'ElonDoge', 'SafeElon', 'MoonShot'];
      const newItem = {
        id: Date.now(),
        name: newItems[Math.floor(Math.random() * newItems.length)] + Math.floor(Math.random() * 100),
        tax: Math.random() > 0.5 ? '10/10' : '0/0',
        reason: Math.random() > 0.5 ? 'High Tax Bot (>9%)' : 'Clone/Proxy Detected',
        time: 'Just now'
      };
      
      setStream(prev => [newItem, ...prev].slice(0, 8)); // keep last 8
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="glass-panel panel-container stream-container">
      <div className="panel-header">
        <div className="flex-row">
          <Filter className="text-purple" size={20} />
          <h2 className="font-mono text-bright">PHASE 1 & 2: BOT FILTER</h2>
        </div>
        <div className="badge bg-purple-dim border-purple text-purple font-mono">
          <Activity size={12} className="inline-icon mr-1" />
          Auto-Rejecting
        </div>
      </div>
      
      <div className="stream-list">
        {stream.map((item, index) => (
          <div key={item.id} className="stream-item animate-slide-in" style={{ animationDelay: `${index * 0.05}s` }}>
            <div className="stream-icon-box bg-red-dim border-red">
              <Trash2 size={16} className="text-red" />
            </div>
            <div className="stream-info">
              <div className="stream-name font-mono text-bright">{item.name}</div>
              <div className="stream-reason text-red text-sm">
                <XCircle size={12} className="inline-icon mr-1" />
                {item.reason}
              </div>
            </div>
            <div className="stream-meta text-right">
              <div className="font-mono text-sm">Tax: {item.tax}</div>
              <div className="text-xs text-muted">{item.time}</div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="stream-footer font-mono text-xs">
        <AlertTriangle size={12} className="text-red inline-icon mr-1" />
        85% of volume filtered automatically. Waiting for human review...
      </div>
    </div>
  );
};

// Activity icon for the badge since we didn't import it at the top
const Activity = ({ size, className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
  </svg>
);

export default LiveStream;
