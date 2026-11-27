export type GameModeState = 'TITLE_MENU' | 'PLAYING';

export type DifficultyLevel = 'BOOTSTRAP' | 'STANDARD' | 'TYCOON_SANDBOX' | 'SANDBOX';

export type TechEra = 'CPU' | 'GPU' | 'FPGA' | 'ASIC' | 'AI' | 'QUANTUM';

export type TechBranch = 'SILICON' | 'QUANTUM' | 'PHOTONIC';

export type HardwareGen = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Developer testing scenarios launch temporary sessions at known progression stages. */
export type DevScenarioId =
  | 'GUIDED_ONBOARDING'
  | 'MIDGAME'
  | 'INDUSTRIAL'
  | 'GEN5'
  | 'GEN6'
  | 'GEN7'
  | 'MANUFACTURING'
  | 'MULTIPLAYER'
  | 'QUANTUM_PHOTONIC'
  | 'CONGLOMERATE_GEN6'
  | 'UNDERGROUND_CRISIS'
  | 'CUSTOM_COIN_EMPIRE'
  | 'CUSTOM';

export type HardwareConditionTier = 'NEW' | 'REFURBISHED' | 'USED' | 'DAMAGED';

export type CoreCoinSymbol = 'BTC' | 'LTC' | 'DOGE' | 'XMR' | 'ETH' | 'XCH' | 'RVN' | 'ZEC' | 'QBC';

export type CoinSymbol = string;

export type MiningAlgorithm =
  | 'SHA256'
  | 'SCRYPT'
  | 'RANDOMX'
  | 'ETHASH'
  | 'POST'
  | 'KAWPOW'
  | 'EQUIHASH'
  | 'QHASH';

export type MarketRegime =
  | 'ACCUMULATION'
  | 'BULL_RUN'
  | 'MANIA_PEAK'
  | 'CORRECTION'
  | 'CRYPTO_WINTER';

export type PoolMode = 'PPS' | 'PPLNS' | 'SOLO';

export type FirmwareProfile = 'ECO' | 'BALANCED' | 'TURBO';

export type IllicitModId = 'DARK_VOLT_BIOS' | 'SPOOFED_FIRMWARE' | 'SHUNT_BYPASS';

export type EmpireAlignment = 'INSTITUTIONAL' | 'GREY_MARKET' | 'SYNDICATE_OUTLAW';

export type PartCategory =
  | 'chassis'
  | 'compute'
  | 'gpu'
  | 'storage'
  | 'psu'
  | 'cooling'
  | 'os';

export interface ChassisPart {
  id: string;
  name: string;
  category: 'chassis';
  era: TechEra;
  branch?: TechBranch;
  generation?: HardwareGen;
  researchRequired?: string;
  cost: number;
  maxGpus: number;
  maxStorage: number;
  isAsicRack: boolean;
  maxAsics: number;
  supportsHybridAsicGpu?: boolean;
  allowedBranches?: TechBranch[];
  isCryoRated?: boolean;
  isOpticalBackplane?: boolean;
  baseWatts: number;
  coolingBonus: number;
  noiseModifier: number;
  description: string;
}

export interface ComputePart {
  id: string;
  name: string;
  category: 'compute';
  kind: 'CPU' | 'FPGA' | 'ASIC';
  era: TechEra;
  branch?: TechBranch;
  generation?: HardwareGen;
  researchRequired?: string;
  cost: number;
  watts: number;
  heatC: number;
  noiseDba: number;
  requiresCryoCooling?: boolean;
  requiresOpticalChassis?: boolean;
  hashrates: Partial<Record<MiningAlgorithm, number>>;
  description: string;
}

export interface GpuPart {
  id: string;
  name: string;
  category: 'gpu';
  era: TechEra;
  branch?: TechBranch;
  generation?: HardwareGen;
  researchRequired?: string;
  cost: number;
  vramGb?: number;
  watts: number;
  heatC: number;
  noiseDba: number;
  requiresCryoCooling?: boolean;
  requiresOpticalChassis?: boolean;
  hashrates: Partial<Record<MiningAlgorithm, number>>;
  description: string;
}

export interface StoragePart {
  id: string;
  name: string;
  category: 'storage';
  era: TechEra;
  branch?: TechBranch;
  generation?: HardwareGen;
  researchRequired?: string;
  cost: number;
  ramGb: number;
  storageTb: number;
  watts: number;
  heatC: number;
  efficiencyBonus: number;
  description: string;
}

export interface PsuPart {
  id: string;
  name: string;
  category: 'psu';
  era: TechEra;
  branch?: TechBranch;
  generation?: HardwareGen;
  researchRequired?: string;
  cost: number;
  maxWatts: number;
  efficiency: number;
  noiseDba: number;
  description: string;
}

export interface CoolingPart {
  id: string;
  name: string;
  category: 'cooling';
  era: TechEra;
  branch?: TechBranch;
  generation?: HardwareGen;
  researchRequired?: string;
  cost: number;
  coolingPowerC: number;
  isCryoRated?: boolean;
  isImmersion?: boolean;
  watts: number;
  noiseDba: number;
  description: string;
}

export interface OsPart {
  id: string;
  name: string;
  category: 'os';
  era: TechEra;
  branch?: TechBranch;
  generation?: HardwareGen;
  researchRequired?: string;
  cost: number;
  hashrateMultiplier: number;
  powerMultiplier: number;
  stabilityBonus: number;
  description: string;
}

export interface RigBuildConfig {
  name: string;
  chassisId: string;
  computeId: string;
  gpuIds: string[];
  storageId: string;
  psuId: string;
  coolingId: string;
  osId: string;
  targetCoin: CoinSymbol;
  overclockPct: number;
  poolMode?: PoolMode;
  firmwareProfile?: FirmwareProfile;
  payoutMode?: 'AUTOSELL' | 'HOLD';
  roomId?: string;
  customParts?: RigCustomPartsMap;
  customPartSerials?: RigCustomPartSerialsMap;
}

export interface RigCustomPartSerialsMap {
  chassis?: string;
  compute?: string;
  gpus?: (string | null)[];
  storage?: string;
  psu?: string;
  cooling?: string;
  os?: string;
}

