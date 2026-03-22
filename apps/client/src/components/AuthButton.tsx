import { useStore } from '../store';
import { SERVER_URL } from '../socket';

export default function AuthButton() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const authUsername = useStore((s) => s.authUsername);
  const authAvatarUrl = useStore((s) => s.authAvatarUrl);
  const level = useStore((s) => s.level);
  const setShowProfile = useStore((s) => s.setShowProfile);

  if (isAuthenticated) {
    return (
      <button
        onClick={() => setShowProfile(true)}
        className="flex items-center gap-2 hover:opacity-90 transition-all duration-200 group"
        title={authUsername || ''}
      >
        {authAvatarUrl ? (
          <img
            src={authAvatarUrl}
            alt=""
            className="w-6 h-6 rounded-full ring-1 ring-white/10 group-hover:ring-white/20 transition-all"
          />
        ) : (
          <span className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-medium text-zinc-400 ring-1 ring-white/10">
            {(authUsername || '?')[0].toUpperCase()}
          </span>
        )}
        <span className="text-zinc-400 text-xs max-w-[80px] truncate hidden sm:inline font-medium">
          {authUsername}
        </span>
        <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 tabular-nums border border-amber-500/10">
          {level}
        </span>
      </button>
    );
  }

  return (
    <a
      href={`${SERVER_URL}/auth/github`}
      className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-all duration-200 glass px-3 py-1.5 rounded-full text-xs font-medium hover:border-white/10"
      title="Sign in with GitHub"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
      </svg>
      Sign in
    </a>
  );
}
