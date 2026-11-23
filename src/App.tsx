import { MARKET_REGIME_SPECS } from './data/catalog';
import { getUnlockedSystems } from './data/onboarding';
import { BILLING_CYCLE_STEPS, getEffectiveFacilityPowerCapKw, getFacilityTotals } from './engine/simulation';
import { formatStepLabel, formatUsd } from './utils/format';
import { soundFx } from './utils/sound';
import { Binary, Pause, Play, SkipForward, Volume2, VolumeX, Wrench } from 'lucide-react';
import { useGameActions } from './hooks/useGameActions';
import { TitleMenu } from './components/TitleMenu';
import { EducationLanding } from './components/EducationLanding';
import { DevPanel } from './components/DevPanel';
import { TextGameTerminal } from './components/TextGameTerminal';
import { MatrixRainCanvas } from './components/MatrixRainCanvas';
import { SideTelemetryPanels } from './components/SideTelemetryPanels';

export default function App() {
  const actions = useGameActions();
  const {
    state,
    setState,
    careerSnapshot,
    sandboxSnapshot,
    bannerMsg,
    setBannerMsg,
    showEduLanding,
    setShowEduLanding,
    devPanelOpen,
    setDevPanelOpen,
    matrixRain,
    setMatrixRain,
    userPaused,
    setUserPaused,
    setActiveTerminalModal,
    autoCountdown,
    autoStepSeconds,
    autoPauseReason,
    commandTrigger,
    triggerTerminalCommand,
  } = actions;

  if (showEduLanding && (!state || state.mode === 'TITLE_MENU')) {
    return (
      <EducationLanding
        onOpenPortal={() => {
          soundFx.playClick();
          setShowEduLanding(false);
        }}
      />
    );
  }

  if (!state || state.mode === 'TITLE_MENU') {
    const careerSummary = careerSnapshot
      ? `${formatStepLabel(careerSnapshot.stepCount)} · ${formatUsd(careerSnapshot.cash, true)}`
      : undefined;
    const sandboxSummary = sandboxSnapshot
      ? `${formatStepLabel(sandboxSnapshot.stepCount)} · ${formatUsd(sandboxSnapshot.cash, true)}`
      : undefined;
    return (
      <TitleMenu
        hasSavedGame={Boolean(careerSnapshot)}
        savedSummary={careerSummary}
        hasSavedSandbox={Boolean(sandboxSnapshot)}
        sandboxSummary={sandboxSummary}
        onStartNew={actions.handleStartNew}
        onStartFromPreset={actions.handleStartFromPreset}
        onResume={() => actions.handleResume(false)}
        onResumeSandbox={() => actions.handleResume(true)}
        onExportSave={actions.handleExportSave}
        onImportSave={actions.handleImportSaveJson}
        onBackupSave={(sandbox) =>
          actions.handleBackupSave((sandbox ? sandboxSnapshot : careerSnapshot) ?? undefined)
        }
        onRestoreBackup={actions.handleRestoreBackup}
        onResetSave={actions.handleResetSave}
        onReturnToStudy={() => {
          soundFx.playClick();
          setShowEduLanding(true);
        }}
      />
    );
  }

  const totals = getFacilityTotals(state);
  const effectiveCap = getEffectiveFacilityPowerCapKw(state);
  const stepRev = state.rigs.reduce((s, r) => s + r.lastStepUsd, 0);
  const stepsUntilBill =
    BILLING_CYCLE_STEPS - (state.stepCount % BILLING_CYCLE_STEPS || BILLING_CYCLE_STEPS);
  const regimeSpec = MARKET_REGIME_SPECS[state.marketRegime];

  const unlockedSystems = getUnlockedSystems(state);
  const navCommands: { label: string; cmd: string }[] = [
    { label: 'Status', cmd: 'status' },
    { label: 'Rigs', cmd: 'rigs' },
    ...(state.onboardingMode === 'GUIDED' ? [{ label: 'Guide', cmd: 'guide' }] : []),
    { label: 'Objectives', cmd: 'objectives' },
    { label: 'Codex', cmd: 'codex' },
    { label: 'Used Market', cmd: 'usedmarket' },
    { label: 'Power', cmd: 'power' },
    { label: 'Market', cmd: 'market' },
    ...(unlockedSystems.fab ? [{ label: 'Foundry', cmd: 'fab' }] : []),
    ...(unlockedSystems.contracts ? [{ label: 'Contracts', cmd: 'contracts' }] : []),
    { label: 'Stats', cmd: 'stats' },
  ];

  return (
    <div className="relative min-h-screen bg-[#020603] text-green-50 flex flex-col overflow-x-hidden">
      <MatrixRainCanvas enabled={matrixRain} />

      <header className="relative z-10 border-b border-green-500/25 bg-[#030A05]/88 backdrop-blur-sm px-6 py-3.5">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => triggerTerminalCommand('status')}
            className="font-display text-lg font-bold tracking-tight text-green-300 matrix-glow whitespace-nowrap shrink-0"
          >
            HASHRATE{state.isSandbox ? ' [SANDBOX]' : ''}
          </button>

          <nav className="flex items-center gap-5 overflow-x-auto">
            {navCommands.map((item) => (
              <button
                key={item.cmd}
                type="button"
                onClick={() => triggerTerminalCommand(item.cmd)}
                className="text-sm font-medium pb-0.5 border-b-2 border-transparent text-green-200/80 hover:text-green-300 hover:border-green-400 transition-colors whitespace-nowrap shrink-0"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => {
              soundFx.playClick();
              setState((prev) => (prev ? { ...prev, mode: 'TITLE_MENU' } : prev));
            }}
            className="px-4 py-2 rounded-lg bg-[#051409] hover:bg-green-950 border border-green-500/35 text-xs font-semibold text-green-200 transition-colors whitespace-nowrap shrink-0"
          >
            Main Menu
          </button>
        </div>
      </header>

      <div className="relative z-10 border-b border-green-500/20 bg-[#020804]/85 backdrop-blur-sm px-6 py-2.5">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
            <div>
              <span className="text-green-400/70 mr-1.5">Step</span>
              <span className="font-mono tabular-nums font-semibold text-green-100">
                {state.stepCount}
              </span>
              <span className="text-green-700 mx-1.5">·</span>
              <span className="text-green-300/75 font-mono tabular-nums">
                Bill in {stepsUntilBill}st
              </span>
            </div>

            <div>
              <span className="text-green-400/70 mr-1.5">Cash</span>
              <span
                className={`font-mono tabular-nums font-semibold ${
                  state.cash < 0 ? 'text-rose-400' : 'text-green-400'
                }`}
              >
                {formatUsd(state.cash)}
              </span>
            </div>

            <div>
              <span className="text-green-400/70 mr-1.5">Step Rev</span>
              <span className="font-mono tabular-nums font-semibold text-lime-300">
                +{formatUsd(stepRev)}
              </span>
            </div>

            <div className="hidden md:block">
              <span className="text-green-400/70 mr-1.5">Cycle</span>
              <span className="font-mono text-green-200">{regimeSpec.label}</span>
            </div>

            <div className="hidden lg:block">
              <span className="text-green-400/70 mr-1.5">Power</span>
              <span
                className={`font-mono tabular-nums ${
                  totals.totalPowerKw > effectiveCap ? 'text-rose-400' : 'text-green-200'
                }`}
              >
                {totals.totalPowerKw.toFixed(2)}/{effectiveCap} kW
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#030D06] border border-green-500/25">
              <button
                type="button"
                onClick={() => triggerTerminalCommand('step 1')}
                className="px-3 py-1 rounded-md text-xs font-mono font-bold bg-green-500 hover:bg-green-400 text-[#020804] inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
              >
                <SkipForward className="w-3.5 h-3.5" />
                <span>+1 Step</span>
              </button>
              <button
                type="button"
                onClick={() => triggerTerminalCommand('step 5')}
                className="px-2.5 py-1 rounded-md text-xs font-mono font-medium text-green-300 hover:text-green-100 hover:bg-green-950/60 transition-colors whitespace-nowrap shrink-0"
              >
                +5
              </button>
              <button
                type="button"
                onClick={() => triggerTerminalCommand('step 10')}
                className="px-2.5 py-1 rounded-md text-xs font-mono font-medium text-green-300 hover:text-green-100 hover:bg-green-950/60 transition-colors whitespace-nowrap shrink-0"
              >
                +10
              </button>
              <button
                type="button"
                onClick={() => triggerTerminalCommand('step 30')}
                className="px-2.5 py-1 rounded-md text-xs font-mono font-medium text-green-300 hover:text-green-100 hover:bg-green-950/60 transition-colors whitespace-nowrap shrink-0"
              >
                +30
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                setUserPaused((p) => !p);
              }}
              title={
                autoPauseReason === null
                  ? `Pause automatic ${autoStepSeconds}s stepping`
                  : userPaused
                  ? `Resume automatic ${autoStepSeconds}s stepping`
                  : `Auto-stepping paused (${autoPauseReason})`
              }
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                autoPauseReason === null
                  ? 'bg-green-500/15 hover:bg-green-500/25 border-green-500/40 text-green-300'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/45 text-amber-200'
              }`}
            >
              {autoPauseReason === null ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Auto {autoCountdown}s</span>
                </>
              ) : userPaused ? (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Paused</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Paused: {autoPauseReason}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                setMatrixRain((v) => !v);
              }}
              title={matrixRain ? 'Disable Matrix Rain' : 'Enable Matrix Rain'}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                matrixRain
                  ? 'bg-green-500/15 hover:bg-green-500/25 border-green-500/40 text-green-300'
                  : 'bg-[#030D06] hover:bg-green-950 border-green-500/20 text-green-600'
              }`}
            >
              <Binary className="w-3.5 h-3.5" />
              <span>Rain</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setState((p) => (p ? { ...p, soundEnabled: !p.soundEnabled } : p))
              }
              title={state.soundEnabled ? 'Mute Audio' : 'Enable Audio'}
              className="p-2 rounded-lg bg-[#030D06] hover:bg-green-950 border border-green-500/25 text-green-300 transition-colors"
            >
              {state.soundEnabled ? (
                <Volume2 className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-green-700" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (!state.devMode) {
                  actions.handleToggleDevMode(true);
                } else {
                  soundFx.playClick();
                  setDevPanelOpen(true);
                }
              }}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                state.devMode
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/50 text-amber-300'
                  : 'bg-[#030D06] hover:bg-green-950 border-green-500/25 text-green-200'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>{state.devMode ? 'Dev Tools' : 'Dev Mode'}</span>
            </button>
          </div>
        </div>
      </div>

      <main className="relative z-10 flex-1 px-6 py-4">
        <div className="max-w-[1440px] mx-auto space-y-3">
          {bannerMsg && (
            <div className="px-4 py-2 rounded-lg bg-green-500/15 border border-green-500/40 text-xs font-mono text-green-200 flex items-center justify-between backdrop-blur-sm">
              <span>{bannerMsg}</span>
              <button
                type="button"
                onClick={() => setBannerMsg(null)}
                className="text-green-300 hover:text-white ml-4"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-4 items-stretch">
            <div className="flex-1 min-w-0">
              <TextGameTerminal
                state={state}
                commandTrigger={commandTrigger}
                onStepSteps={actions.handleStepSteps}
                onResolveEvent={actions.handleResolveEvent}
                onUnlockCoin={actions.handleUnlockCoin}
                onCreatePlayerCoin={actions.handleCreatePlayerCoin}
                onDeployRig={actions.handleDeployRig}
                onSalvageRig={actions.handleSalvageRig}
                onRetireRig={actions.handleRetireRig}
                onDeployBackupRig={actions.handleDeployBackupRig}
                onSellBackupRig={actions.handleSellBackupRig}
                onBuyUsedListing={actions.handleBuyUsedListing}
                onRefreshUsedMarket={actions.handleRefreshUsedMarket}
                onRenameRig={actions.handleRenameRig}
                onToggleRig={actions.handleToggleRig}
                onChangeRigCoin={actions.handleChangeRigCoin}
                onChangeRigOverclock={actions.handleChangeRigOverclock}
                onOverclockRigs={actions.handleOverclockRigs}
                onTinkerPart={actions.handleTinkerPart}
                onTinkerGpu={actions.handleTinkerGpu}
                onSetRigPool={actions.handleSetRigPool}
                onSetRigProfile={actions.handleSetRigProfile}
                onRepairRigs={actions.handleRepairRigs}
                onRepairComponent={actions.handleRepairComponent}
                onRepasteRigs={actions.handleRepasteRigs}
                onAddCoolingUnit={actions.handleAddCoolingUnit}
                onToggleCoolingUnit={actions.handleToggleCoolingUnit}
                onRemoveCoolingUnit={actions.handleRemoveCoolingUnit}
                onSelectFacility={actions.handleSelectFacility}
                onBuyFacilityUpgrade={actions.handleBuyFacilityUpgrade}
                onSelectPowerContract={actions.handleSelectPowerContract}
                onMoveRigToRoom={actions.handleMoveRigToRoom}
                onMoveCoolerToRoom={actions.handleMoveCoolerToRoom}
                onExpandFacilityRooms={actions.handleExpandFacilityRooms}
                onHireEmployee={actions.handleHireEmployee}
                onTrainEmployee={actions.handleTrainEmployee}
                onFireEmployee={actions.handleFireEmployee}
                onUpdateEmployee={actions.handleUpdateEmployee}
                onBonusStaff={actions.handleGiveStaffBonus}
                onNegotiateStrike={actions.handleNegotiateStrike}
                onStartResearch={actions.handleStartResearch}
                onStartChallenge={actions.handleStartChallenge}
                onLaunchCampaign={actions.handleLaunchCampaign}
                onAcceptContract={actions.handleAcceptContract}
                onAbandonContract={actions.handleAbandonContract}
                onToggleSiphon={actions.handleToggleSiphon}
                onRentBotnet={actions.handleRentBotnet}
                onWashTrade={actions.handleWashTrade}
                onPumpDump={actions.handlePumpDump}
                onExtortRival={actions.handleExtortRival}
                onSabotageRival={actions.handleSabotageRival}
                onDevelopShellCoin={actions.handleDevelopShellCoin}
                onSeedShellCoinLiquidity={actions.handleSeedShellCoinLiquidity}
                onLaunchShellCoin={actions.handleLaunchShellCoin}
                onShillShellCoin={actions.handleShillShellCoin}
                onRugShellCoin={actions.handleRugShellCoin}
                onPrepareVaultRaid={actions.handlePrepareVaultRaid}
                onExecutePreparedRaid={actions.handleExecutePreparedRaid}
                onRaidRival={actions.handleRaidRival}
                onComplyWithAudit={actions.handleComplyWithAudit}
                onPayComplianceSettlement={actions.handlePayComplianceSettlement}
                onInvestigateRival={actions.handleInvestigateRival}
                onCloneRig={actions.handleCloneRig}
                onLaunderHeat={actions.handleLaunderHeat}
                onBribeInspectors={actions.handleBribeInspectors}
                onBuyBlackMarket={actions.handleBuyBlackMarket}
                onSetRigPayout={actions.handleSetRigPayout}
                onExchangeBuy={actions.handleExchangeBuy}
                onExchangeSell={actions.handleExchangeSell}
                onPlaceLimitOrder={actions.handlePlaceLimitOrder}
                onCancelLimitOrder={actions.handleCancelLimitOrder}
                onOpenShort={actions.handleOpenShort}
                onCloseShort={actions.handleCloseShort}
                onBuildFabLine={actions.handleBuildFabLine}
                onDesignCustomChip={actions.handleDesignCustomChip}
                onDesignCustomComponent={actions.handleDesignCustomComponent}
                onSaveDraftBlueprint={actions.handleSaveDraftBlueprint}
                onDeleteDraftBlueprint={actions.handleDeleteDraftBlueprint}
                onTapeoutDraftBlueprint={actions.handleTapeoutDraftBlueprint}
                onReviseBlueprint={actions.handleReviseBlueprint}
                onRunPrototypeTest={actions.handleRunPrototypeTest}
                onQueueFabProduction={actions.handleQueueFabProduction}
                onDeployCustomAsic={actions.handleDeployCustomAsic}
                onSellCustomAsic={actions.handleSellCustomAsic}
                onStripCustomAsic={actions.handleStripCustomAsic}
                onBackupSave={() => actions.handleBackupSave()}
                onRestoreBackup={() => actions.handleRestoreBackup(Boolean(state.isSandbox))}
                onExportSave={() => actions.handleExportSave(Boolean(state.isSandbox))}
                onToggleDevMode={actions.handleToggleDevMode}
                onOpenDevPanel={() => setDevPanelOpen(true)}
                onToggleDevUnlockAll={actions.handleToggleDevUnlockAll}
                onDevAddCash={actions.handleDevAddCash}
                onDevAddRp={actions.handleDevAddRp}
                onDevUnlockAllResearch={actions.handleDevUnlockAllResearch}
                onDevOwnAllFacilities={actions.handleDevOwnAllFacilities}
                onDevUnlockAllCoins={actions.handleDevUnlockAllCoins}
                onDevResetRigTemps={actions.handleDevResetRigTemps}
                onDevAdjustCoinPrice={actions.handleDevAdjustCoinPrice}
                onDevTriggerEvent={actions.handleDevTriggerEvent}
                onDevSetRegime={actions.handleDevSetRegime}
                onDevTriggerHalving={actions.handleDevTriggerHalving}
                onDevSetHeat={actions.handleDevSetHeat}
                onDevSetInvestigationStage={actions.handleDevSetInvestigationStage}
                onDevGrantFabBatch={actions.handleDevGrantFabBatch}
                onDevLaunchCustomCoin={actions.handleDevLaunchCustomCoin}
                onDevRefreshBlackMarket={actions.handleDevRefreshBlackMarket}
                onSetTutorialStep={actions.handleSetTutorialStep}
                onMarkTutorialSeen={actions.handleMarkTutorialSeen}
                onSetOnboardingMode={actions.handleSetOnboardingMode}
                onCompleteGuidedTask={actions.handleCompleteGuidedTask}
                onPauseGuidedOnboarding={actions.handlePauseGuidedOnboarding}
                onSetGuidedPace={actions.handleSetGuidedPace}
                onDismissGuidedSystem={actions.handleDismissGuidedSystem}
                onRevisitGuidedTopic={actions.handleRevisitGuidedTopic}
                onSetSimSpeed={actions.handleSetSimSpeed}
                onClaimObjectives={actions.handleClaimObjectives}
                userPaused={userPaused}
                autoPauseReason={autoPauseReason}
                autoCountdown={autoCountdown}
                onSetUserPaused={setUserPaused}
                onActiveModalChange={setActiveTerminalModal}
              />
            </div>

            <SideTelemetryPanels state={state} onRunCommand={triggerTerminalCommand} />
          </div>
        </div>
      </main>

      {devPanelOpen && state.devMode && (
        <DevPanel
          state={state}
          onClose={() => setDevPanelOpen(false)}
          onToggleDevMode={actions.handleToggleDevMode}
          onToggleDevUnlockAll={actions.handleToggleDevUnlockAll}
          onDevLoadScenario={actions.handleDevLoadScenario}
          onAddCash={actions.handleDevAddCash}
          onClearDebt={actions.handleDevClearDebt}
          onAddRp={actions.handleDevAddRp}
          onStepSteps={(n) => actions.handleStepSteps(n)}
          onUnlockAllResearch={actions.handleDevUnlockAllResearch}
          onOwnAllFacilities={actions.handleDevOwnAllFacilities}
          onResetRigTemps={actions.handleDevResetRigTemps}
          onUnlockAllCoins={actions.handleDevUnlockAllCoins}
          onAdjustCoinPrice={actions.handleDevAdjustCoinPrice}
          onMaxPR={actions.handleDevMaxPR}
          onResetPRCooldowns={actions.handleDevResetPRCooldowns}
          onDevTriggerEvent={actions.handleDevTriggerEvent}
          onDevSetRegime={actions.handleDevSetRegime}
          onDevTriggerHalving={actions.handleDevTriggerHalving}
          onDevSetHeat={actions.handleDevSetHeat}
          onDevSetInvestigationStage={actions.handleDevSetInvestigationStage}
          onDevGrantFabBatch={actions.handleDevGrantFabBatch}
          onDevLaunchCustomCoin={actions.handleDevLaunchCustomCoin}
          onDevRefreshBlackMarket={actions.handleDevRefreshBlackMarket}
        />
      )}
    </div>
  );
}
