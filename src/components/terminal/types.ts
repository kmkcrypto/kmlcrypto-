import { GuidedSystemId } from '../../data/onboarding';
import { CreatePlayerCoinInput } from '../../engine/coins';
import { CustomBlueprintDesignInput } from '../../engine/simulation';
import {
  BusinessId,
  ChallengeId,
  ChipProcessNode,
  CoinSymbol,
  DesignProfile,
  EmployeeRole,
  FacilityUpgradeId,
  FirmwareProfile,
  GameState,
  GuidedPaceMode,
  InvestigationStage,
  MarketRegime,
  MiningAlgorithm,
  OnboardingMode,
  PartCategory,
  PendingEvent,
  PoolMode,
  PowerContractId,
  RaidApproachId,
  RepairComponentSlot,
  RigBuildConfig,
  RigQualification,
  RigQualificationGoal,
  RoomCoolingType,
  ShiftType,
  TaskPriority,
} from '../../types/game';

export interface LogLine {
  id: string;
  kind: 'CMD' | 'HEAD' | 'OK' | 'WARN' | 'ERR' | 'TEXT' | 'PRE';
  text: string;
}

export interface TerminalCommandTrigger {
  seq: number;
  command: string;
}

export interface StepBatchResult {
  stepsRun: number;
  newStepCount: number;
  miningCashEarned: number;
  rpEarned: number;
  billsSettledUsd: number;
  soloBlocksHit: number;
  haltedByEvent: PendingEvent | null;
  manualStepWaitSeconds?: number;
}