export type RepairComponentSlot =
  | 'chassis'
  | 'compute'
  | 'gpu'
  | 'storage'
  | 'psu'
  | 'cooling';

export interface RigComponentHealth {
  chassis: number;
  compute: number;
  gpus: number[];
  storage: number;
  psu: number;
  cooling: number;
}

export interface MiningRig extends RigBuildConfig {
  id: string;
  enabled: boolean;
  gridX: number;
  gridY: number;
  roomId?: string;
  temperatureC: number;
  healthPct: number;
  componentHealth?: RigComponentHealth;
  conditionTier: HardwareConditionTier;
  ageSteps: number;
  failureCount: number;
  isUsedPurchase?: boolean;
  purchasePriceUsd?: number;
  status:
    | 'MINING'
    | 'THROTTLED'
    | 'OVERHEATED'
    | 'UNDERPOWERED'
    | 'PAUSED'
    | 'COIN_LOCKED'
    | 'NEEDS_REPAIR'
    | 'FAILED';
  poolMode: PoolMode;
  firmwareProfile: FirmwareProfile;
  pasteStepsRemaining: number;
  soloBlocksWon: number;
  lastStepBlockHit: boolean;
  illicitMod: IllicitModId | null;
  payoutMode?: 'AUTOSELL' | 'HOLD';
  customAsicSpec?: CustomAsicSpec;
  customParts?: RigCustomPartsMap;
  lastStepCoins: number;
  lastStepUsd: number;
  totalMinedCoins: number;
  totalEarnedUsd: number;
  createdStep: number;
}

export type RoomCoolingType =
  | 'cool_unit_fan'
  | 'cool_unit_ind_fan'
  | 'cool_unit_ac'
  | 'cool_unit_liquid'
  | 'cool_unit_chiller'
  | 'cool_unit_facility_hvac';

export interface RoomCoolingSpec {
  id: RoomCoolingType;
  name: string;
  cost: number;
  watts: number;
  noiseDba: number;
  coolingRadiusTiles: number;
  coolingPowerC: number;
  maintenancePerCycle: number;
  maxRigsSupported: number;
  unlockFacilityIndex: number;
  researchRequired?: string;
  description: string;
}

export interface PlacedCoolingUnit {
  id: string;
  type: RoomCoolingType;
  gridX: number;
  gridY: number;
  roomId?: string;
  enabled: boolean;
}

export type RoomZoneType =
  | 'RESIDENTIAL'
  | 'WORKSHOP'
  | 'HOT_AISLE'
  | 'COLD_AISLE'
  | 'INDUSTRIAL_BAY'
  | 'CLEANROOM';

export interface FacilityRoom {
  id: string;
  index: number;
  name: string;
  zoneType: RoomZoneType;
  slotCapacity: number;
  ambientTempDeltaC: number;
  airflowFactor: number;
  noiseBaffleDba: number;
  isExpansion?: boolean;
}

export type FacilityUpgradeId =
  | 'additional_circuits'
  | 'ventilation_ducts'
  | 'industrial_cooling_loop'
  | 'bay_expansion'
  | 'power_distribution'
  | 'backup_power';

export interface FacilityUpgradeSpec {
  id: FacilityUpgradeId;
  name: string;
  maxLevel: number;
  baseCost: number;
  costScale: number;
  cycleUpkeepPerLevel: number;
  unlockFacilityIndex: number;
  researchRequired?: string;
  effectLabel: string;
  description: string;
}

export type PowerContractId =
  | 'contract_budget'
  | 'contract_standard'
  | 'contract_highcap'
  | 'contract_premium_flex';

export interface PowerContractSpec {
  id: PowerContractId;
  name: string;
  rateMultiplier: number;
  capacityMultiplier: number;
  cycleFixedFee: number;
  brownoutProtectionPct: number;
  unlockFacilityIndex: number;
  summary: string;
}

export interface FacilityTier {
  id: string;
  name: string;
  subtitle: string;
  eraLabel: string;
  gridSize: number;
  cycleRent: number;
  buyoutPrice: number;
  powerRatePerKwh: number;
  maxRigs: number;
  maxPowerKw: number;
  noiseLimitDba: number;
  ambientTempC: number;
  coolingBonusC: number;
  maintenanceCostPerCycle: number;
  description: string;
}

export interface CustomCoinCreatorMeta {
  createdStep: number;
  initialLiquidityUsd: number;
  creatorFeePct: number;
  adoptionScore: number;
  trustScore: number;
  difficultyBias: number;
  totalSupplyMinted: number;
}

export interface CoinMarketState {
  symbol: CoinSymbol;
  name: string;
  algorithm: MiningAlgorithm;
  tier: number;
  unlockCostUsd: number;
  unlocked: boolean;
  basePriceUsd: number;
  priceUsd: number;
  prevPriceUsd: number;
  priceHistory: { step: number; stepLabel: string; price: number }[];
  baselineHash: number;
  baseStepCoins: number;
  hashExponent: number;
  sentiment: number;
  networkDifficulty: number;
  halvingEverySteps: number;
  stepsUntilHalving: number;
  halvingCount: number;
  blockRewardScale: number;
  totalMined: number;
  totalEarnedUsd: number;
  payoutNote: string;
  color: string;
  /** Coin-specific hardware constraints & mechanics */
  minVramGb?: number;
  minRamGb?: number;
  preferredBranch?: TechBranch;
  volatilityMult?: number;
  isPlayerCreated?: boolean;
  creatorMeta?: CustomCoinCreatorMeta;
}

export type EmployeeRole =
  | 'TECHNICIAN'
  | 'ELECTRICIAN'
  | 'MANAGER'
  | 'SYS_ENGINEER'
  | 'RESEARCHER'
  | 'PR_STRATEGIST'
  | 'ANALYST';

export type ShiftType = 'DAY' | 'NIGHT' | 'ROTATION_24_7';

export type TaskPriority =
  | 'THERMAL_SAFETY'
  | 'HARDWARE_CARE'
  | 'HASHRATE_TUNING'
  | 'RESEARCH_OUTPUT';

export interface EmployeeSpec {
  role: EmployeeRole;
  title: string;
  cycleSalary: number;
  hireCost: number;
  unlockFacilityIndex: number;
  summary: string;
}

