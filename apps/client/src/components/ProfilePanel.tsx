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
  const setShowProfile = useStore((s) => s.setShowProfile);
  const setShowUpgradeShop = useStore((s) => s.setShowUpgradeShop);
  const setAuth = useStore((s) => s.setAuth);

  if (!show) return null;

  const xpProgress = xpToNextLevel > 0 ? Math.max(0, 1 - xpToNextLevel / (xp + xpToNextLevel)) : 1;

  function handleSignOut() {
    localStorage.removeItem('pulseboard:token');
    setAuth(false, null, null);
    setShowProfile(false);
    window.location.reload();
  }

  function handleOpenUpgrades() {
    setShowUpgradeShop(true);
    // Request upgrades list
    const socket = getSocket();
    socket?.emit('ws:get-upgrades');
  }

  return (
    <div className="fixed inset-y-0 left-0 w-80 max-w-[85vw] z-50 pointer-events-auto">
      <div
        className="h-full bg-zinc-900/95 backdrop-blur border-r border-zinc-800 overflow-y-auto"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-zinc-800">
          <span className="text-sm font-medium text-zinc-300">Profile</span>
          <button
            onClick={() => setShowProfile(false)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Avatar + Info */}
        <div className="px-4 py-6 flex flex-col items-center border-b border-zinc-800">
          {authAvatarUrl ? (
            <img
              src={authAvatarUrl}
              alt={authUsername || ''}
              className="w-16 h-16 rounded-full border-2 border-zinc-700"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-xl font-bold text-zinc-400">
              {(authUsername || '?')[0].toUpperCase()}
            </div>
          )}
          <div className="mt-3 text-center">
            <div className="text-base font-medium text-zinc-200">{authUsername || 'Anonymous'}</div>
            <div className="flex items-center gap-2 mt-1 justify-center">
              <span className="bg-amber-500/20 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full">
                Lv.{level}
              </span>
              {loginStreak > 1 && (
                <span className="text-xs text-zinc-500">{loginStreak} day streak</span>
              )}
            </div>
          </div>
        </div>

        {/* XP Bar */}
        <div className="px-4 py-4 border-b border-zinc-800">
          <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
            <span>{xp.toLocaleString()} XP</span>
            <span>Next: {xpToNextLevel.toLocaleString()} XP</span>
          </div>
          <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
              style={{ width: `${xpProgress * 100}%` }}
            />
          </div>
          <div className="text-xs text-zinc-600 mt-1 text-center">
            Total: {totalXP.toLocaleString()} XP
          </div>
        </div>

        {/* Upgrades Button */}
        <div className="px-4 py-3 border-b border-zinc-800">
          <button
            onClick={handleOpenUpgrades}
            className="w-full py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-sm font-medium rounded-lg transition-colors border border-amber-500/20"
          >
            Upgrade Shop
          </button>
        </div>

        {/* Owned Upgrades */}
        {myUpgrades.length > 0 && (
          <div className="px-4 py-3 border-b border-zinc-800">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Your Upgrades</div>
            <div className="space-y-1.5">
              {myUpgrades.map((u) => (
                <div key={u.slug} className="flex justify-between items-center text-xs">
                  <span className="text-zinc-300">{u.name}</span>
                  <span className="text-zinc-500">Lv.{u.level}/{u.maxLevel}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="px-4 py-3 border-b border-zinc-800">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Stats</div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-500">Total XP Earned</span>
              <span className="text-zinc-300 font-mono">{totalXP.toLocaleString()}</span>
            </div>
            {profileData?.stats && (
              <>
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
          <div className="px-4 py-4">
            <button
              onClick={handleSignOut}
              className="w-full py-2 text-sm text-zinc-500 hover:text-red-400 transition-colors border border-zinc-800 rounded-lg hover:border-red-500/20"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
