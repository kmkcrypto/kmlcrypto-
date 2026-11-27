import {
  AcquisitionState,
  BusinessDivisionLedger,
  BusinessDivisionState,
  BusinessDivisionStatus,
  BusinessId,
  ConglomerateGeneration,
  ConglomerateState,
  CorporateHQState,
  GameState,
  GenerationMilestoneState,
  HardwareEngDivisionState,
  ManufacturingDivisionState,
  MarketIntelDivisionState,
  MiningServicesDivisionState,
  SynergyPolicyId,
  UndergroundDivisionState,
} from '../types/game';
import {
  backfillAffinityFromState,
  buildDefaultAffinityProfile,
  BUSINESS_CATALOG,
  BUSINESS_ORDER,
} from './affinity';

export function buildDefaultDivisionLedger(
  seed?: Partial<BusinessDivisionLedger>
): BusinessDivisionLedger {
  const num = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return {
    totalRevenueUsd: num(seed?.totalRevenueUsd),
    totalExpenseUsd: num(seed?.totalExpenseUsd),
    totalInternalCreditsUsd: num(seed?.totalInternalCreditsUsd),
    lastStepRevenueUsd: num(seed?.lastStepRevenueUsd),
    lastStepExpenseUsd: num(seed?.lastStepExpenseUsd),
    lastStepNetUsd: num(seed?.lastStepNetUsd),
    cycleRevenueUsd: num(seed?.cycleRevenueUsd),
    cycleExpenseUsd: num(seed?.cycleExpenseUsd),
    cycleInternalCreditsUsd: num(seed?.cycleInternalCreditsUsd),
  };
}

export function buildDefaultBusinessDivision(
  id: BusinessId,
  seed?: Partial<BusinessDivisionState>
): BusinessDivisionState {
  const meta = BUSINESS_CATALOG[id];
  const validStatus: BusinessDivisionStatus =
    seed?.status === 'ACTIVE' ||
    seed?.status === 'RECOVERING' ||
    seed?.status === 'ACQUIRING' ||
    seed?.status === 'UNOWNED'
      ? seed.status
      : id === 'MINING'
      ? 'ACTIVE'
      : 'UNOWNED';

  return {
    id,
    name: typeof seed?.name === 'string' && seed.name.trim() ? seed.name : meta.name,
    ...(typeof seed?.acquiredCompanyName === 'string' && seed.acquiredCompanyName.trim()
      ? { acquiredCompanyName: seed.acquiredCompanyName.trim() }
      : {}),
    status: validStatus,
    acquiredStep:
      typeof seed?.acquiredStep === 'number' && Number.isFinite(seed.acquiredStep)
        ? seed.acquiredStep
        : validStatus === 'ACTIVE' && id === 'MINING'
        ? 0
        : null,
    level:
      typeof seed?.level === 'number' && Number.isFinite(seed.level) && seed.level >= 1
        ? Math.floor(seed.level)
        : 1,
    reputation:
      typeof seed?.reputation === 'number' && Number.isFinite(seed.reputation)
        ? Math.max(0, Math.min(100, seed.reputation))
        : id === 'MINING'
        ? 40
        : 25,
    efficiencyMult:
      typeof seed?.efficiencyMult === 'number' && Number.isFinite(seed.efficiencyMult) && seed.efficiencyMult > 0
        ? seed.efficiencyMult
        : 1,
    recoveryStepsRemaining:
      typeof seed?.recoveryStepsRemaining === 'number' && Number.isFinite(seed.recoveryStepsRemaining)
        ? Math.max(0, Math.floor(seed.recoveryStepsRemaining))
        : 0,
    ...(typeof seed?.turnaroundCostUsd === 'number' && Number.isFinite(seed.turnaroundCostUsd) && seed.turnaroundCostUsd >= 0
      ? { turnaroundCostUsd: seed.turnaroundCostUsd }
      : {}),
    staffAssigned:
      typeof seed?.staffAssigned === 'number' && Number.isFinite(seed.staffAssigned)
        ? Math.max(0, Math.floor(seed.staffAssigned))
        : 0,
    ledger: buildDefaultDivisionLedger(seed?.ledger),
  };
}