export interface HiredEmployee {
  id: string;
  name: string;
  role: EmployeeRole;
  shift: ShiftType;
  priority: TaskPriority;
  morale: number;
  skillLevel: number;
  experienceXp: number;
  hiredStep: number;
}

export type ResearchCategory =
  | 'HARDWARE'
  | 'COOLING'
  | 'ELECTRICAL'
  | 'AUTOMATION'
  | 'BUSINESS';

export interface ResearchNode {
  id: string;
  name: string;
  era: TechEra;
  costRp: number;
  costCash: number;
  prereqIds: string[];
  effectSummary: string;
  category: ResearchCategory;
}

export interface PRCampaignTemplate {
  id: string;
  name: string;
  direction: 'HYPE' | 'FUD';
  cost: number;
  durationSteps: number;
  cooldownSteps: number;
  sentimentDelta: number;
  priceImpactPct: number;
  scrutinyRisk: number;
  minCredibility: number;
  description: string;
}

export interface ActivePRCampaign {
  id: string;
  templateId: string;
  name: string;
  targetCoin: CoinSymbol;
  direction: 'HYPE' | 'FUD';
  stepsRemaining: number;
  totalSteps: number;
  stepPriceImpulse: number;
  sentimentDeltaPerStep: number;
}

export type RivalStrategy =
  | 'CHEAP_POWER'
  | 'EFFICIENT_HARDWARE'
  | 'RAPID_EXPANSION'
  | 'ADVANCED_TECH'
  | 'LOW_OVERHEAD';

export type RivalProject = {
  kind: 'EXPAND' | 'ADD_RACKS' | 'REFIT' | 'SWITCH_COIN' | 'LOCK_POWER';
  completesAt: number;
  costUsd: number;
  targetCoin?: CoinSymbol;
  followsPlayer?: boolean;
};

export interface RivalSyndicate {
  id: string;
  name: string;
  archetype: 'HYDRO_GIANT' | 'SILICON_CARTEL' | 'DARKNET_POOL';
  strategy: RivalStrategy;
  specialtyCoin: CoinSymbol;
  secondaryCoin?: CoinSymbol;
  hashPowerIndex: number;
  cashReserveUsd: number;
  facilityTierIndex: number;
  hardwareQuality: number;
  rigCount: number;
  powerCapacityKw: number;
  baseGrowthRate: number;
  marketSharePct: number;
  aggressiveness: number;
  hostility: number;
  disruptedSteps: number;
  lastActionSummary: string;
  intelRevealedUntilStep?: number;
  project?: RivalProject;
  powerDealUntilStep?: number;
  decisions?: { step: number; summary: string }[];
}

export type ContractType =
  | 'COIN_REVENUE'
  | 'POOL_HASH'
  | 'LOW_NOISE_RUN'
  | 'EQUIPMENT_SUPPLY'
  | 'FACILITY_EXPANSION'
  | 'MAINTENANCE_SLA'
  | 'RESEARCH_PARTNERSHIP'
  | 'OPERATIONAL_PERFORMANCE'
  | 'UPTIME_STREAK'
  | 'EFFICIENCY_CAP';

export interface ContractSpec {
  id: string;
  title: string;
  clientName: string;
  type: ContractType;
  targetCoin?: CoinSymbol;
  targetAmount: number;
  targetConditionPct?: number;
  targetFacilityIndex?: number;
  targetFleetSize?: number;
  targetNoiseDba?: number;
  minReputation: number;
  progress: number;
  durationSteps: number;
  stepsRemaining: number;
  rewardCash: number;
  rewardRp: number;
  penaltyCredibility: number;
  penaltyCash: number;
  description: string;
}

export interface UsedMarketListing {
  id: string;
  title: string;
  conditionTier: HardwareConditionTier;
  conditionPct: number;
  ageSteps: number;
  generation: HardwareGen;
  listPriceUsd: number;
  retailPriceUsd: number;
  config: Omit<RigBuildConfig, 'name'>;
  componentHealth?: RigComponentHealth;
  summary: string;
}

export type MarketModifierType =
  | 'HARDWARE_SHORTAGE'
  | 'HARDWARE_CRASH'
  | 'POWER_SPIKE'
  | 'POWER_REBATE'
  | 'MINING_BOOM'
  | 'MINING_CRASH'
  | 'HIGH_COMPETITION'
  | 'HARDWARE_RELEASE'
  | 'EQUIPMENT_DEMAND';

export interface ActiveMarketModifier {
  id: string;
  type: MarketModifierType;
  label: string;
  stepsRemaining: number;
  hardwarePriceMult: number;
  powerRateMult: number;
  resaleValueMult: number;
  rivalGrowthMult: number;
  coinPriceDriftDelta: number;
  summary: string;
}

export interface BlackMarketListing {
  id: string;
  kind: 'ILLICIT_MOD' | 'SMUGGLED_RIG';
  title: string;
  description: string;
  costUsd: number;
  heatGain: number;
  modId?: IllicitModId;
  presetConfig?: Omit<RigBuildConfig, 'name'>;
  discountPct?: number;
  defectRiskPct?: number;
}

export type InvestigationStage =
  | 'NONE'
  | 'WATCHLIST'
  | 'FORMAL_AUDIT'
  | 'SANCTIONED'
  | 'PROBATION';

export type RaidApproachId = 'STEALTH_SIPHON' | 'ZERO_DAY_BREACH' | 'INSIDER_BRIBE';

export interface PreparedRaidPlan {
  id: string;
  targetRivalId: string;
  targetName: string;
  preparedStep: number;
  defenseRating: number;
  intelConfidencePct: number;
  estimatedLootMinUsd: number;
  estimatedLootMaxUsd: number;
  detectionRiskPct: number;
  recommendedApproach: RaidApproachId;
}

export interface UndergroundOpRecord {
  id: string;
  step: number;
  stepLabel: string;
  opType:
    | 'SIPHON'
    | 'BOTNET'
    | 'WASH'
    | 'PUMP'
    | 'EXTORT'
    | 'SABOTAGE'
    | 'RAID_PREP'
    | 'RAID_EXEC'
    | 'SHELL_DEV'
    | 'SHELL_LAUNCH'
    | 'SHELL_SHILL'
    | 'SHELL_RUG'
    | 'LAUNDER'
    | 'BRIBE'
    | 'COMPLY'
    | 'SETTLE'
    | 'INVESTIGATION';
  summary: string;
  outcome: 'SUCCESS' | 'TRACED' | 'FAILED' | 'PENALTY' | 'RECOVERY';
  cashDeltaUsd: number;
  heatDelta: number;
  repDelta: number;
}

