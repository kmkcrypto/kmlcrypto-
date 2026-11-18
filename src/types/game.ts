export type GameModeState = 'TITLE_MENU' | 'PLAYING';

export type DifficultyLevel = 'BOOTSTRAP' | 'STANDARD' | 'TYCOON_SANDBOX';

export type TechEra = 'CPU' | 'GPU' | 'FPGA' | 'ASIC';

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

export interface MiningRig extends RigBuildConfig {
  id: string;
  enabled: boolean;
  gridX: number;
  gridY: number;
  temperatureC: number;
  healthPct: number;
  status:
    | 'MINING'
    | 'THROTTLED'
    | 'OVERHEATED'
    | 'UNDERPOWERED'
    | 'PAUSED'
    | 'COIN_LOCKED'
    | 'NEEDS_REPAIR';
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

export type RoomCoolingType = 'cool_unit_fan' | 'cool_unit_ac' | 'cool_unit_chiller';

export interface RoomCoolingSpec {
  id: RoomCoolingType;
  name: string;
  cost: number;
  watts: number;
  noiseDba: number;
  coolingRadiusTiles: number;
  coolingPowerC: number;
  unlockFacilityIndex: number;
  description: string;
}

export interface PlacedCoolingUnit {
  id: string;
  type: RoomCoolingType;
  gridX: number;
  gridY: number;
  enabled: boolean;
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
  hiredStep: number;
}

export interface ResearchNode {
  id: string;
  name: string;
  era: TechEra;
  costRp: number;
  costCash: number;
  prereqIds: string[];
  effectSummary: string;
  category: 'HARDWARE' | 'SOFTWARE' | 'FACILITY' | 'MARKET';
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

export interface RivalSyndicate {
  id: string;
  name: string;
  archetype: 'HYDRO_GIANT' | 'SILICON_CARTEL' | 'DARKNET_POOL';
  specialtyCoin: CoinSymbol;
  hashPowerIndex: number;
  baseGrowthRate: number;
  marketSharePct: number;
  aggressiveness: number;
  hostility: number;
  disruptedSteps: number;
  lastActionSummary: string;
}

export type ContractType = 'COIN_REVENUE' | 'POOL_HASH' | 'LOW_NOISE_RUN';

export interface ContractSpec {
  id: string;
  title: string;
  clientName: string;
  type: ContractType;
  targetCoin?: CoinSymbol;
  targetAmount: number;
  progress: number;
  durationSteps: number;
  stepsRemaining: number;
  rewardCash: number;
  rewardRp: number;
  penaltyCredibility: number;
  description: string;
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

export type PendingEventCategory = 'MARKET' | 'HARDWARE' | 'GRID' | 'RIVAL' | 'RAID';

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
  otherSpendUsd: number;
  netCashflowUsd: number;
}

export interface NewsItem {
  id: string;
  step: number;
  stepLabel: string;
  title: string;
  detail: string;
  category: 'MILESTONE' | 'MARKET' | 'PR' | 'FACILITY' | 'ALERT' | 'UNDERGROUND' | 'CONTRACT';
}

export interface EmpireStats {
  soloBlocksHit: number;
  contractsCompleted: number;
  covertOpsCount: number;
  raidsSurvived: number;
  totalFinesAndBribesUsd: number;
}

export interface GameState {
  mode: GameModeState;
  difficulty: DifficultyLevel;
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
  rigs: MiningRig[];
  coolingUnits: PlacedCoolingUnit[];
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
  currentCycleStats: {
    miningRevenueUsd: number;
    otherSpendUsd: number;
  };
  news: NewsItem[];
  competitorTechScore: number;
  noiseFinesTotal: number;
  stats: EmpireStats;
  tutorialStep?: number;
  devMode: boolean;
  devUnlockAll: boolean;
}