function buildDefaultAcquisitions(seed?: Partial<AcquisitionState>): AcquisitionState {
  return {
    expansionOpportunityUnlocked: Boolean(seed?.expansionOpportunityUnlocked),
    expansionOfferStep:
      typeof seed?.expansionOfferStep === 'number' && Number.isFinite(seed.expansionOfferStep)
        ? seed.expansionOfferStep
        : null,
    availableTargets: Array.isArray(seed?.availableTargets) ? seed.availableTargets : [],
    completedCount:
      typeof seed?.completedCount === 'number' && Number.isFinite(seed.completedCount)
        ? Math.max(0, Math.floor(seed.completedCount))
        : 0,
    lastRefreshStep:
      typeof seed?.lastRefreshStep === 'number' && Number.isFinite(seed.lastRefreshStep)
        ? seed.lastRefreshStep
        : 0,
  };
}

const VALID_SYNERGY_IDS: SynergyPolicyId[] = [
  'ENG_TO_MFG',
  'MFG_TO_MINING',
  'MFG_TO_SERVICES',
  'INTEL_TO_MINING',
  'INTEL_TO_TREASURY',
  'UG_BLACK_SILICON',
];

function buildDefaultHQ(seed?: Partial<CorporateHQState>): CorporateHQState {
  const established = Boolean(seed?.established);
  const rawLevel =
    typeof seed?.hqLevel === 'number' && Number.isFinite(seed.hqLevel)
      ? Math.floor(seed.hqLevel)
      : established
      ? 1
      : 0;
  const hqLevel = established ? Math.max(1, Math.min(5, rawLevel || 1)) : 0;
  const activeSynergies = Array.isArray(seed?.activeSynergies)
    ? Array.from(
        new Set(
          seed.activeSynergies.filter((id): id is SynergyPolicyId =>
            VALID_SYNERGY_IDS.includes(id)
          )
        )
      )
    : [];

  return {
    established,
    hqLevel,
    companyName:
      typeof seed?.companyName === 'string' && seed.companyName.trim()
        ? seed.companyName.trim()
        : 'Hashrate Holdings',
    activeSynergies,
    totalSynergyValueUsd:
      typeof seed?.totalSynergyValueUsd === 'number' && Number.isFinite(seed.totalSynergyValueUsd)
        ? seed.totalSynergyValueUsd
        : 0,
    lastConsolidatedStep:
      typeof seed?.lastConsolidatedStep === 'number' && Number.isFinite(seed.lastConsolidatedStep)
        ? seed.lastConsolidatedStep
        : 0,
  };
}

function clampGeneration(val: unknown): ConglomerateGeneration {
  if (typeof val === 'number' && Number.isInteger(val) && val >= 1 && val <= 7) {
    return val as ConglomerateGeneration;
  }
  return 1;
}

function buildDefaultGenerationState(
  seed?: Partial<GenerationMilestoneState>
): GenerationMilestoneState {
  const currentGeneration = clampGeneration(seed?.currentGeneration);
  const highestGenerationReached = Math.max(
    currentGeneration,
    clampGeneration(seed?.highestGenerationReached)
  ) as ConglomerateGeneration;

  return {
    currentGeneration,
    highestGenerationReached,
    gen5ExpansionTriggered: Boolean(seed?.gen5ExpansionTriggered),
    gen5ExpansionStep:
      typeof seed?.gen5ExpansionStep === 'number' && Number.isFinite(seed.gen5ExpansionStep)
        ? seed.gen5ExpansionStep
        : null,
    gen6Unlocked: Boolean(seed?.gen6Unlocked),
    gen7ConglomerateUnlocked: Boolean(seed?.gen7ConglomerateUnlocked),
    gen7UnlockedStep:
      typeof seed?.gen7UnlockedStep === 'number' && Number.isFinite(seed.gen7UnlockedStep)
        ? seed.gen7UnlockedStep
        : null,
  };
}

function buildDefaultMarketIntelDiv(
  seed?: Partial<MarketIntelDivisionState>
): MarketIntelDivisionState {
  return {
    modelTier: typeof seed?.modelTier === 'number' && seed.modelTier >= 1 ? Math.floor(seed.modelTier) : 1,
    predictionAccuracyPct:
      typeof seed?.predictionAccuracyPct === 'number' ? Math.max(30, Math.min(98, seed.predictionAccuracyPct)) : 54,
    activeSubscriptions:
      typeof seed?.activeSubscriptions === 'number' ? Math.max(0, Math.floor(seed.activeSubscriptions)) : 0,
    softwareLicensesSold:
      typeof seed?.softwareLicensesSold === 'number' ? Math.max(0, Math.floor(seed.softwareLicensesSold)) : 0,
    advisoryActive: Boolean(seed?.advisoryActive),
    lastForecastScore:
      typeof seed?.lastForecastScore === 'number' ? seed.lastForecastScore : 0,
    ...(typeof seed?.lastModelRunStep === 'number' && Number.isFinite(seed.lastModelRunStep)
      ? { lastModelRunStep: seed.lastModelRunStep }
      : {}),
    ...(typeof seed?.lastLicenseSaleStep === 'number' && Number.isFinite(seed.lastLicenseSaleStep)
      ? { lastLicenseSaleStep: seed.lastLicenseSaleStep }
      : {}),
  };
}