export interface UndergroundState {
  powerSiphonActive: boolean;
  botnetCoin: CoinSymbol | null;
  botnetBonusHash: number;
  botnetStepsRemaining: number;
  washCooldownStep: number;
  /** Step when the protection-racket extortion action becomes available again. */
  extortCooldownStep?: number;
  launderCooldownStep: number;
  bribeProtectionSteps: number;
  blackMarketListings: BlackMarketListing[];
  blackMarketRefreshStep: number;
  /** Player-issued scam tokens ("ops coin"). Purely local, not part of the real market. */
  shellCoins?: ShellCoinState[];
  /** Step when the next vault raid becomes available. */
  raidCooldownStep?: number;
  /** Hijacked rival hashrate credited each step after a successful raid. */
  raidBonusHash?: number;
  raidStepsRemaining?: number;
  raidCoin?: CoinSymbol;
  raidSourceName?: string;
  /** Expanded underground investigation, intel, and records */
  suspiciousActivityScore?: number;
  investigationStage?: InvestigationStage;
  investigationStepsRemaining?: number;
  scandalMarks?: number;
  marketConfidencePenaltyPct?: number;
  retaliationRiskPct?: number;
  preparedRaid?: PreparedRaidPlan | null;
  operationRecords?: UndergroundOpRecord[];
}

export type ShellCoinLifecycleStage =
  | 'CONCEPT'
  | 'SEEDED'
  | 'ACTIVE'
  | 'RUGGED'
  | 'COLLAPSED';

/**
 * A shell coin the player launched to pump and dump. It lives outside the
 * regular coin market: price and liquidity are driven by manufactured hype.
 */
export interface ShellCoinState {
  ticker: string;
  name: string;
  launchedStep: number;
  stage?: ShellCoinLifecycleStage;
  auditSpoofed?: boolean;
  priceUsd: number;
  /** Manufactured interest (0-100). Decays every step unless re-shilled. */
  hype: number;
  /** Cash sitting in the token's thin liquidity pool — what a rug pull can take. */
  liquidityUsd: number;
  supply: number;
  extractedUsd: number;
  rugged: boolean;
  ruggedStep?: number;
  tracedScandal?: boolean;
}

export type PendingEventCategory =
  | 'MARKET'
  | 'HARDWARE'
  | 'GRID'
  | 'RIVAL'
  | 'RAID'
  | 'OPERATIONS'
  | 'FACILITY'
  | 'EMPLOYEE'
  | 'INDUSTRY';

export interface PendingEventOption {
  key: '1' | '2' | '3';
  label: string;
  costUsd?: number;
  riskNote: string;
  resolutionId: string;
}

export interface PendingEvent {
  id: string;
  category: PendingEventCategory;
  title: string;
  description: string;
  triggeredStep: number;
  targetCoin?: CoinSymbol;
  targetRigId?: string;
  targetRivalId?: string;
  targetComponentSlot?: RepairComponentSlot;
  targetGpuIdx?: number;
  options: PendingEventOption[];
}

export interface CycleLedgerEntry {
  cycleNumber: number;
  label: string;
  facilityId?: string;
  miningRevenueUsd: number;
  electricityCostUsd: number;
  rentCostUsd: number;
  payrollCostUsd: number;
  maintenanceCostUsd: number;
  otherSpendUsd: number;
  netCashflowUsd: number;
}

export type TransactionCategory =
  | 'HARDWARE'
  | 'SALE'
  | 'REPAIR'
  | 'FACILITY'
  | 'POWER'
  | 'STAFF'
  | 'CONTRACT'
  | 'RESEARCH'
  | 'EVENT'
  | 'REWARD'
  | 'EXCHANGE'
  | 'FAB'
  | 'CORPORATE';

export interface TransactionEntry {
  id: string;
  step: number;
  stepLabel: string;
  category: TransactionCategory;
  amountUsd: number;
  description: string;
}

export interface NewsItem {
  id: string;
  step: number;
  stepLabel: string;
  title: string;
  detail: string;
  category: 'MILESTONE' | 'MARKET' | 'PR' | 'FACILITY' | 'ALERT' | 'UNDERGROUND' | 'CONTRACT';
}

export interface MilestoneSpec {
  id: string;
  title: string;
  description: string;
  rewardCash: number;
  rewardRp: number;
  rewardReputation: number;
}

export interface AchievementSpec {
  id: string;
  title: string;
  description: string;
  category: 'HARDWARE' | 'OPERATIONS' | 'ECONOMY' | 'RESEARCH' | 'EMPIRE';
}

export type ChallengeId =
  | 'challenge_bootstrap'
  | 'challenge_power_cap'
  | 'challenge_used_only'
  | 'challenge_warehouse_rush'
  | 'challenge_pristine';

export interface ChallengeSpec {
  id: ChallengeId;
  title: string;
  description: string;
  rewardCash: number;
  rewardRp: number;
  achievementId: string;
}

export interface EmpireStats {
  soloBlocksHit: number;
  contractsCompleted: number;
  contractsFailed: number;
  highestCommissionedFacilityIndex?: number;
  covertOpsCount: number;
  raidsSurvived: number;
  totalFinesAndBribesUsd: number;
  totalRevenueUsd: number;
  totalElectricityCostUsd: number;
  totalMaintenanceCostUsd: number;
  totalPayrollCostUsd: number;
  totalHardwareSpendUsd: number;
  totalHardwareSalesUsd: number;
  totalFacilitySpendUsd: number;
  totalResearchSpendUsd: number;
  totalCoolingSpendUsd: number;
  totalContractIncomeUsd: number;
  peakFleetHashScore: number;
  equipmentFailuresCount: number;
  repairsCompleted: number;
  rigPurchasesCount: number;
  usedRigPurchasesCount: number;
  maxPowerKwObserved: number;
  pristineHealthStreak: number;
  usedOnlyEligible: boolean;
}

