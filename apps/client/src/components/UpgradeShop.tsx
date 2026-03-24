import { useState } from 'react';
import { useStore } from '../store';
import { getSocket } from '../socket';
import { playUpgradePurchase } from '../audio';
import type { UpgradeDef } from '../socket';

const CATEGORY_CONFIG = {
  power: { label: 'Power', icon: '\u26A1', color: 'text-red-400', activeBg: 'bg-red-500/10', activeBorder: 'border-red-500/20' },
  cosmetic: { label: 'Cosmetics', icon: '\u2728', color: 'text-purple-400', activeBg: 'bg-purple-500/10', activeBorder: 'border-purple-500/20' },
  territory: { label: 'Territory', icon: '\uD83C\uDF0D', color: 'text-emerald-400', activeBg: 'bg-emerald-500/10', activeBorder: 'border-emerald-500/20' },
} as const;

function UpgradeCard({ def, userLevel, userXP }: { def: UpgradeDef; userLevel: number; userXP: number }) {
  const [purchasing, setPurchasing] = useState(false);

  const isMaxed = userLevel >= def.maxLevel;
  const cost = isMaxed ? 0 : Math.floor(def.baseCost * Math.pow(def.costMultiplier, userLevel));
  const canAfford = userXP >= cost;

  function handlePurchase() {
    if (isMaxed || !canAfford || purchasing) return;
    setPurchasing(true);
    getSocket()?.emit('ws:purchase-upgrade', { upgradeSlug: def.slug });
    playUpgradePurchase(useStore.getState().soundEnabled);
    setTimeout(() => setPurchasing(false), 2000);
  }

  return (
    <div className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.05] hover:border-white/[0.08] transition-all duration-200">
      <div className="flex justify-between items-start mb-1.5">
        <div className="text-sm font-semibold text-zinc-200 tracking-tight">{def.name}</div>
        <div className="text-[10px] text-zinc-500 font-mono bg-white/[0.03] px-1.5 py-0.5 rounded">
          {userLevel}/{def.maxLevel}
        </div>
      </div>
      <div className="text-[11px] text-zinc-500 mb-3 leading-relaxed">{def.description}</div>
      <div className="flex gap-1 mb-3">
        {Array.from({ length: def.maxLevel }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < userLevel ? 'bg-amber-400' : 'bg-white/[0.04]'
            }`}
          />
        ))}
      </div>
      {!isMaxed ? (
        <button
          onClick={handlePurchase}
          disabled={!canAfford || purchasing}
          className={`w-full py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
            canAfford && !purchasing
              ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border border-amber-500/15'
              : 'bg-white/[0.02] text-zinc-600 border border-white/[0.04] cursor-not-allowed'
          }`}
        >
          {purchasing ? 'Purchasing...' : `${cost.toLocaleString()} XP`}
        </button>
      ) : (
        <div className="w-full py-2 rounded-lg text-xs font-semibold text-center text-emerald-400 bg-emerald-500/10 border border-emerald-500/15">
          Maxed Out
        </div>
      )}
    </div>
  );
}

export default function UpgradeShop() {
  const show = useStore((s) => s.showUpgradeShop);
  const setShowUpgradeShop = useStore((s) => s.setShowUpgradeShop);
  const availableUpgrades = useStore((s) => s.availableUpgrades);
  const myUpgrades = useStore((s) => s.myUpgrades);
  const xp = useStore((s) => s.xp);
  const isAuthenticated = useStore((s) => s.isAuthenticated);

  const [activeTab, setActiveTab] = useState<'power' | 'cosmetic' | 'territory'>('power');

  if (!show) return null;

  const userUpgradeMap = new Map(myUpgrades.map((u) => [u.slug, u.level]));
  const filteredUpgrades = availableUpgrades.filter((u) => u.category === activeTab);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto" onClick={() => setShowUpgradeShop(false)}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-[460px] max-w-[92vw] max-h-[80vh] glass-strong rounded-2xl overflow-hidden flex flex-col shadow-panel animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-zinc-100 tracking-tight">Upgrade Shop</div>
            <div className="text-[11px] text-amber-400 font-mono mt-0.5 font-medium">
              {xp.toLocaleString()} XP available
            </div>
          </div>
          <button
            onClick={() => setShowUpgradeShop(false)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1.5 rounded-lg hover:bg-white/[0.04]"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/[0.06]">
          {(Object.keys(CATEGORY_CONFIG) as Array<keyof typeof CATEGORY_CONFIG>).map((cat) => {
            const cfg = CATEGORY_CONFIG[cat];
            const isActive = activeTab === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                className={`flex-1 py-2.5 text-xs font-medium transition-all duration-200 flex items-center justify-center gap-1.5 ${
                  isActive
                    ? `${cfg.color} ${cfg.activeBg} border-b-2 ${cfg.activeBorder}`
                    : 'text-zinc-500 hover:text-zinc-400 hover:bg-white/[0.02]'
                }`}
              >
                <span className="text-[11px]">{cfg.icon}</span>
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {!isAuthenticated ? (
            <div className="text-center py-12 text-zinc-500 text-sm">
              <div className="text-2xl mb-3 opacity-40">&#x1F512;</div>
              Sign in with GitHub to unlock upgrades
            </div>
          ) : filteredUpgrades.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm">
              No upgrades available in this category
            </div>
          ) : (
            filteredUpgrades.map((def) => (
              <UpgradeCard
                key={def.slug}
                def={def}
                userLevel={userUpgradeMap.get(def.slug) || 0}
                userXP={xp}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
