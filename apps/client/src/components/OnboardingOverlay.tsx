import { useState } from 'react';
import { useStore } from '../store';

const STEPS = [
  {
    title: 'Welcome to Pulseboard',
    body: 'A living, global energy field powered by everyone online right now. Move your cursor to feed energy into the world.',
  },
  {
    title: 'Pulse & Resonate',
    body: 'Click anywhere to send a pulse. When multiple people pulse at the same time, a resonance streak begins — chain them together!',
  },
  {
    title: 'Earn XP & Level Up',
    body: 'Everything you do earns XP. Level up to unlock upgrades that amplify your energy, customize your trail, and boost your territory.',
  },
  {
    title: 'Claim Your Territory',
    body: 'Your city glows on the world map as you contribute. Compete with other cities and countries for energy dominance.',
  },
];

export default function OnboardingOverlay() {
  const markSeen = useStore((s) => s.markOnboardingSeen);
  const [step, setStep] = useState(0);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900/95 border border-zinc-700/50 rounded-2xl max-w-sm w-full mx-4 p-6 shadow-2xl">
        {/* Step indicator */}
        <div className="flex gap-1.5 mb-4">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-amber-500' : 'bg-zinc-700'
              }`}
            />
          ))}
        </div>

        <h2 className="text-white text-lg font-semibold mb-2">{current.title}</h2>
        <p className="text-zinc-400 text-sm leading-relaxed mb-6">{current.body}</p>

        <div className="flex justify-between items-center">
          <button
            onClick={markSeen}
            className="text-zinc-500 text-xs hover:text-zinc-300 transition-colors"
          >
            Skip
          </button>

          <button
            onClick={() => (isLast ? markSeen() : setStep(step + 1))}
            className="bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-amber-500/30 transition-colors"
          >
            {isLast ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