export interface SandboxConfig {
  startingCash: number;
  startingFacilityId: string;
  startingRigs: number;
  unlockAllResearch: boolean;
  unlockAllCoins: boolean;
  marketRegime: MarketRegime;
  operatingCostMult: number;
}

/** One competitor's line on the seasonal leaderboard. */
export interface SeasonStanding {
  name: string;
  isPlayer: boolean;
  score: number;
  hashIndex: number;
  valuationUsd: number;
}

/** Archived standings for a completed season. */
export interface SeasonRecord {
  seasonId: number;
  label: string;
  endedStep: number;
  playerRank: number;
  standings: SeasonStanding[];
}

export interface PerformanceSnapshot {
  step: number;
  stepLabel: string;
  cash: number;
  valuation: number;
  revenuePerStepUsd: number;
  powerCostPerStepUsd: number;
  netPerStepUsd: number;
  fleetHashScore: number;
  powerKw: number;
}

export interface GameState {
  mode: GameModeState;
  difficulty: DifficultyLevel;
  isSandbox?: boolean;
  isDevSession?: boolean;
  sandboxConfig?: SandboxConfig;
  runSeed: string;
  stepCount: number;
  soundEnabled: boolean;
  /** Real seconds between automatic steps (5-300). Defaults to 30. */
  stepSeconds?: number;
  /** In-game hours that pass per step, used for the game clock (1-24). Defaults to 24. */
  stepHours?: number;
  manualStepBudget?: { available: number; refillStartedAt: number };
  rigQualifications?: RigQualification[];
  cash: number;
  researchPoints: number;
  unlockedResearch: string[];
  activeResearchId: string | null;
  activeResearchProgress: number;
  facilityId: string;
  ownedFacilityIds: string[];
  facilityUpgrades: Partial<Record<FacilityUpgradeId, number>>;
  facilityExtraRooms?: number;
  powerContractId: PowerContractId;
  rigs: MiningRig[];
  backupRigs: MiningRig[];
  coolingUnits: PlacedCoolingUnit[];
  usedMarketListings: UsedMarketListing[];
  usedMarketRefreshStep: number;
  activeMarketModifiers: ActiveMarketModifier[];
  coins: Record<CoinSymbol, CoinMarketState>;
  marketRegime: MarketRegime;
  regimeStepsRemaining: number;
  employees: HiredEmployee[];
  strikeStepsRemaining?: number;
  mediaCredibility: number;
  regulatoryScrutiny: number;
  activeCampaigns: ActivePRCampaign[];
  campaignCooldowns: Record<string, number>;
  rivals: RivalSyndicate[];
  availableContracts: ContractSpec[];
  activeContract: ContractSpec | null;
  underground: UndergroundState;
  pendingEvent: PendingEvent | null;
  ledger: CycleLedgerEntry[];
  transactions: TransactionEntry[];
  performanceHistory?: PerformanceSnapshot[];
  currentCycleStats: {
    miningRevenueUsd: number;
    electricitySpendUsd: number;
    maintenanceSpendUsd: number;
    otherSpendUsd: number;
  };
  unlockedMilestones: string[];
  unlockedAchievements: string[];
  activeChallengeId: ChallengeId | null;
  completedChallenges: ChallengeId[];
  failedChallenges: ChallengeId[];
  news: NewsItem[];
  competitorTechScore: number;
  noiseFinesTotal: number;
  stats: EmpireStats;
  tutorialStep?: number;
  onboardingMode?: OnboardingMode;
  guidedOnboarding?: GuidedOnboardingState;
  seenTutorials?: string[];
  claimedObjectives?: string[];
  devMode: boolean;
  devUnlockAll: boolean;
  wallet?: Record<CoinSymbol, number>;
  walletCostBasis?: Record<CoinSymbol, number>;
  limitOrders?: LimitOrder[];
  shortPositions?: ShortPosition[];
  fab?: FabState;
  scenarioId?: DevScenarioId;
  activePresetId?: string;
  world?: SharedWorldState;
  /** Completed seasons, newest first. Drives the "leaderboard" hall of fame. */
  seasonHistory?: SeasonRecord[];
  /** Multi-business cryptocurrency conglomerate simulation state (Phase 2+). */
  conglomerate?: ConglomerateState;
}

export type RigQualificationGoal = 'efficiency' | 'output' | 'quiet';

export interface RigQualification {
  rigId: string;
  goal: RigQualificationGoal;
  reference: 'balanced' | 'stock';
  step: number;
}

/**
 * Shared-world (multiplayer) data model.
 *
 * Only the systems are in place for now: a locally simulated world with a
 * 10-minute block clock, network hash share and block history. There is no
 * networking, matchmaking or authoritative server yet.
 */
export interface SharedWorldState {
  worldId: string;
  seasonId: number;
  seasonLabel: string;
  blockHeight: number;
  blockIntervalMinutes: number;
  minutesPerStep: number;
  stepsPerBlock: number;
  stepAccumulator: number;
  rewardMode: WorldBlockRewardMode;
  networkHashIndex: number;
  players: WorldPlayerSnapshot[];
  blocks: WorldBlockRecord[];
  totalPlayerBlocksWon: number;
  totalPlayerCoins: number;
  totalPlayerUsd: number;
  lastBlockSummary: string;
}

export type WorldBlockRewardMode = 'PROPORTIONAL' | 'WINNER_TAKE_ALL';

export interface WorldBlockRecord {
  height: number;
  step: number;
  stepLabel: string;
  coin: CoinSymbol;
  networkHashIndex: number;
  playerHashIndex: number;
  playerSharePct: number;
  winnerName: string;
  blockRewardCoins: number;
  playerRewardCoins: number;
  playerRewardUsd: number;
}

export interface WorldPlayerSnapshot {
  id: string;
  name: string;
  isHuman: boolean;
  hashIndex: number;
  sharePct: number;
  blocksWon: number;
}

export type ChipProcessNode = '7nm' | '5nm' | '3nm' | '2nm' | '1nm' | 'photonic';

