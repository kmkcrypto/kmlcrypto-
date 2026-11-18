export type GameModeState = 'TITLE_MENU' | 'PLAYING';

export type DifficultyLevel = 'BOOTSTRAP' | 'STANDARD' | 'TYCOON_SANDBOX' | 'SANDBOX';

export type TechEra = 'CPU' | 'GPU' | 'FPGA' | 'ASIC';

export type HardwareGen = 1 | 2 | 3 | 4;

export type HardwareConditionTier = 'NEW' | 'REFURBISHED' | 'USED' | 'DAMAGED';

export type CoinSymbol = 'BTC' | 'LTC' | 'DOGE' | 'XMR' | 'ETH' | 'XCH';

export type MiningAlgorithm = 'SHA256' | 'SCRYPT' | 'RANDOMX' | 'ETHASH' | 'POST';

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
  generation?: HardwareGen;
  researchRequired?: string;
  cost: number;
  maxGpus: number;
  maxStorage: number;
  isAsicRack: boolean;
  maxAsics: number;
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
  generation?: HardwareGen;
  researchRequired?: string;
  cost: number;
  watts: number;
  heatC: number;
  noiseDba: number;
  hashrates: Partial<Record<MiningAlgorithm, number>>;
  description: string;
}

export interface GpuPart {
  id: string;
  name: string;
  category: 'gpu';
  era: TechEra;
  generation?: HardwareGen;
  researchRequired?: string;
  cost: number;
  watts: number;
  heatC: number;
  noiseDba: number;
  hashrates: Partial<Record<MiningAlgorithm, number>>;
  description: string;
}

export interface StoragePart {
  id: string;
  name: string;
  category: 'storage';
  era: TechEra;
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
  generation?: HardwareGen;
  researchRequired?: string;
  cost: number;
  coolingPowerC: number;
  watts: number;
  noiseDba: number;
  description: string;
}

export interface OsPart {
  id: string;
  name: string;
  category: 'os';
  era: TechEra;
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
  enabled: boolean;
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

export interface RivalSyndicate {
  id: string;
  name: string;
  archetype: 'HYDRO_GIANT' | 'SILICON_CARTEL' | 'DARKNET_POOL';
  strategy: RivalStrategy;
  specialtyCoin: CoinSymbol;
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
}

export type ContractType =
  | 'COIN_REVENUE'
  | 'POOL_HASH'
  | 'LOW_NOISE_RUN'
  | 'EQUIPMENT_SUPPLY'
  | 'FACILITY_EXPANSION'
  | 'MAINTENANCE_SLA'
  | 'RESEARCH_PARTNERSHIP'
  | 'OPERATIONAL_PERFORMANCE';

export interface ContractSpec {
  id: string;
  title: string;
  clientName: string;
  type: ContractType;
  targetCoin?: CoinSymbol;
  targetAmount: number;
  targetConditionPct?: number;
  targetFacilityIndex?: number;
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
}

export interface UndergroundState {
  powerSiphonActive: boolean;
  botnetCoin: CoinSymbol | null;
  botnetBonusHash: number;
  botnetStepsRemaining: number;
  washCooldownStep: number;
  launderCooldownStep: number;
  bribeProtectionSteps: number;
  blackMarketListings: BlackMarketListing[];
  blackMarketRefreshStep: number;
}

export type PendingEventCategory =
  | 'MARKET'
  | 'HARDWARE'
  | 'GRID'
  | 'RIVAL'
  | 'RAID'
  | 'OPERATIONS';

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
  options: PendingEventOption[];
}

export interface CycleLedgerEntry {
  cycleNumber: number;
  label: string;
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
  | 'REWARD';

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

export interface GameState {
  mode: GameModeState;
  difficulty: DifficultyLevel;
  isSandbox?: boolean;
  sandboxConfig?: SandboxConfig;
  runSeed: string;
  stepCount: number;
  soundEnabled: boolean;
  cash: number;
  researchPoints: number;
  unlockedResearch: string[];
  activeResearchId: string | null;
  activeResearchProgress: number;
  facilityId: string;
  ownedFacilityIds: string[];
  facilityUpgrades: Partial<Record<FacilityUpgradeId, number>>;
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
  devMode: boolean;
  devUnlockAll: boolean;
}

export interface SaveFileEnvelope {
  format: 'BLOCKWORKS_SAVE_V2';
  exportedAt: string;
  version: number;
  isSandbox: boolean;
  state: GameState;
}
