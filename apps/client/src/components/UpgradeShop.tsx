import { useState } from 'react';
import { useStore } from '../store';
import { getSocket } from '../socket';
import type { UpgradeDef } from '../socket';

const CATEGORY_LABELS = {
  power: 'Power',
  cosmetic: 'Cosmetics',
  territory: 'Territory',
} as const;

const CATEGORY_COLORS = {
  power: 'text-red-400 bg-red-500/10 border-red-500/20',
  cosmetic: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  territory: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
} as const;

function UpgradeCard({ def, userLevel, userXP }: { def: UpgradeDef; userLevel: number; userXP: number }) {
  const [purchasing, setPurchasing] = useState(false);

  const isMaxed = userLevel >= def.maxLevel;
  const cost = isMaxed ? 0 : Math.floor(def.baseCost * Math.pow(def.costMultiplier, userLevel));
  const canAfford = userXP >= cost;

  function handlePurchase() {
    if (isMaxed || !canAfford || purchasing) return;
    setPurchasing(true);
    const socket = getSocket();
    socket?.emit('ws:purchase-upgrade', { upgradeSlug: def.slug });
    setTimeout(() => setPurchasing(false), 2000);
  }

  return (
    <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
      <div className="flex justify-between items-start mb-1">
        <div className="text-sm font-medium text-zinc-200">{def.name}</div>
        <div className="text-xs text-zinc-500 font-mono">
          {userLevel}/{def.maxLevel}
        </div>
      </div>
      <div className="text-xs text-zinc-500 mb-2">{def.description}</div>
      {/* Level dots */}
      <div className="flex gap-1 mb-2">
        {Array.from({ length: def.maxLevel }).map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full ${
              i < userLevel ? 'bg-amber-400' : 'bg-zinc-700'
            }`}
          />
        ))}
      </div>
      {!isMaxed ? (
        <button
          onClick={handlePurchase}
          disabled={!canAfford || purchasing}
          className={`w-full py-1.5 rounded text-xs font-medium transition-colors ${
            canAfford && !purchasing
              ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/20'
              : 'bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-not-allowed'
          }`}
        >
          {purchasing ? 'Purchasing...' : `${cost.toLocaleString()} XP`}
        </button>
      ) : (
        <div className="w-full py-1.5 rounded text-xs font-medium text-center text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
          Maxed
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
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={() => setShowUpgradeShop(false)} />

      {/* Modal */}
      <div className="relative w-[440px] max-w-[92vw] max-h-[80vh] bg-zinc-900/95 backdrop-blur border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-200">Upgrade Shop</div>
            <div className="text-xs text-amber-400 font-mono mt-0.5">{xp.toLocaleString()} XP available</div>
          </div>
          <button
            onClick={() => setShowUpgradeShop(false)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          {(Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                activeTab === cat
                  ? `${CATEGORY_COLORS[cat]} border-b-2`
                  : 'text-zinc-500 hover:text-zinc-400'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {!isAuthenticated ? (
            <div className="text-center py-8 text-zinc-500 text-sm">
              Sign in with GitHub to unlock upgrades
            </div>
          ) : filteredUpgrades.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-sm">
              No upgrades available
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