export type FabArchitectureId =
  | 'ASIC_BLADE'
  | 'CHIPLET_CPU'
  | 'HYBRID_FPGA'
  | 'HASH_CORE'
  | 'HBM_MONSTER'
  | 'LOW_VOLT_CARD'
  | 'OPEN_GPU_FRAME'
  | 'ASIC_BLADE_SHELF'
  | 'SEALED_BAFFLE'
  | 'CONVERGED_SUPER'
  | 'NVME_ARRAY'
  | 'HIGH_BW_DDR'
  | 'HYBRID_CACHE'
  | 'GAN_HIGH_EFF'
  | 'INDUSTRIAL_RAIL'
  | 'SILENT_PASSIVE'
  | 'VAPOR_AIR'
  | 'DIRECT_LIQUID'
  | 'CRYO_IMMERSION'
  | 'BARE_METAL_ASM'
  | 'UNDERCLOCK_SCHED'
  | 'SELF_HEAL_RT';

export type FabSubFeatureId =
  | 'STD'
  | 'COPPER_BUS'
  | 'GRAPHENE_TIM'
  | 'REDUNDANT_VRM'
  | 'ECC_SHIELD';

export interface FabEngineeringAllocation {
  density: number;
  efficiency: number;
  thermals: number;
  reliability: number;
}

export type ChipLayoutTopology = 'MONOLITHIC' | 'CHIPLET_QUAD' | 'MESH_TENSOR';
export type GpuComputeArch = 'SIMD_DENSE' | 'TENSOR_MATRIX' | 'OPTICAL_SHADER';
export type GpuMemorySpec = 'GDDR6X' | 'HBM3' | 'OPTICAL_MEM';
export type QuantumQubitTopology = 'SURFACE_CODE' | 'TOPOLOGICAL_BRAID' | 'ANNEAL_LATTICE';
export type PhotonicSwitchMode = 'MZ_INTERFERO' | 'MICRORING_RES';

export interface FabComponentParams {
  branch?: TechBranch;
  // Chip & compute architecture
  layoutTopology?: ChipLayoutTopology;
  memoryBusWidth?: 128 | 256 | 512 | 1024;
  sramCacheMb?: number;
  voltageBiasPct?: number; // 85..120
  clockBiasPct?: number; // 85..125
  // GPU & AI accelerator options
  gpuComputeArch?: GpuComputeArch;
  vramType?: GpuMemorySpec;
  vramGb?: number;
  workloadBias?: 'ETHASH_DAG' | 'KAWPOW_ALU' | 'EQUIHASH_MEM' | 'AI_CONVERGED';
  // Gen7 Quantum specific
  qubitTopology?: QuantumQubitTopology;
  logicalQubits?: number;
  coherenceTimeUs?: number;
  cryoTargetMk?: number;
  // Gen7 Photonic specific
  waveguideLanes?: number;
  laserWavelengthNm?: 1310 | 1550;
  wdmChannels?: number;
  opticalSwitchMode?: PhotonicSwitchMode;
  // Component-specific parameters (Chassis/Storage/PSU/Cooling/OS)
  hybridAsicSupport?: boolean;
  isCryoRated?: boolean;
  isOpticalBackplane?: boolean;
  eccDepth?: number; // 1..4
  railPhases?: number; // 4..24
  flowGeometry?: 'AXIAL' | 'JET_IMPINGEMENT' | 'CRYO_CASCADE';
  schedulerTickHz?: number;
}

export interface PrototypeTestReport {
  testedStep: number;
  runsCount: number;
  status: 'UNVALIDATED' | 'PASSED' | 'MARGINAL' | 'FAILED_FLAW';
  validatedScore: number; // 0..100
  thermalMarginC: number;
  voltageStabilityPct: number;
  branchCalibrationPct: number;
  discoveredFlaws: string[];
  yieldBonusPct: number;
  defectReductionPct: number;
  reliabilityBonus: number;
}

export interface BlueprintRevisionEntry {
  revisionNumber: number;
  step: number;
  summary: string;
  hashRate: number;
  watts: number;
  heatC: number;
  manufacturabilityPct: number;
}

export interface CustomComponentSpec {
  blueprintId: string;
  revisionNumber?: number;
  serialNumber?: string;
  batchId?: string;
  partCategory: PartCategory;
  architecture: FabArchitectureId;
  subFeature?: FabSubFeatureId;
  branch?: TechBranch;
  name: string;
  processNode: ChipProcessNode;
  generation: HardwareGen;
  unitCostUsd: number;
  wholesaleValueUsd: number;
  qualityGrade?: ChipQualityGrade;
  qualityRoll?: number;
  wearResistance?: number;
  manufacturabilityPct?: number;
  prototypeValidated?: boolean;
  componentParams?: FabComponentParams;
  // Compute & GPU fields
  algo?: MiningAlgorithm;
  hashrates?: Partial<Record<MiningAlgorithm, number>>;
  vramGb?: number;
  watts?: number;
  heatC?: number;
  noiseDba?: number;
  computeKind?: 'CPU' | 'FPGA' | 'ASIC';
  requiresCryoCooling?: boolean;
  requiresOpticalChassis?: boolean;
  // Chassis fields
  maxGpus?: number;
  maxStorage?: number;
  isAsicRack?: boolean;
  maxAsics?: number;
  supportsHybridAsicGpu?: boolean;
  allowedBranches?: TechBranch[];
  isCryoRated?: boolean;
  isOpticalBackplane?: boolean;
  baseWatts?: number;
  coolingBonus?: number;
  noiseModifier?: number;
  // Storage fields
  ramGb?: number;
  storageTb?: number;
  efficiencyBonus?: number;
  // PSU fields
  maxWatts?: number;
  efficiency?: number;
  // Cooling fields
  coolingPowerC?: number;
  isImmersion?: boolean;
  isCryoRatedCooling?: boolean;
  // OS fields
  hashrateMultiplier?: number;
  powerMultiplier?: number;
  stabilityBonus?: number;
}

export interface RigCustomPartsMap {
  chassis?: CustomComponentSpec;
  compute?: CustomComponentSpec;
  gpus?: (CustomComponentSpec | null)[];
  storage?: CustomComponentSpec;
  psu?: CustomComponentSpec;
  cooling?: CustomComponentSpec;
  os?: CustomComponentSpec;
}