export interface TextGameTerminalProps {
  state: GameState;
  commandTrigger: TerminalCommandTrigger | null;
  onStepSteps: (steps: number) => StepBatchResult | null;
  onQualifyRig: (rigIndex: number, goal: RigQualificationGoal, reference: RigQualification['reference']) => { ok: boolean; summary: string };
  onResolveEvent: (choiceKey: string) => { ok: boolean; summary: string };
  onUnlockCoin: (symbol: CoinSymbol) => boolean;
  onCreatePlayerCoin: (
    input: CreatePlayerCoinInput
  ) => { ok: boolean; summary: string; symbol?: string };
  onDeployRig: (config: RigBuildConfig) => boolean;
  onSalvageRig: (rigId: string) => number;
  onRetireRig: (rigIndex: number) => { ok: boolean; summary: string };
  onDeployBackupRig: (backupIdx: number) => { ok: boolean; summary: string };
  onSellBackupRig: (backupIdx: number) => { ok: boolean; summary: string };
  onBuyUsedListing: (listingId: string, customName?: string) => { ok: boolean; summary: string };
  onRefreshUsedMarket: () => { ok: boolean; summary: string };
  onRenameRig: (rigId: string, name: string) => void;
  onToggleRig: (rigId: string) => void;
  onChangeRigCoin: (rigId: string, coin: CoinSymbol) => void;
  onChangeRigOverclock: (rigId: string, oc: number) => void;
  onOverclockRigs: (rigIndexOrAll: number | 'ALL', oc: number) => boolean;
  onTinkerPart: (
    rigIndex: number,
    slot: 'chassis' | 'compute' | 'storage' | 'psu' | 'cooling' | 'os',
    partId: string
  ) => { ok: boolean; summary: string };
  onTinkerGpu: (
    rigIndex: number,
    action: 'ADD' | 'REMOVE' | 'CLEAR',
    gpuIdOrSlotIdx?: string | number,
    qty?: number
  ) => { ok: boolean; summary: string };
  onSetRigPool: (rigIndexOrAll: number | 'ALL', pool: PoolMode) => boolean;
  onSetRigProfile: (rigIndexOrAll: number | 'ALL', profile: FirmwareProfile) => boolean;
  onRepairRigs: (rigIndexOrAll: number | 'ALL') => { ok: boolean; count: number; cost: number };
  onRepairComponent: (
    rigIndex: number,
    slot: RepairComponentSlot,
    gpuSlotIndex?: number
  ) => { ok: boolean; summary: string };
  onRepasteRigs: (rigIndexOrAll: number | 'ALL') => { ok: boolean; count: number; cost: number };
  onAddCoolingUnit: (type: RoomCoolingType, roomNumber?: number) => boolean;
  onToggleCoolingUnit: (coolingId: string) => void;
  onRemoveCoolingUnit: (coolingId: string) => void;
  onSelectFacility: (facilityId: string, action: 'RENT' | 'BUY') => boolean;
  onBuyFacilityUpgrade: (upgradeId: FacilityUpgradeId) => { ok: boolean; summary: string };
  onSelectPowerContract: (contractId: PowerContractId) => { ok: boolean; summary: string };
  onMoveRigToRoom: (rigIdxOrAll: number | 'ALL', roomNumber: number) => { ok: boolean; summary: string };
  onMoveCoolerToRoom: (unitIdx: number, roomNumber: number) => { ok: boolean; summary: string };
  onExpandFacilityRooms: () => { ok: boolean; summary: string };
  onHireEmployee: (role: EmployeeRole) => boolean;
  onTrainEmployee: (empIdx: number) => { ok: boolean; summary: string };
  onFireEmployee: (employeeId: string) => void;
  onUpdateEmployee: (employeeId: string, shift: ShiftType, priority: TaskPriority) => void;
  onBonusStaff: (empIdxOrAll: number | 'ALL') => { ok: boolean; summary: string };
  onNegotiateStrike: () => { ok: boolean; summary: string };
  onStartResearch: (nodeId: string) => boolean;
  onStartChallenge: (challengeId: ChallengeId) => { ok: boolean; summary: string };
  onLaunchCampaign: (templateId: string, targetCoin: CoinSymbol) => boolean;
  onAcceptContract: (contractId: string) => { ok: boolean; reason?: string };
  onAbandonContract: () => boolean;
  onToggleSiphon: (enable: boolean) => boolean;
  onRentBotnet: (coin: CoinSymbol) => { ok: boolean; reason?: string; cost?: number };
  onWashTrade: (coin: CoinSymbol) => { ok: boolean; reason?: string; cost?: number };
  onPumpDump: (coin: CoinSymbol) => { ok: boolean; reason?: string; cost?: number; summary?: string };
  onExtortRival: (
    rivalId: string
  ) => { ok: boolean; reason?: string; cost?: number; summary?: string };
  onSabotageRival: (rivalId: string) => { ok: boolean; reason?: string; cost?: number };
  onDevelopShellCoin: (
    ticker: string,
    name: string
  ) => { ok: boolean; reason?: string; cost?: number; summary?: string };
  onSeedShellCoinLiquidity: (
    ticker: string,
    addLiquidityUsd?: number,
    spoofAudit?: boolean
  ) => { ok: boolean; reason?: string; cost?: number; summary?: string };
  onLaunchShellCoin: (
    ticker: string,
    name: string
  ) => { ok: boolean; reason?: string; cost?: number; summary?: string };
  onShillShellCoin: (
    ticker: string
  ) => { ok: boolean; reason?: string; cost?: number; summary?: string };
  onRugShellCoin: (
    ticker: string
  ) => { ok: boolean; reason?: string; cost?: number; summary?: string };
  onPrepareVaultRaid: (
    rivalId: string
  ) => { ok: boolean; reason?: string; cost?: number; summary?: string };
  onExecutePreparedRaid: (
    approach?: RaidApproachId
  ) => { ok: boolean; reason?: string; summary?: string };
  onRaidRival: (
    rivalId: string
  ) => { ok: boolean; reason?: string; cost?: number; summary?: string };
  onComplyWithAudit: () => { ok: boolean; reason?: string; summary?: string };
  onPayComplianceSettlement: () => { ok: boolean; reason?: string; cost?: number; summary?: string };
  onInvestigateRival: (rivalIdx: number) => { ok: boolean; summary: string };
  onCloneRig: (rigIdx: number, qty: number) => { ok: boolean; summary: string };
  onLaunderHeat: () => { ok: boolean; reason?: string; cost?: number };
  onBribeInspectors: () => { ok: boolean; reason?: string; cost?: number };
  onBuyBlackMarket: (listingId: string, rigIdx?: number) => { ok: boolean; summary: string };
  onSetRigPayout: (rigIndexOrAll: number | 'ALL', payoutMode: 'AUTOSELL' | 'HOLD') => { ok: boolean; summary: string };
  onExchangeBuy: (coin: CoinSymbol, usdAmount: number) => { ok: boolean; summary: string };
  onExchangeSell: (coin: CoinSymbol, amountOrAll: number | 'ALL') => { ok: boolean; summary: string };
  onPlaceLimitOrder: (
    side: 'BUY' | 'SELL',
    coin: CoinSymbol,
    targetPriceUsd: number,
    amount: number
  ) => { ok: boolean; summary: string };
  onCancelLimitOrder: (orderIdx: number) => { ok: boolean; summary: string };
  onOpenShort: (coin: CoinSymbol, collateralUsd: number) => { ok: boolean; summary: string };
  onCloseShort: (posIdx: number) => { ok: boolean; summary: string };
  onBuildFabLine: () => { ok: boolean; summary: string };
  onDesignCustomChip: (
    name: string,
    algo: MiningAlgorithm,
    node: ChipProcessNode,
    profile?: DesignProfile
  ) => { ok: boolean; summary: string };
  onDesignCustomComponent: (input: CustomBlueprintDesignInput) => { ok: boolean; summary: string };
  onSaveDraftBlueprint: (input: CustomBlueprintDesignInput) => { ok: boolean; summary: string };
  onDeleteDraftBlueprint: (draftIdx: number) => { ok: boolean; summary: string };
  onTapeoutDraftBlueprint: (draftIdx: number) => { ok: boolean; summary: string };
  onReviseBlueprint: (
    bpIdx: number,
    updates: Partial<CustomBlueprintDesignInput> & { revisionNote?: string }
  ) => { ok: boolean; summary: string };
  onRunPrototypeTest: (bpIdx: number, forcedStatus?: 'PASSED' | 'MARGINAL' | 'FAILED_FLAW') => { ok: boolean; summary: string };
  onDevFinishFabBatch: (outcome: 'PASS' | 'SCRAP') => { ok: boolean; summary: string };
  onQueueFabProduction: (bpIdx: number, qty: number) => { ok: boolean; summary: string };
  onDeployCustomAsic: (
    invIdx: number,
    rigIdx: number,
    gpuSlotIdx?: number
  ) => { ok: boolean; summary: string };
  onSellCustomAsic: (invIdx: number, qtyOrAll: number | 'ALL') => { ok: boolean; summary: string };
  onStripCustomAsic: (
    rigIdx: number,
    slot?: PartCategory,
    gpuSlotIdx?: number
  ) => { ok: boolean; summary: string };
  onInspectAcquisitionTarget: (targetQuery: string) => { ok: boolean; summary: string };
  onAcquireTargetCompany: (targetQuery: string) => { ok: boolean; summary: string };
  onRefreshAcquisitionMarket: () => { ok: boolean; summary: string };
  onFundBusinessTurnaround: (businessQuery: string) => { ok: boolean; summary: string };
  onEstablishCorporateHQ: (companyName?: string) => { ok: boolean; summary: string };
  onUpgradeCorporateHQ: () => { ok: boolean; summary: string };
  onRenameCorporateHQ: (companyName: string) => { ok: boolean; summary: string };
  onToggleSynergyPolicy: (policyQuery: string) => { ok: boolean; summary: string };
  onUpgradeBusinessDivision: (businessQuery: string) => { ok: boolean; summary: string };
  onRunMarketForecastModel: () => { ok: boolean; summary: string };
  onUpgradePredictionModel: () => { ok: boolean; summary: string };
  onExpandIntelSubscriptions: (count?: number) => { ok: boolean; summary: string };
  onSellPredictionSoftwareLicenses: (packs?: number) => { ok: boolean; summary: string };
  onToggleIntelAdvisory: () => { ok: boolean; summary: string };
  onToggleCommercialPool: () => { ok: boolean; summary: string };
  onSetCommercialPoolFee: (feePct: number) => { ok: boolean; summary: string };
  onExpandHostingInfrastructure: (addKw?: number) => { ok: boolean; summary: string };
  onOnboardHostingClient: (count?: number) => { ok: boolean; summary: string };
  onDropHostingClient: (count?: number) => { ok: boolean; summary: string };
  onLeaseComputeCapacity: (units?: number) => { ok: boolean; summary: string };
  onPerformServicesSlaAudit: () => { ok: boolean; summary: string };
  onLicenseBlueprintExternally: (blueprintIdx: number) => { ok: boolean; summary: string };
  onCompleteExternalDesignContract: (specialty?: string) => { ok: boolean; summary: string };
  onRunCoolingPowerEngineeringTune: () => { ok: boolean; summary: string };
  onUpgradeHardwareEngLab: () => { ok: boolean; summary: string };
  onStartOemContract: (category?: string, qty?: number) => { ok: boolean; summary: string };
  onFulfillOemFromInventory: (invIdx: number) => { ok: boolean; summary: string };
  onFulfillInternalSupplyOrder: (target?: string) => { ok: boolean; summary: string };
  onRunManufacturingQcAudit: () => { ok: boolean; summary: string };
  onHardenShellSubsidiary: () => { ok: boolean; summary: string };
  onStartUndergroundContract: (kind?: string) => { ok: boolean; summary: string };
  onRunAuditFirewallSweep: () => { ok: boolean; summary: string };
  onContainParentSpillover: () => { ok: boolean; summary: string };
  onMarkBusinessTutorialSeen: (businessId: BusinessId) => void;
  onBackupSave: () => boolean;
  onRestoreBackup: () => boolean;
  onExportSave: () => string | null;
  onToggleDevMode: (enabled: boolean) => void;
  onOpenDevPanel: () => void;
  onToggleDevUnlockAll: () => void;
  onDevAddCash: (amount: number) => void;
  onDevAddRp: (amount: number) => void;
  onDevUnlockAllResearch: () => void;
  onDevOwnAllFacilities: () => void;
  onDevUnlockAllCoins: () => void;
  onDevResetRigTemps: () => void;
  onDevAdjustCoinPrice: (symbol: CoinSymbol, mult: number) => void;
  onDevTriggerEvent: (forceRaid?: boolean) => void;
  onDevSetRegime: (regime: MarketRegime) => void;
  onDevTriggerHalving: (symbol: CoinSymbol) => void;
  onDevSetHeat: (heat: number) => void;
  onDevSetInvestigationStage: (stage: InvestigationStage, scandalMarks?: number) => void;
  onDevGrantFabBatch: (partCategory?: PartCategory, qty?: number) => { ok: boolean; summary: string };
  onDevLaunchCustomCoin: (
    symbol?: string,
    name?: string,
    algorithm?: MiningAlgorithm
  ) => { ok: boolean; summary: string };
  onDevRefreshBlackMarket: () => void;
  onDevGrantAllBusinesses: () => void;
  onDevStabilizeAllDivisions: () => void;
  onSetTutorialStep: (step: number) => void;
  onMarkTutorialSeen: (guideId: string) => void;
  onFinishGuidedLesson: () => void;
  onSetOnboardingMode: (mode: OnboardingMode) => void;
  onCompleteGuidedTask: (taskIdOrNum: string) => { ok: boolean; summary: string };
  onPauseGuidedOnboarding: (paused: boolean) => void;
  onSetGuidedPace: (pace: GuidedPaceMode) => void;
  onDismissGuidedSystem: (sysId: string) => void;
  onRevisitGuidedTopic: (topicId: string) => void;
  onSetSimSpeed: (stepSeconds: number, stepHours?: number) => { ok: boolean; summary: string };
  onClaimObjectives: () => void;
  userPaused: boolean;
  autoPauseReason: string | null;
  autoCountdown: number;
  onSetUserPaused: (paused: boolean) => void;
  onActiveModalChange: (modal: 'BUILDER' | 'TINKER' | null) => void;
}

export interface TerminalCommandContext {
  state: GameState;
  props: TextGameTerminalProps;
  raw: string;
  parts: string[];
  cmd: string;
  arg1: string;
  arg2: string;
  arg3: string;
  arg4: string;
  append: (lines: Omit<LogLine, 'id'>[]) => void;
  maybeShowContextualGuide: (guideId: string) => void;
  checkSystemUnlocked: (sys: GuidedSystemId, actionLabel?: string) => boolean;
  openFabWizard: () => void;
  openCoinWizard: () => void;
  openRigWizard: () => void;
  openTinkerWizard: (
    rigIndex: number,
    initialSlot?: 'MENU' | 'chassis' | 'compute' | 'gpu' | 'storage' | 'psu' | 'cooling' | 'os'
  ) => void;
  unlockCoinCommand: (symRaw?: string) => void;
}

export type TerminalCommandHandler = (ctx: TerminalCommandContext) => boolean;

export function padRight(str: string, width: number): string {
  return str.length >= width ? str.slice(0, width) : str + ' '.repeat(width - str.length);
}

export function padLeft(str: string, width: number): string {
  return str.length >= width ? str.slice(0, width) : ' '.repeat(width - str.length) + str;
}
