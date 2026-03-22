import { useState } from 'react';
import { useStore } from '../store';

const STEPS = [
  {
    title: 'Welcome to Pulseboard',
    body: 'A living, global energy field powered by everyone online right now. Move your cursor to feed energy into the world.',
    icon: '\uD83C\uDF0D',
  },
  {
    title: 'Pulse & Resonate',
    body: 'Your movement generates energy pulses. When multiple people pulse at the same time, a resonance streak begins \u2014 chain them together!',
    icon: '\u26A1',
  },
  {
    title: 'Earn XP & Level Up',
    body: 'Everything you do earns XP. Level up to unlock upgrades that amplify your energy, customize your trail, and boost your territory.',
    icon: '\u2B50',
  },
  {
    title: 'Claim Your Territory',
    body: 'Your city glows on the world map as you contribute. Compete with other cities and countries for energy dominance.',
    icon: '\uD83C\uDFF0',
  },
];

export default function OnboardingOverlay() {
  const markSeen = useStore((s) => s.markOnboardingSeen);
  const [step, setStep] = useState(0);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md">
      <div className="glass-strong rounded-2xl max-w-sm w-full mx-4 p-7 shadow-panel animate-fade-in-scale">
        {/* Step indicator */}
        <div className="flex gap-1.5 mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                i <= step ? 'bg-amber-500' : 'bg-white/[0.06]'
              }`}
            />
          ))}
        </div>

        <div className="text-3xl mb-4">{current.icon}</div>
        <h2 className="text-white text-lg font-bold mb-2 tracking-tight">{current.title}</h2>
        <p className="text-zinc-400 text-sm leading-relaxed mb-8">{current.body}</p>

        <div className="flex justify-between items-center">
          <button
            onClick={markSeen}
            className="text-zinc-600 text-xs hover:text-zinc-400 transition-colors font-medium"
          >
            Skip
          </button>
          <button
            onClick={() => (isLast ? markSeen() : setStep(step + 1))}
            className="bg-amber-500/15 text-amber-400 border border-amber-500/20 rounded-xl px-5 py-2 text-sm font-semibold
              hover:bg-amber-500/25 hover:border-amber-500/30 transition-all duration-200"
          >
            {isLast ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