function buildDefaultHardwareEngDiv(
  seed?: Partial<HardwareEngDivisionState>
): HardwareEngDivisionState {
  return {
    labTier: typeof seed?.labTier === 'number' && seed.labTier >= 1 ? Math.floor(seed.labTier) : 1,
    licensedDesignsCount:
      typeof seed?.licensedDesignsCount === 'number' ? Math.max(0, Math.floor(seed.licensedDesignsCount)) : 0,
    royaltyIncomeTotalUsd:
      typeof seed?.royaltyIncomeTotalUsd === 'number' ? seed.royaltyIncomeTotalUsd : 0,
    externalDesignContractsCompleted:
      typeof seed?.externalDesignContractsCompleted === 'number'
        ? Math.max(0, Math.floor(seed.externalDesignContractsCompleted))
        : 0,
    ...(Array.isArray(seed?.licensedBlueprintIds)
      ? { licensedBlueprintIds: seed.licensedBlueprintIds.filter((s): s is string => typeof s === 'string') }
      : {}),
    ...(typeof seed?.lastContractStep === 'number' && Number.isFinite(seed.lastContractStep)
      ? { lastContractStep: seed.lastContractStep }
      : {}),
    ...(typeof seed?.lastTuningStep === 'number' && Number.isFinite(seed.lastTuningStep)
      ? { lastTuningStep: seed.lastTuningStep }
      : {}),
    ...(typeof seed?.coolingPowerEfficiencyBonusPct === 'number' && Number.isFinite(seed.coolingPowerEfficiencyBonusPct)
      ? { coolingPowerEfficiencyBonusPct: Math.max(0, Math.min(12, seed.coolingPowerEfficiencyBonusPct)) }
      : {}),
  };
}

function buildDefaultManufacturingDiv(
  seed?: Partial<ManufacturingDivisionState>
): ManufacturingDivisionState {
  return {
    contractSlots:
      typeof seed?.contractSlots === 'number' && seed.contractSlots >= 1 ? Math.floor(seed.contractSlots) : 1,
    oemContractsCompleted:
      typeof seed?.oemContractsCompleted === 'number' ? Math.max(0, Math.floor(seed.oemContractsCompleted)) : 0,
    internalSupplyOrdersFilled:
      typeof seed?.internalSupplyOrdersFilled === 'number'
        ? Math.max(0, Math.floor(seed.internalSupplyOrdersFilled))
        : 0,
    defectRateMult:
      typeof seed?.defectRateMult === 'number' && seed.defectRateMult > 0 ? seed.defectRateMult : 1,
    ...(Array.isArray(seed?.activeOemContracts) ? { activeOemContracts: seed.activeOemContracts } : {}),
    ...(typeof seed?.lastInternalSupplyStep === 'number' && Number.isFinite(seed.lastInternalSupplyStep)
      ? { lastInternalSupplyStep: seed.lastInternalSupplyStep }
      : {}),
    ...(typeof seed?.qcAuditScorePct === 'number' && Number.isFinite(seed.qcAuditScorePct)
      ? { qcAuditScorePct: Math.max(50, Math.min(100, seed.qcAuditScorePct)) }
      : {}),
  };
}