export interface CustomAsicSpec {
  blueprintId: string;
  name: string;
  algo: MiningAlgorithm;
  processNode: ChipProcessNode;
  hashRate: number;
  watts: number;
  heatC: number;
  serialNumber?: string;
  branch?: TechBranch;
}

export type DesignProfile = 'PERF' | 'BALANCED' | 'EFF' | 'COMPACT';

export type ChipQualityGrade = 'A' | 'B' | 'C';

export interface CustomChipBlueprint {
  id: string;
  name: string;
  partCategory?: PartCategory;
  architecture?: FabArchitectureId;
  subFeature?: FabSubFeatureId;
  branch?: TechBranch;
  engineering?: FabEngineeringAllocation;
  componentParams?: FabComponentParams;
  customSpec?: CustomComponentSpec;
  nreCostUsd?: number;
  manufacturabilityPct?: number;
  isDraft?: boolean;
  revisionNumber?: number;
  parentBlueprintId?: string;
  revisionHistory?: BlueprintRevisionEntry[];
  prototypeReport?: PrototypeTestReport;
  algo: MiningAlgorithm;
  processNode: ChipProcessNode;
  unitCostUsd: number;
  waferSteps: number;
  hashRate: number;
  watts: number;
  heatC: number;
  wholesaleValueUsd: number;
  createdStep: number;
  designProfile?: DesignProfile;
  qualityGrade?: ChipQualityGrade;
  qualityMult?: number;
}

export interface FabProductionOrder {
  id: string;
  batchId?: string;
  blueprintId: string;
  blueprintName: string;
  revisionNumber?: number;
  qty: number;
  stepsRemaining: number;
  totalSteps: number;
  /** Yield roll for this wafer batch (0.95-1.05), applied to hashrate and resale value. */
  qualityRoll?: number;
  prototypeValidated?: boolean;
  manufacturabilityPct?: number;
}

export interface FabBatchRecord {
  batchId: string;
  blueprintId: string;
  blueprintName: string;
  revisionNumber: number;
  partCategory: PartCategory;
  processNode: ChipProcessNode;
  branch: TechBranch;
  requestedQty: number;
  passedQty: number;
  scrappedDefectQty: number;
  qcScore: number;
  qualityGrade: ChipQualityGrade;
  qualityRoll: number;
  prototypeValidated: boolean;
  completedStep: number;
  stepLabel: string;
  serialNumbers: string[];
  notes: string;
}

export interface SerializedComponentRecord {
  serialNumber: string;
  batchId: string;
  blueprintId: string;
  revisionNumber: number;
  name: string;
  partCategory: PartCategory;
  processNode: ChipProcessNode;
  branch: TechBranch;
  qualityGrade: ChipQualityGrade;
  measuredHashMult: number;
  measuredWattMult: number;
  wearResistance: number;
  manufacturedStep: number;
  status: 'IN_STOCK' | 'INSTALLED' | 'EXPORTED' | 'SCRAPPED';
  installedRigId?: string;
  history: string[];
}

export interface ManufacturingHistoryEntry {
  id: string;
  step: number;
  stepLabel: string;
  kind: 'DRAFT' | 'TAPEOUT' | 'REVISION' | 'PROTOTYPE' | 'BATCH_DONE' | 'DEPLOY' | 'STRIP' | 'EXPORT' | 'SCRAP';
  summary: string;
}

export interface CustomAsicInventoryItem {
  blueprintId: string;
  name: string;
  partCategory?: PartCategory;
  architecture?: FabArchitectureId;
  subFeature?: FabSubFeatureId;
  branch?: TechBranch;
  customSpec?: CustomComponentSpec;
  algo: MiningAlgorithm;
  processNode: ChipProcessNode;
  hashRate: number;
  watts: number;
  heatC: number;
  wholesaleValueUsd: number;
  qty: number;
  qualityGrade?: ChipQualityGrade;
  /** Batch yield multiplier this stack was manufactured at (0.95-1.05). */
  qualityRoll?: number;
  serialNumbers?: string[];
  batchId?: string;
}

export interface FabState {
  linesCount: number;
  blueprints: CustomChipBlueprint[];
  draftBlueprints?: CustomChipBlueprint[];
  productionQueue: FabProductionOrder[];
  inventory: CustomAsicInventoryItem[];
  batchRecords?: FabBatchRecord[];
  serialRegistry?: SerializedComponentRecord[];
  manufacturingHistory?: ManufacturingHistoryEntry[];
  nextBatchSeq?: number;
  nextSerialSeq?: number;
  totalUnitsManufactured: number;
  totalUnitsScrapped?: number;
  totalExportRevenueUsd: number;
}

export interface LimitOrder {
  id: string;
  side: 'BUY' | 'SELL';
  coin: CoinSymbol;
  targetPriceUsd: number;
  amount: number;
  reservedUsd?: number;
  createdStep: number;
}

export interface ShortPosition {
  id: string;
  coin: CoinSymbol;
  entryPriceUsd: number;
  collateralUsd: number;
  coinSize: number;
  openedStep: number;
}

export type OnboardingMode = 'GUIDED' | 'VETERAN';

export type GuidedPaceMode = 'SLOW' | 'NORMAL' | 'FAST';

export type GuidedSystemStatus =
  | 'LOCKED'
  | 'ENCOUNTERED'
  | 'TASK_ACTIVE'
  | 'LEARNED'
  | 'DISMISSED';

export interface GuidedOnboardingState {
  paused: boolean;
  pace: GuidedPaceMode;
  currentStageIdx: number;
  systemStatuses: Record<string, GuidedSystemStatus>;
  completedChecklistIds: string[];
  earnedChecklistIds?: string[];
  revisitedTopics: string[];
  systemOpensAt?: Record<string, number>;
  lessonQueue?: string[];
  lastLessonAt?: number;
}

export interface CareerPreset {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  isBuiltIn?: boolean;
  includeCash: boolean;
  startingCash: number;
  difficulty: DifficultyLevel;
  onboardingMode: OnboardingMode;
  includeFacility: boolean;
  startingFacilityId: string;
  powerContractId: PowerContractId;
  startingFacilityOwned?: boolean;
  includeMarketRules: boolean;
  marketRegime: MarketRegime;
  operatingCostMult: number;
  unlockAllCoins: boolean;
  unlockAllResearch: boolean;
  includeStarterRig: boolean;
  startingResearchIds?: string[];
  starterRigConfig: Omit<RigBuildConfig, 'name'>;
}

