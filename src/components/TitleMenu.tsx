import React, { useRef, useState } from 'react';
import {
  Dices,
  Download,
  FolderArchive,
  Play,
  Plus,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Trophy,
  Upload,
  Wrench,
} from 'lucide-react';
import { CHALLENGES, FACILITY_TIERS, MARKET_REGIME_SPECS } from '../data/catalog';
import {
  ChallengeId,
  DifficultyLevel,
  MarketRegime,
  SandboxConfig,
} from '../types/game';
import { formatUsd } from '../utils/format';
import { generateRandomSeed } from '../utils/rng';
import { MatrixRainCanvas } from './MatrixRainCanvas';

interface TitleMenuProps {
  hasSavedGame: boolean;
  savedSummary?: string;
  hasSavedSandbox: boolean;
  sandboxSummary?: string;
  onStartNew: (
    difficulty: DifficultyLevel,
    devMode?: boolean,
    runSeed?: string,
    sandboxConfig?: SandboxConfig,
    challengeId?: ChallengeId | null
  ) => void;
  onResume: () => void;
  onResumeSandbox: () => void;
  onExportSave: (sandbox?: boolean) => string | null;
  onImportSave: (jsonText: string) => { ok: boolean; error?: string; summary?: string };
  onBackupSave: (sandbox?: boolean) => boolean;
  onRestoreBackup: (sandbox?: boolean) => boolean;
  onResetSave: (sandbox?: boolean) => void;
  onReturnToStudy?: () => void;
}