function buildDefaultMiningServicesDiv(
  seed?: Partial<MiningServicesDivisionState>
): MiningServicesDivisionState {
  return {
    poolOperatorActive: Boolean(seed?.poolOperatorActive),
    poolFeePct:
      typeof seed?.poolFeePct === 'number' ? Math.max(0.25, Math.min(5, seed.poolFeePct)) : 1.5,
    hostedClientsCount:
      typeof seed?.hostedClientsCount === 'number' ? Math.max(0, Math.floor(seed.hostedClientsCount)) : 0,
    rentedCapacityKw:
      typeof seed?.rentedCapacityKw === 'number' ? Math.max(0, seed.rentedCapacityKw) : 0,
    slaCompliancePct:
      typeof seed?.slaCompliancePct === 'number' ? Math.max(0, Math.min(100, seed.slaCompliancePct)) : 100,
    totalPoolFeeUsd:
      typeof seed?.totalPoolFeeUsd === 'number' ? seed.totalPoolFeeUsd : 0,
    totalHostingUsd:
      typeof seed?.totalHostingUsd === 'number' ? seed.totalHostingUsd : 0,
    ...(typeof seed?.activeComputeLeases === 'number' && seed.activeComputeLeases >= 0
      ? { activeComputeLeases: Math.floor(seed.activeComputeLeases) }
      : {}),
    ...(typeof seed?.computeLeaseStepsRemaining === 'number' && seed.computeLeaseStepsRemaining >= 0
      ? { computeLeaseStepsRemaining: Math.floor(seed.computeLeaseStepsRemaining) }
      : {}),
    ...(typeof seed?.lastHostingMaintStep === 'number' && Number.isFinite(seed.lastHostingMaintStep)
      ? { lastHostingMaintStep: seed.lastHostingMaintStep }
      : {}),
  };
}

function buildDefaultUndergroundDiv(
  seed?: Partial<UndergroundDivisionState>
): UndergroundDivisionState {
  return {
    subsidiaryStructured: Boolean(seed?.subsidiaryStructured),
    shellSubsidiaryShieldPct:
      typeof seed?.shellSubsidiaryShieldPct === 'number'
        ? Math.max(0, Math.min(60, seed.shellSubsidiaryShieldPct))
        : 0,
    parentRiskSpilloverCount:
      typeof seed?.parentRiskSpilloverCount === 'number'
        ? Math.max(0, Math.floor(seed.parentRiskSpilloverCount))
        : 0,
    launderCapacityBonusPct:
      typeof seed?.launderCapacityBonusPct === 'number'
        ? Math.max(0, seed.launderCapacityBonusPct)
        : 0,
    ...(seed?.activeContract ? { activeContract: seed.activeContract } : {}),
    ...(typeof seed?.contractsCompleted === 'number'
      ? { contractsCompleted: Math.max(0, Math.floor(seed.contractsCompleted)) }
      : {}),
    ...(typeof seed?.totalExtractedUsd === 'number'
      ? { totalExtractedUsd: Number(seed.totalExtractedUsd.toFixed(2)) }
      : {}),
    ...(typeof seed?.lastAuditFirewallStep === 'number'
      ? { lastAuditFirewallStep: seed.lastAuditFirewallStep }
      : {}),
  };
}

export function buildDefaultConglomerate(
  stateHint?: GameState,
  existing?: Partial<ConglomerateState>
): ConglomerateState {
  const businesses = {} as Record<BusinessId, BusinessDivisionState>;
  for (const id of BUSINESS_ORDER) {
    businesses[id] = buildDefaultBusinessDivision(id, existing?.businesses?.[id]);
  }
  // Mining is always at least owned unless explicitly overridden; ensure starter consistency
  if (businesses.MINING.status === 'UNOWNED') {
    businesses.MINING = { ...businesses.MINING, status: 'ACTIVE', acquiredStep: 0 };
  }

  const affinity = existing?.affinity
    ? buildDefaultAffinityProfile(existing.affinity)
    : stateHint && (stateHint.stepCount > 0 || stateHint.rigs.length > 1 || stateHint.unlockedResearch.length > 0)
    ? backfillAffinityFromState(stateHint)
    : buildDefaultAffinityProfile();

  const seenTutorials = Array.isArray(existing?.businessTutorialsSeen)
    ? existing.businessTutorialsSeen.filter((id): id is BusinessId =>
        BUSINESS_ORDER.includes(id)
      )
    : [];

  return {
    businesses,
    affinity,
    acquisitions: buildDefaultAcquisitions(existing?.acquisitions),
    hq: buildDefaultHQ(existing?.hq),
    generation: buildDefaultGenerationState(existing?.generation),
    businessTutorialsSeen: seenTutorials,
    marketIntel: buildDefaultMarketIntelDiv(existing?.marketIntel),
    hardwareEng: buildDefaultHardwareEngDiv(existing?.hardwareEng),
    manufacturing: buildDefaultManufacturingDiv(existing?.manufacturing),
    miningServices: buildDefaultMiningServicesDiv(existing?.miningServices),
    undergroundDiv: buildDefaultUndergroundDiv(existing?.undergroundDiv),
  };
}

export function getConglomerateState(state: Pick<GameState, 'conglomerate'>): ConglomerateState {
  return state.conglomerate ?? buildDefaultConglomerate();
}

