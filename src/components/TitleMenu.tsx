import React, { useState } from 'react';
import { Dices, Play, Plus, Wrench } from 'lucide-react';
import { DifficultyLevel } from '../types/game';
import { generateRandomSeed } from '../utils/rng';
import { MatrixRainCanvas } from './MatrixRainCanvas';

interface TitleMenuProps {
  hasSavedGame: boolean;
  savedSummary?: string;
  onStartNew: (difficulty: DifficultyLevel, devMode?: boolean, runSeed?: string) => void;
  onResume: () => void;
  onReturnToStudy?: () => void;
}

export const TitleMenu: React.FC<TitleMenuProps> = ({
  hasSavedGame,
  savedSummary,
  onStartNew,
  onResume,
  onReturnToStudy,
}) => {
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('STANDARD');
  const [runSeed, setRunSeed] = useState<string>(() => generateRandomSeed());

  const difficulties: { id: DifficultyLevel; title: string; cash: string }[] = [
    { id: 'BOOTSTRAP', title: 'Bootstrap', cash: '$750' },
    { id: 'STANDARD', title: 'Standard', cash: '$1,450' },
    { id: 'TYCOON_SANDBOX', title: 'Venture', cash: '$35,000' },
  ];

  return (
    <div className="relative min-h-screen bg-[#020603] text-green-50 flex items-center justify-start p-6 sm:p-10 lg:pl-14 overflow-hidden">
      <MatrixRainCanvas enabled prominent />

      {/* Left-Side Menu Rail leaving the open viewport to the falling green numbers */}
      <aside className="relative z-10 w-full max-w-[430px] bg-[#030A05]/86 backdrop-blur-md border border-green-500/35 rounded-xl p-7 sm:p-8 shadow-[0_0_50px_rgba(34,197,94,0.16)] flex flex-col gap-6">
        <div>
          <div className="text-xs font-mono text-green-400 mb-2 matrix-glow">
            Step-Based Crypto Mining Simulator
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-green-50 leading-tight [text-wrap:balance]">
            Blockworks Tycoon
          </h1>
          <p className="mt-3 text-sm text-green-100/75 leading-relaxed">
            Assemble custom mining rigs, ride market halvings, outmaneuver rival syndicates, or run covert black-market operations straight from the terminal.
          </p>
        </div>

        {/* Primary Menu Options: Continue, New Run, Dev Mode */}
        <div className="flex flex-col gap-2.5">
          {hasSavedGame && (
            <button
              type="button"
              onClick={onResume}
              className="w-full px-5 py-3.5 rounded-lg bg-green-500 hover:bg-green-400 text-[#020804] font-semibold text-sm flex items-center justify-between gap-3 transition-colors"
            >
              <span className="inline-flex items-center gap-2 whitespace-nowrap shrink-0">
                <Play className="w-4 h-4 fill-current" />
                <span>Continue</span>
              </span>
              {savedSummary && (
                <span className="font-mono text-xs font-medium text-[#020804]/85 tabular-nums truncate">
                  {savedSummary}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => onStartNew(difficulty, false, runSeed)}
            className={`w-full px-5 py-3.5 rounded-lg font-semibold text-sm flex items-center justify-between gap-3 transition-colors ${
              hasSavedGame
                ? 'bg-[#06180B] hover:bg-green-950 text-green-100 border border-green-500/35'
                : 'bg-green-500 hover:bg-green-400 text-[#020804]'
            }`}
          >
            <span className="inline-flex items-center gap-2 whitespace-nowrap shrink-0">
              <Plus className="w-4 h-4" />
              <span>New Game</span>
            </span>
            <span className="font-mono text-xs opacity-75 tabular-nums whitespace-nowrap shrink-0">
              {difficulties.find((d) => d.id === difficulty)?.cash}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onStartNew('TYCOON_SANDBOX', true, runSeed)}
            className="w-full px-5 py-3 rounded-lg bg-amber-500/12 hover:bg-amber-500/22 border border-amber-500/40 text-amber-300 font-semibold text-sm flex items-center justify-between gap-3 transition-colors"
          >
            <span className="inline-flex items-center gap-2 whitespace-nowrap shrink-0">
              <Wrench className="w-4 h-4" />
              <span>Dev Mode</span>
            </span>
            <span className="font-mono text-xs text-amber-300/75 whitespace-nowrap shrink-0">
              All Unlocked
            </span>
          </button>
        </div>

        {/* Compact New Run Configuration */}
        <div className="pt-5 border-t border-green-500/20 space-y-4">
          <div>
            <div className="text-xs font-medium text-green-300/80 mb-2">Starting Capital</div>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[#020704] border border-green-500/20">
              {difficulties.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDifficulty(d.id)}
                  className={`py-2 px-2 rounded-md text-center transition-colors ${
                    difficulty === d.id
                      ? 'bg-green-500/20 text-green-50 border border-green-400/50'
                      : 'text-green-200/70 hover:text-green-100 border border-transparent'
                  }`}
                >
                  <div className="text-xs font-semibold leading-tight">{d.title}</div>
                  <div className="text-[11px] font-mono tabular-nums text-green-400 mt-0.5">
                    {d.cash}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <label htmlFor="run-seed-input" className="text-xs font-medium text-green-300/80 whitespace-nowrap shrink-0">
              Run Seed
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id="run-seed-input"
                type="text"
                value={runSeed}
                onChange={(e) => setRunSeed(e.target.value.toUpperCase().slice(0, 18))}
                placeholder="SEED-1234"
                className="w-32 px-2.5 py-1.5 rounded-lg bg-[#020704] border border-green-500/30 font-mono text-xs text-green-200 focus:outline-none focus:border-green-400"
              />
              <button
                type="button"
                onClick={() => setRunSeed(generateRandomSeed())}
                title="Roll Random Seed"
                className="px-2.5 py-1.5 rounded-lg bg-[#06180B] hover:bg-green-950 border border-green-500/30 text-xs font-mono text-green-300 inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
              >
                <Dices className="w-3.5 h-3.5" />
                <span>Roll</span>
              </button>
            </div>
          </div>

          {onReturnToStudy && (
            <button
              type="button"
              onClick={onReturnToStudy}
              className="text-xs text-green-400/60 hover:text-green-300 underline-offset-4 hover:underline transition-colors text-left"
            >
              Return to Study Portal
            </button>
          )}
        </div>
      </aside>
    </div>
  );
};