export const TitleMenu: React.FC<TitleMenuProps> = ({
  hasSavedGame,
  savedSummary,
  hasSavedSandbox,
  sandboxSummary,
  onStartNew,
  onResume,
  onResumeSandbox,
  onExportSave,
  onImportSave,
  onBackupSave,
  onRestoreBackup,
  onResetSave,
  onReturnToStudy,
}) => {
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('STANDARD');
  const [runSeed, setRunSeed] = useState<string>(() => generateRandomSeed());
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeId | ''>('');
  const [panelView, setPanelView] = useState<'NONE' | 'SANDBOX' | 'SAVES'>('NONE');

  // Sandbox Configurator State
  const [sbCash, setSbCash] = useState<number>(150000);
  const [sbFacilityId, setSbFacilityId] = useState<string>('fac_commercial');
  const [sbRigs, setSbRigs] = useState<number>(2);
  const [sbUnlockResearch, setSbUnlockResearch] = useState<boolean>(true);
  const [sbUnlockCoins, setSbUnlockCoins] = useState<boolean>(true);
  const [sbRegime, setSbRegime] = useState<MarketRegime>('ACCUMULATION');
  const [sbOpMult, setSbOpMult] = useState<number>(1.0);

  // Save Manager State
  const [importText, setImportText] = useState<string>('');
  const [saveFeedback, setSaveFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmResetTarget, setConfirmResetTarget] = useState<'CAREER' | 'SANDBOX' | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const difficulties: { id: DifficultyLevel; title: string; cash: string }[] = [
    { id: 'BOOTSTRAP', title: 'Bootstrap', cash: '$750' },
    { id: 'STANDARD', title: 'Standard', cash: '$1,450' },
    { id: 'TYCOON_SANDBOX', title: 'Venture', cash: '$35,000' },
  ];

  const triggerDownload = (sandbox: boolean) => {
    const raw = onExportSave(sandbox);
    if (!raw) {
      setSaveFeedback({
        ok: false,
        text: `No ${sandbox ? 'Sandbox' : 'Career'} save found to export.`,
      });
      return;
    }
    try {
      const blob = new Blob([raw], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hashrate-${sandbox ? 'sandbox' : 'career'}-save.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSaveFeedback({
        ok: true,
        text: `Exported ${sandbox ? 'Sandbox' : 'Career'} JSON save file.`,
      });
    } catch {
      setImportText(raw);
      setSaveFeedback({
        ok: true,
        text: 'Copied JSON save payload into import box below.',
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const res = onImportSave(text);
      setSaveFeedback({
        ok: res.ok,
        text: res.ok ? res.summary ?? 'Save imported.' : res.error ?? 'Import failed.',
      });
    };
    reader.onerror = () => {
      setSaveFeedback({ ok: false, text: 'Could not read selected file.' });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const launchSandbox = () => {
    const cfg: SandboxConfig = {
      startingCash: Math.max(0, sbCash),
      startingFacilityId: sbFacilityId,
      startingRigs: Math.max(0, Math.min(12, sbRigs)),
      unlockAllResearch: sbUnlockResearch,
      unlockAllCoins: sbUnlockCoins,
      marketRegime: sbRegime,
      operatingCostMult: sbOpMult,
    };
    onStartNew('SANDBOX', false, runSeed, cfg, null);
  };

  return (
    <div className="relative min-h-screen bg-[#020603] text-green-50 flex items-center justify-start p-5 sm:p-10 lg:pl-14 overflow-y-auto">
      <MatrixRainCanvas enabled prominent />

      {/* Left-Side Menu Rail leaving the open viewport to the falling green numbers */}
      <aside className="relative z-10 w-full max-w-[490px] bg-[#030A05]/88 backdrop-blur-md border border-green-500/35 rounded-xl p-6 sm:p-7 shadow-[0_0_50px_rgba(34,197,94,0.16)] flex flex-col gap-5 my-4">
        <div>
          <div className="text-xs font-mono text-green-400 mb-1.5 matrix-glow">
            Crypto Mining Tycoon Simulator · Expansion 2.0
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-green-50 leading-tight [text-wrap:balance]">
            HASHRATE
          </h1>
          <p className="mt-2.5 text-sm text-green-100/75 leading-relaxed">
            Scale from a 15A bedroom setup to a substation mega-complex. Negotiate power contracts,
            source used hardware, manage thermal fleets, and outpace rival syndicates.
          </p>
        </div>

        {/* Primary Menu Actions */}
        <div className="flex flex-col gap-2">
          {hasSavedGame && (
            <button
              type="button"
              onClick={onResume}
              className="w-full px-4 py-3 rounded-lg bg-green-500 hover:bg-green-400 text-[#020804] font-semibold text-sm flex items-center justify-between gap-3 transition-colors"
            >
              <span className="inline-flex items-center gap-2 whitespace-nowrap shrink-0">
                <Play className="w-4 h-4 fill-current" />
                <span>Continue Career</span>
              </span>
              {savedSummary && (
                <span className="font-mono text-xs font-medium text-[#020804]/85 tabular-nums truncate">
                  {savedSummary}
                </span>
              )}
            </button>
          )}

          {hasSavedSandbox && (
            <button
              type="button"
              onClick={onResumeSandbox}
              className="w-full px-4 py-2.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/40 text-emerald-200 font-semibold text-sm flex items-center justify-between gap-3 transition-colors"
            >
              <span className="inline-flex items-center gap-2 whitespace-nowrap shrink-0">
                <Play className="w-4 h-4" />
                <span>Continue Sandbox</span>
              </span>
              {sandboxSummary && (
                <span className="font-mono text-xs text-emerald-300/85 tabular-nums truncate">
                  {sandboxSummary}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              onStartNew(
                difficulty,
                false,
                runSeed,
                undefined,
                selectedChallenge ? selectedChallenge : null
              )
            }
            className={`w-full px-4 py-3 rounded-lg font-semibold text-sm flex items-center justify-between gap-3 transition-colors ${
              hasSavedGame
                ? 'bg-[#06180B] hover:bg-green-950 text-green-100 border border-green-500/35'
                : 'bg-green-500 hover:bg-green-400 text-[#020804]'
            }`}
          >
            <span className="inline-flex items-center gap-2 whitespace-nowrap shrink-0">
              <Plus className="w-4 h-4" />
              <span>{selectedChallenge ? 'Start Challenge Run' : 'New Career Game'}</span>
            </span>
            <span className="font-mono text-xs opacity-75 tabular-nums whitespace-nowrap shrink-0">
              {difficulties.find((d) => d.id === difficulty)?.cash}
            </span>
          </button>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setPanelView((v) => (v === 'SANDBOX' ? 'NONE' : 'SANDBOX'))}
              className={`px-3 py-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                panelView === 'SANDBOX'
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-100'
                  : 'bg-[#051409] hover:bg-green-950 border-green-500/30 text-green-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Sandbox</span>
            </button>

            <button
              type="button"
              onClick={() => setPanelView((v) => (v === 'SAVES' ? 'NONE' : 'SAVES'))}
              className={`px-3 py-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                panelView === 'SAVES'
                  ? 'bg-green-500/20 border-green-400 text-green-100'
                  : 'bg-[#051409] hover:bg-green-950 border-green-500/30 text-green-200'
              }`}
            >
              <FolderArchive className="w-3.5 h-3.5" />
              <span>Saves</span>
            </button>

            <button
              type="button"
              onClick={() => onStartNew('TYCOON_SANDBOX', true, runSeed)}
              className="px-3 py-2.5 rounded-lg bg-amber-500/12 hover:bg-amber-500/22 border border-amber-500/40 text-amber-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Dev Mode</span>
            </button>
          </div>
        </div>

        {/* Sandbox Configurator Drawer */}
        {panelView === 'SANDBOX' && (
          <div className="p-4 rounded-lg bg-[#020804] border border-emerald-500/35 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-emerald-300">
                Isolated Sandbox Mode Setup
              </span>
              <span className="text-[11px] font-mono text-emerald-400/75">Separate Save Slot</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <label className="space-y-1">
                <span className="text-green-300/80 block">Starting Cash</span>
                <select
                  value={sbCash}
                  onChange={(e) => setSbCash(Number(e.target.value))}
                  className="w-full px-2 py-1.5 rounded bg-[#030D06] border border-green-500/30 font-mono text-green-100"
                >
                  <option value={10000}>$10,000</option>
                  <option value={150000}>$150,000</option>
                  <option value={1000000}>$1,000,000</option>
                  <option value={10000000}>$10,000,000</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-green-300/80 block">Starting Facility</span>
                <select
                  value={sbFacilityId}
                  onChange={(e) => setSbFacilityId(e.target.value)}
                  className="w-full px-2 py-1.5 rounded bg-[#030D06] border border-green-500/30 font-mono text-green-100"
                >
                  {FACILITY_TIERS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-green-300/80 block">Starter Rigs ({sbRigs})</span>
                <input
                  type="range"
                  min={0}
                  max={8}
                  value={sbRigs}
                  onChange={(e) => setSbRigs(Number(e.target.value))}
                  className="w-full accent-emerald-400"
                />
              </label>

              <label className="space-y-1">
                <span className="text-green-300/80 block">Operating Cost</span>
                <select
                  value={sbOpMult}
                  onChange={(e) => setSbOpMult(Number(e.target.value))}
                  className="w-full px-2 py-1.5 rounded bg-[#030D06] border border-green-500/30 font-mono text-green-100"
                >
                  <option value={0}>0.0x (Free Power/Rent)</option>
                  <option value={0.5}>0.5x (Discounted)</option>
                  <option value={1.0}>1.0x (Standard)</option>
                  <option value={1.5}>1.5x (Stress Test)</option>
                </select>
              </label>
            </div>

            <label className="space-y-1 block">
              <span className="text-green-300/80 block">Initial Market Regime</span>
              <select
                value={sbRegime}
                onChange={(e) => setSbRegime(e.target.value as MarketRegime)}
                className="w-full px-2 py-1.5 rounded bg-[#030D06] border border-green-500/30 font-mono text-green-100"
              >
                {(Object.keys(MARKET_REGIME_SPECS) as MarketRegime[]).map((r) => (
                  <option key={r} value={r}>
                    {MARKET_REGIME_SPECS[r].label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap gap-4 pt-1">
              <label className="inline-flex items-center gap-2 text-green-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sbUnlockResearch}
                  onChange={(e) => setSbUnlockResearch(e.target.checked)}
                  className="accent-emerald-400"
                />
                <span>Unlock All R&amp;D</span>
              </label>
              <label className="inline-flex items-center gap-2 text-green-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sbUnlockCoins}
                  onChange={(e) => setSbUnlockCoins(e.target.checked)}
                  className="accent-emerald-400"
                />
                <span>Unlock All 6 Coins</span>
              </label>
            </div>

            <button
              type="button"
              onClick={launchSandbox}
              className="w-full px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#020804] font-semibold text-xs transition-colors"
            >
              Launch Sandbox ({formatUsd(sbCash)} · {FACILITY_TIERS.find((f) => f.id === sbFacilityId)?.name})
            </button>
          </div>
        )}

        {/* Save Manager Drawer */}
        {panelView === 'SAVES' && (
          <div className="p-4 rounded-lg bg-[#020804] border border-green-500/30 space-y-3 text-xs">
            <div className="font-semibold text-green-300">Save File Management &amp; Backups</div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => triggerDownload(false)}
                className="px-3 py-2 rounded bg-[#051409] hover:bg-green-950 border border-green-500/30 text-green-200 inline-flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Career</span>
              </button>
              <button
                type="button"
                onClick={() => triggerDownload(true)}
                className="px-3 py-2 rounded bg-[#051409] hover:bg-green-950 border border-green-500/30 text-green-200 inline-flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Sandbox</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const ok = onBackupSave(false);
                  setSaveFeedback({
                    ok,
                    text: ok ? 'Saved local Career backup.' : 'No Career save to backup.',
                  });
                }}
                className="px-3 py-2 rounded bg-[#051409] hover:bg-green-950 border border-green-500/30 text-green-200 inline-flex items-center justify-center gap-1.5"
              >
                <FolderArchive className="w-3.5 h-3.5" />
                <span>Backup Career</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const ok = onRestoreBackup(false);
                  setSaveFeedback({
                    ok,
                    text: ok ? 'Restored Career backup.' : 'No Career backup stored yet.',
                  });
                }}
                className="px-3 py-2 rounded bg-[#051409] hover:bg-green-950 border border-green-500/30 text-green-200 inline-flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore Backup</span>
              </button>
            </div>

            <div className="space-y-1.5 pt-1 border-t border-green-500/20">
              <div className="flex items-center justify-between">
                <span className="text-green-300/80">Import Save JSON</span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-green-400 hover:text-green-200 underline inline-flex items-center gap-1"
                >
                  <Upload className="w-3 h-3" />
                  <span>Choose .json File</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
              <textarea
                rows={2}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Paste exported JSON save payload here..."
                className="w-full px-2.5 py-1.5 rounded bg-[#030D06] border border-green-500/25 font-mono text-[11px] text-green-100 placeholder:text-green-800 focus:outline-none focus:border-green-400"
              />
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const res = onImportSave(importText);
                    setSaveFeedback({
                      ok: res.ok,
                      text: res.ok ? res.summary ?? 'Imported!' : res.error ?? 'Invalid JSON.',
                    });
                  }}
                  className="px-3 py-1.5 rounded bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-200 font-semibold"
                >
                  Validate &amp; Load
                </button>

                {confirmResetTarget ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onResetSave(confirmResetTarget === 'SANDBOX');
                        setConfirmResetTarget(null);
                        setSaveFeedback({
                          ok: true,
                          text: `Cleared ${confirmResetTarget.toLowerCase()} save slot.`,
                        });
                      }}
                      className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold"
                    >
                      Confirm Wipe
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmResetTarget(null)}
                      className="px-2 py-1 rounded bg-[#051409] text-green-300"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    {hasSavedGame && (
                      <button
                        type="button"
                        onClick={() => setConfirmResetTarget('CAREER')}
                        className="px-2.5 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300"
                      >
                        Reset Career
                      </button>
                    )}
                    {hasSavedSandbox && (
                      <button
                        type="button"
                        onClick={() => setConfirmResetTarget('SANDBOX')}
                        className="px-2.5 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300"
                      >
                        Reset Sandbox
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {saveFeedback && (
              <div
                className={`px-2.5 py-1.5 rounded border text-[11px] font-mono ${
                  saveFeedback.ok
                    ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
                    : 'bg-rose-500/15 border-rose-500/35 text-rose-200 flex items-center gap-1.5'
                }`}
              >
                {!saveFeedback.ok && <ShieldAlert className="w-3.5 h-3.5 shrink-0" />}
                <span>{saveFeedback.text}</span>
              </div>
            )}
          </div>
        )}

        {/* New Career Run Configuration */}
        <div className="pt-4 border-t border-green-500/20 space-y-3.5">
          <div>
            <div className="text-xs font-medium text-green-300/80 mb-1.5">Starting Capital</div>
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

          <div>
            <label
              htmlFor="challenge-select"
              className="text-xs font-medium text-green-300/80 mb-1.5 flex items-center gap-1.5"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-300" />
              <span>Optional Challenge Scenario</span>
            </label>
            <select
              id="challenge-select"
              value={selectedChallenge}
              onChange={(e) => setSelectedChallenge(e.target.value as ChallengeId | '')}
              className="w-full px-2.5 py-2 rounded-lg bg-[#020704] border border-green-500/30 font-mono text-xs text-green-100 focus:outline-none focus:border-green-400"
            >
              <option value="">Open Career (No Challenge Constraint)</option>
              {CHALLENGES.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.title} (+{formatUsd(ch.rewardCash)} / +{ch.rewardRp} RP)
                </option>
              ))}
            </select>
            {selectedChallenge && (
              <p className="text-[11px] text-amber-200/85 mt-1 font-mono">
                Goal: {CHALLENGES.find((c) => c.id === selectedChallenge)?.description}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="run-seed-input"
              className="text-xs font-medium text-green-300/80 whitespace-nowrap shrink-0"
            >
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