export function isBusinessOwned(
  state: Pick<GameState, 'conglomerate'>,
  businessId: BusinessId
): boolean {
  if (businessId === 'MINING') return true;
  const status = state.conglomerate?.businesses?.[businessId]?.status;
  return status === 'ACTIVE' || status === 'RECOVERING';
}

export function isBusinessActive(
  state: Pick<GameState, 'conglomerate'>,
  businessId: BusinessId
): boolean {
  if (businessId === 'MINING' && !state.conglomerate) return true;
  return state.conglomerate?.businesses?.[businessId]?.status === 'ACTIVE';
}

export function getOwnedBusinessIds(
  state: Pick<GameState, 'conglomerate'>
): BusinessId[] {
  return BUSINESS_ORDER.filter((id) => isBusinessOwned(state, id));
}

export function areAllSixBusinessesOwned(
  state: Pick<GameState, 'conglomerate'>
): boolean {
  return BUSINESS_ORDER.every((id) => isBusinessOwned(state, id));
}

export function recordDivisionFinancials(
  conglomerate: ConglomerateState,
  businessId: BusinessId,
  delta: {
    revenueUsd?: number;
    expenseUsd?: number;
    internalCreditUsd?: number;
    setStepSnapshot?: boolean;
  }
): ConglomerateState {
  const div = conglomerate.businesses[businessId];
  const rev = delta.revenueUsd ?? 0;
  const exp = delta.expenseUsd ?? 0;
  const internal = delta.internalCreditUsd ?? 0;
  if (rev === 0 && exp === 0 && internal === 0 && !delta.setStepSnapshot) {
    return conglomerate;
  }

  const prev = div.ledger;
  const nextLedger: BusinessDivisionLedger = {
    totalRevenueUsd: prev.totalRevenueUsd + rev,
    totalExpenseUsd: prev.totalExpenseUsd + exp,
    totalInternalCreditsUsd: prev.totalInternalCreditsUsd + internal,
    lastStepRevenueUsd: delta.setStepSnapshot ? rev : prev.lastStepRevenueUsd + rev,
    lastStepExpenseUsd: delta.setStepSnapshot ? exp : prev.lastStepExpenseUsd + exp,
    lastStepNetUsd: delta.setStepSnapshot
      ? rev - exp + internal
      : prev.lastStepNetUsd + rev - exp + internal,
    cycleRevenueUsd: prev.cycleRevenueUsd + rev,
    cycleExpenseUsd: prev.cycleExpenseUsd + exp,
    cycleInternalCreditsUsd: prev.cycleInternalCreditsUsd + internal,
  };

  return {
    ...conglomerate,
    businesses: {
      ...conglomerate.businesses,
      [businessId]: {
        ...div,
        ledger: nextLedger,
      },
    },
  };
}

export function resetDivisionCycleLedgers(conglomerate: ConglomerateState): ConglomerateState {
  const nextBusinesses = { ...conglomerate.businesses };
  for (const id of BUSINESS_ORDER) {
    const div = nextBusinesses[id];
    nextBusinesses[id] = {
      ...div,
      ledger: {
        ...div.ledger,
        cycleRevenueUsd: 0,
        cycleExpenseUsd: 0,
        cycleInternalCreditsUsd: 0,
      },
    };
  }
  return {
    ...conglomerate,
    businesses: nextBusinesses,
  };
}

export function grantAllSixBusinessesForScenario(
  conglomerate: ConglomerateState,
  stepCount = 0
): ConglomerateState {
  const nextBusinesses = { ...conglomerate.businesses };
  for (const id of BUSINESS_ORDER) {
    const cur = nextBusinesses[id];
    nextBusinesses[id] = {
      ...cur,
      status: 'ACTIVE',
      acquiredStep: cur.acquiredStep ?? stepCount,
      recoveryStepsRemaining: 0,
    };
  }
  return {
    ...conglomerate,
    businesses: nextBusinesses,
    hq: {
      ...conglomerate.hq,
      established: true,
      hqLevel: Math.max(1, conglomerate.hq.hqLevel),
    },
    generation: {
      ...conglomerate.generation,
      gen5ExpansionTriggered: true,
      gen5ExpansionStep: conglomerate.generation.gen5ExpansionStep ?? stepCount,
      gen6Unlocked: true,
      gen7ConglomerateUnlocked: true,
      gen7UnlockedStep: conglomerate.generation.gen7UnlockedStep ?? stepCount,
    },
  };
}
