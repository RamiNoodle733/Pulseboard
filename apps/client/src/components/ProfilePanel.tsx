import { useEffect } from 'react';
import { useStore } from '../store';
import { getSocket } from '../socket';

export default function ProfilePanel() {
  const show = useStore((s) => s.showProfile);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const authUsername = useStore((s) => s.authUsername);
  const authAvatarUrl = useStore((s) => s.authAvatarUrl);
  const level = useStore((s) => s.level);
  const xp = useStore((s) => s.xp);
  const totalXP = useStore((s) => s.totalXP);
  const xpToNextLevel = useStore((s) => s.xpToNextLevel);
  const loginStreak = useStore((s) => s.loginStreak);
  const myUpgrades = useStore((s) => s.myUpgrades);
  const profileData = useStore((s) => s.profileData);
  const achievements = useStore((s) => s.achievements);
  const setShowProfile = useStore((s) => s.setShowProfile);
  const setShowUpgradeShop = useStore((s) => s.setShowUpgradeShop);
  const setAuth = useStore((s) => s.setAuth);

  useEffect(() => {
    if (show) {
      const socket = getSocket();
      socket?.emit('ws:get-profile');
      socket?.emit('ws:get-achievements');
    }
  }, [show]);

  if (!show) return null;

  const xpForLevel = (lvl: number) => lvl <= 1 ? 0 : Math.floor(100 * Math.pow(1.4, lvl - 2));
  const currentLevelXP = xpForLevel(level);
  const nextLevelXP = xpForLevel(level + 1);
  const levelSpan = nextLevelXP - currentLevelXP;
  const xpProgress = levelSpan > 0 ? Math.max(0, Math.min(1, (totalXP - currentLevelXP) / levelSpan)) : 1;

  function handleSignOut() {
    localStorage.removeItem('pulseboard:token');
    setAuth(false, null, null);
    setShowProfile(false);
    window.location.reload();
  }

  function handleOpenUpgrades() {
    setShowUpgradeShop(true);
    getSocket()?.emit('ws:get-upgrades');
  }

  return (
    <div className="fixed inset-0 z-50 pointer-events-auto" onClick={() => setShowProfile(false)}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="absolute inset-y-0 left-0 w-80 max-w-[85vw] glass-strong animate-slide-in-left shadow-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <div className="h-full overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-4 border-b border-white/[0.06]">
            <span className="text-sm font-semibold text-zinc-200 tracking-tight">Profile</span>
            <button
              onClick={() => setShowProfile(false)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-white/[0.04]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Avatar + Info */}
          <div className="px-5 py-6 flex flex-col items-center border-b border-white/[0.06]">
            <div className="relative">
              {authAvatarUrl ? (
                <img
                  src={authAvatarUrl}
                  alt={authUsername || ''}
                  className="w-18 h-18 rounded-full ring-2 ring-amber-500/20"
                  style={{ width: 72, height: 72 }}
                />
              ) : (
                <div className="w-18 h-18 rounded-full bg-zinc-800 flex items-center justify-center text-2xl font-bold text-zinc-400 ring-2 ring-white/10"
                  style={{ width: 72, height: 72 }}>
                  {(authUsername || '?')[0].toUpperCase()}
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 bg-surface-overlay text-amber-400 text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border border-amber-500/20">
                Lv.{level}
              </div>
            </div>
            <div className="mt-4 text-center">
              <div className="text-base font-semibold text-zinc-100 tracking-tight">{authUsername || 'Anonymous'}</div>
              {loginStreak > 1 && (
                <div className="flex items-center gap-1.5 mt-1.5 justify-center text-xs text-zinc-500">
                  <span className="text-amber-500">&#x2B50;</span>
                  {loginStreak} day streak
                </div>
              )}
            </div>
          </div>

          {/* XP Bar */}
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <div className="flex justify-between text-[11px] text-zinc-500 mb-2 font-mono">
              <span>{xp.toLocaleString()} XP</span>
              <span className="text-zinc-600">{xpToNextLevel.toLocaleString()} to next</span>
            </div>
            <div className="w-full h-2 bg-white/[0.04] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${xpProgress * 100}%`,
                  background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                }}
              />
            </div>
            <div className="text-[10px] text-zinc-600 mt-1.5 text-center font-mono">
              {totalXP.toLocaleString()} total XP earned
            </div>
          </div>

          {/* Upgrades Button */}
          <div className="px-5 py-3 border-b border-white/[0.06]">
            <button
              onClick={handleOpenUpgrades}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                bg-gradient-to-r from-amber-500/10 to-amber-400/5 hover:from-amber-500/15 hover:to-amber-400/10
                text-amber-400 border border-amber-500/15 hover:border-amber-500/25 glow-amber"
            >
              Upgrade Shop
            </button>
          </div>

          {/* Achievements */}
          {achievements.length > 0 && (
            <div className="px-5 py-3 border-b border-white/[0.06]">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2.5 font-medium">Achievements</div>
              <div className="flex flex-wrap gap-2">
                {achievements.map((a) => (
                  <div
                    key={a.slug}
                    className="flex items-center gap-1.5 bg-white/[0.03] rounded-lg px-2.5 py-1.5 border border-white/[0.04]"
                    title={a.description}
                  >
                    <span className="text-sm">{a.icon}</span>
                    <span className="text-[10px] text-zinc-400 font-medium">{a.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Owned Upgrades */}
          {myUpgrades.length > 0 && (
            <div className="px-5 py-3 border-b border-white/[0.06]">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2.5 font-medium">Your Upgrades</div>
              <div className="space-y-1.5">
                {myUpgrades.map((u) => (
                  <div key={u.slug} className="flex justify-between items-center text-xs">
                    <span className="text-zinc-300">{u.name}</span>
                    <div className="flex gap-0.5">
                      {Array.from({ length: u.maxLevel }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full ${i < u.level ? 'bg-amber-400' : 'bg-zinc-700/50'}`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="px-5 py-3 border-b border-white/[0.06]">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2.5 font-medium">Stats</div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Total XP Earned</span>
                <span className="text-zinc-300 font-mono">{totalXP.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Level</span>
                <span className="text-amber-400 font-mono font-medium">{level}</span>
              </div>
              {profileData?.stats && (
                <>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Energy Contributed</span>
                    <span className="text-zinc-300 font-mono">{Math.round(profileData.stats.totalEnergyContributed).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Syncs Participated</span>
                    <span className="text-zinc-300 font-mono">{profileData.stats.syncsParticipated.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Cities Influenced</span>
                    <span className="text-zinc-300 font-mono">{profileData.stats.citiesInfluenced.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Member Since</span>
                    <span className="text-zinc-300">
                      {new Date(profileData.stats.memberSince).toLocaleDateString()}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Sign Out */}
          {isAuthenticated && (
            <div className="px-5 py-5">
              <button
                onClick={handleSignOut}
                className="w-full py-2.5 text-xs font-medium text-zinc-500 hover:text-red-400 transition-all duration-200
                  border border-white/[0.06] hover:border-red-500/20 rounded-xl
                  hover:bg-red-500/5"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