export interface SaveFileEnvelope {
  format: 'BLOCKWORKS_SAVE_V2';
  exportedAt: string;
  version: number;
  isSandbox: boolean;
  state: GameState;
}

export type BusinessId =
  | 'MINING'
  | 'MARKET_INTEL'
  | 'HARDWARE_ENG'
  | 'MANUFACTURING'
  | 'MINING_SERVICES'
  | 'UNDERGROUND';

export type ConglomerateGeneration = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type BusinessDivisionStatus = 'UNOWNED' | 'ACQUIRING' | 'RECOVERING' | 'ACTIVE';

export interface BusinessDivisionLedger {
  totalRevenueUsd: number;
  totalExpenseUsd: number;
  totalInternalCreditsUsd: number;
  lastStepRevenueUsd: number;
  lastStepExpenseUsd: number;
  lastStepNetUsd: number;
  cycleRevenueUsd: number;
  cycleExpenseUsd: number;
  cycleInternalCreditsUsd: number;
}

export interface BusinessDivisionState {
  id: BusinessId;
  name: string;
  acquiredCompanyName?: string;
  status: BusinessDivisionStatus;
  acquiredStep: number | null;
  level: number;
  reputation: number;
  efficiencyMult: number;
  recoveryStepsRemaining: number;
  turnaroundCostUsd?: number;
  staffAssigned: number;
  ledger: BusinessDivisionLedger;
}

export interface IndustryAffinityProfile {
  scores: Record<BusinessId, number>;
  signalCounts: Record<BusinessId, number>;
  lastUpdatedStep: number;
  dominantBusinessId: BusinessId;
}

export interface AcquisitionTarget {
  id: string;
  businessId: BusinessId;
  companyName: string;
  distressReason: string;
  purchasePriceUsd: number;
  assumedDebtUsd: number;
  turnaroundCostUsd: number;
  recoverySteps: number;
  existingStaffCount: number;
  existingAssetSummary: string;
  affinityMatchPct: number;
  inspected: boolean;
  expiresAtStep: number;
}

export interface AcquisitionState {
  expansionOpportunityUnlocked: boolean;
  expansionOfferStep: number | null;
  availableTargets: AcquisitionTarget[];
  completedCount: number;
  lastRefreshStep: number;
}

export type SynergyPolicyId =
  | 'ENG_TO_MFG'
  | 'MFG_TO_MINING'
  | 'MFG_TO_SERVICES'
  | 'INTEL_TO_MINING'
  | 'INTEL_TO_TREASURY'
  | 'UG_BLACK_SILICON';

export interface CorporateHQState {
  established: boolean;
  hqLevel: number;
  companyName: string;
  activeSynergies: SynergyPolicyId[];
  totalSynergyValueUsd: number;
  lastConsolidatedStep: number;
}

export interface GenerationMilestoneState {
  currentGeneration: ConglomerateGeneration;
  highestGenerationReached: ConglomerateGeneration;
  gen5ExpansionTriggered: boolean;
  gen5ExpansionStep: number | null;
  gen6Unlocked: boolean;
  gen7ConglomerateUnlocked: boolean;
  gen7UnlockedStep: number | null;
}

export interface MarketIntelDivisionState {
  modelTier: number;
  predictionAccuracyPct: number;
  activeSubscriptions: number;
  softwareLicensesSold: number;
  advisoryActive: boolean;
  lastForecastScore: number;
  lastModelRunStep?: number;
  lastLicenseSaleStep?: number;
}

export interface HardwareEngDivisionState {
  labTier: number;
  licensedDesignsCount: number;
  royaltyIncomeTotalUsd: number;
  externalDesignContractsCompleted: number;
  licensedBlueprintIds?: string[];
  lastContractStep?: number;
  lastTuningStep?: number;
  coolingPowerEfficiencyBonusPct?: number;
}

export interface ManufacturingOemContract {
  id: string;
  clientName: string;
  partCategory: PartCategory;
  qty: number;
  stepsRemaining: number;
  totalSteps: number;
  payoutUsd: number;
}

export interface ManufacturingDivisionState {
  contractSlots: number;
  oemContractsCompleted: number;
  internalSupplyOrdersFilled: number;
  defectRateMult: number;
  activeOemContracts?: ManufacturingOemContract[];
  lastInternalSupplyStep?: number;
  qcAuditScorePct?: number;
}

export interface MiningServicesDivisionState {
  poolOperatorActive: boolean;
  poolFeePct: number;
  hostedClientsCount: number;
  rentedCapacityKw: number;
  slaCompliancePct: number;
  totalPoolFeeUsd: number;
  totalHostingUsd: number;
  activeComputeLeases?: number;
  computeLeaseStepsRemaining?: number;
  lastHostingMaintStep?: number;
}

export interface UndergroundDivisionContract {
  id: string;
  codeName: string;
  kind: 'OFFSHORE_ESCROW' | 'DARK_POOL_LIQUIDITY' | 'RIVAL_PROXY_PRESSURE';
  stepsRemaining: number;
  totalSteps: number;
  basePayoutUsd: number;
  riskHeat: number;
}

export interface UndergroundDivisionState {
  subsidiaryStructured: boolean;
  shellSubsidiaryShieldPct: number;
  parentRiskSpilloverCount: number;
  launderCapacityBonusPct: number;
  activeContract?: UndergroundDivisionContract | null;
  contractsCompleted?: number;
  totalExtractedUsd?: number;
  lastAuditFirewallStep?: number;
}

export interface ConglomerateState {
  businesses: Record<BusinessId, BusinessDivisionState>;
  affinity: IndustryAffinityProfile;
  acquisitions: AcquisitionState;
  hq: CorporateHQState;
  generation: GenerationMilestoneState;
  businessTutorialsSeen: BusinessId[];
  marketIntel: MarketIntelDivisionState;
  hardwareEng: HardwareEngDivisionState;
  manufacturing: ManufacturingDivisionState;
  miningServices: MiningServicesDivisionState;
  undergroundDiv: UndergroundDivisionState;
}

