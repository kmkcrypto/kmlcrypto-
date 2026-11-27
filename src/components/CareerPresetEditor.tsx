import { useState } from 'react';
import {
  CHASSIS_PARTS, COMPUTE_PARTS, COOLING_PARTS, FACILITY_TIERS, GPU_PARTS,
  MARKET_REGIME_SPECS, OS_PARTS, POWER_CONTRACTS, PSU_PARTS, RIG_PRESETS, STORAGE_PARTS,
} from '../data/catalog';
import { CORE_COIN_SYMBOLS } from '../data/history';
import { getCareerPresetIssue, saveCareerPreset } from '../engine/presets';
import type { CareerPreset, DifficultyLevel, OnboardingMode } from '../types/game';

const control = 'w-full rounded border border-green-500/30 bg-[#020704] px-2 py-1 font-mono text-xs text-green-100';
const grid = 'grid grid-cols-2 gap-2';
const toOptions = (parts: readonly { id: string; name: string }[]) => parts.map((part) => [part.id, part.name] as const);

interface ChoiceProps {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}

function Choice({ label, value, options, onChange }: ChoiceProps) {
  return (
    <label className="space-y-1">
      <span className="block text-green-200">{label}</span>
      <select className={control} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  );
}

export function CareerPresetEditor({ preset, difficulty, onboardingMode, onSaved, onCancel }: {
  preset: CareerPreset | null;
  difficulty: DifficultyLevel;
  onboardingMode: OnboardingMode;
  onSaved: (preset: CareerPreset) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<CareerPreset>(() => preset ?? {
    id: '', createdAt: '', description: '', name: 'Custom Industrial', difficulty, onboardingMode,
    includeCash: true, startingCash: 25000, includeFacility: true, startingFacilityId: 'fac_garage',
    startingFacilityOwned: true, powerContractId: 'contract_standard', includeMarketRules: true,
    marketRegime: 'ACCUMULATION', operatingCostMult: 1, unlockAllCoins: false, unlockAllResearch: false,
    includeStarterRig: true, starterRigConfig: { ...RIG_PRESETS[0].config, gpuIds: [] },
  });
  const [issue, setIssue] = useState('');
  const change = <K extends keyof CareerPreset>(key: K, value: CareerPreset[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setIssue('');
  };
  const rig = draft.starterRigConfig;
  const changeRig = (update: Partial<CareerPreset['starterRigConfig']>) => change('starterRigConfig', { ...rig, ...update });
  const maxGpus = CHASSIS_PARTS.find((part) => part.id === rig.chassisId)?.maxGpus ?? 0;
  const toggles = [
    ['includeCash', 'Starting cash'], ['includeFacility', 'Starting facility'],
    ['includeMarketRules', 'Market rules'], ['includeStarterRig', 'Custom starter rig'],
  ] as const;
  const rigParts = [
    ['computeId', 'Compute', COMPUTE_PARTS], ['storageId', 'Storage', STORAGE_PARTS],
    ['psuId', 'Power supply', PSU_PARTS], ['coolingId', 'Cooling', COOLING_PARTS], ['osId', 'Operating system', OS_PARTS],
  ] as const;
  return (
    <form className="space-y-3 rounded border border-cyan-500/25 bg-[#030D06] p-3" onSubmit={(event) => {
      event.preventDefault();
      const error = getCareerPresetIssue(draft);
      if (error) { setIssue(error); return; }
      onSaved(saveCareerPreset(draft));
    }}>
      <label className="block">Preset name<input required maxLength={36} className={control} value={draft.name} onChange={(event) => change('name', event.target.value)} /></label>
      <label className="block">Description<input maxLength={160} className={control} value={draft.description} onChange={(event) => change('description', event.target.value)} /></label>
      <div className={grid}>
        <Choice label="Experience mode" value={draft.onboardingMode} options={[['GUIDED', 'Guided'], ['VETERAN', 'Veteran']]} onChange={(value) => change('onboardingMode', value as OnboardingMode)} />
        <Choice label="Difficulty" value={draft.difficulty} options={[['BOOTSTRAP', 'Bootstrap'], ['STANDARD', 'Standard'], ['TYCOON_SANDBOX', 'Venture']]} onChange={(value) => change('difficulty', value as DifficultyLevel)} />
      </div>
      <div className="flex flex-wrap gap-3">
        {toggles.map(([key, label]) => <label key={key}><input type="checkbox" checked={draft[key]} onChange={(event) => change(key, event.target.checked)} /> {label}</label>)}
      </div>
      {draft.includeCash && <label className="block">Cash ($)<input type="number" min="0" className={control} value={draft.startingCash} onChange={(event) => change('startingCash', Number(event.target.value))} /></label>}
      {draft.includeFacility && <div className={grid}>
        <Choice label="Facility" value={draft.startingFacilityId} options={toOptions(FACILITY_TIERS)} onChange={(value) => change('startingFacilityId', value)} />
        <Choice label="Tenure" value={draft.startingFacilityOwned === false ? 'rent' : 'own'} options={[['own', 'Owned'], ['rent', 'Rented']]} onChange={(value) => change('startingFacilityOwned', value === 'own')} />
        <Choice label="Power contract" value={draft.powerContractId} options={toOptions(POWER_CONTRACTS)} onChange={(value) => change('powerContractId', value as CareerPreset['powerContractId'])} />
      </div>}
      {draft.includeMarketRules && <div className={grid}>
        <Choice label="Market regime" value={draft.marketRegime} options={Object.entries(MARKET_REGIME_SPECS).map(([id, spec]) => [id, spec.label])} onChange={(value) => change('marketRegime', value as CareerPreset['marketRegime'])} />
        <label>Operating cost multiplier<input type="number" min="0.1" max="5" step="0.1" className={control} value={draft.operatingCostMult} onChange={(event) => change('operatingCostMult', Number(event.target.value))} /></label>
        <label><input type="checkbox" checked={draft.unlockAllCoins} onChange={(event) => change('unlockAllCoins', event.target.checked)} /> Unlock all coins</label>
        <label><input type="checkbox" checked={draft.unlockAllResearch} onChange={(event) => change('unlockAllResearch', event.target.checked)} /> Unlock all research</label>
      </div>}
      {draft.includeStarterRig && <fieldset className="space-y-2 border-t border-green-500/25 pt-2">
        <legend>Starter hardware</legend>
        <div className={grid}>
          <Choice label="Chassis" value={rig.chassisId} options={toOptions(CHASSIS_PARTS)} onChange={(chassisId) => changeRig({ chassisId })} />
          {rigParts.map(([key, label, options]) => <Choice key={key} label={label} value={rig[key]} options={toOptions(options)} onChange={(value) => changeRig({ [key]: value })} />)}
          <Choice label="Target coin" value={rig.targetCoin} options={CORE_COIN_SYMBOLS.map((coin) => [coin, coin])} onChange={(targetCoin) => changeRig({ targetCoin })} />
          <Choice label="Firmware" value={rig.firmwareProfile ?? 'BALANCED'} options={[['BALANCED', 'Balanced'], ['ECO', 'Eco'], ['TURBO', 'Turbo']]} onChange={(value) => changeRig({ firmwareProfile: value as typeof rig.firmwareProfile })} />
          <label>Clock (%)<input type="number" min="80" max="150" className={control} value={rig.overclockPct} onChange={(event) => changeRig({ overclockPct: Number(event.target.value) })} /></label>
        </div>
        <div className={grid}>
          {rig.gpuIds.map((id, slot) => <Choice key={slot} label={`GPU slot ${slot + 1}`} value={id} options={toOptions(GPU_PARTS)} onChange={(gpuId) => changeRig({ gpuIds: rig.gpuIds.map((old, index) => index === slot ? gpuId : old) })} />)}
        </div>
        <div className="flex gap-3">
          <button type="button" className="text-cyan-200 disabled:opacity-40" disabled={rig.gpuIds.length >= maxGpus} onClick={() => changeRig({ gpuIds: [...rig.gpuIds, GPU_PARTS[0].id] })}>Add GPU</button>
          {rig.gpuIds.length > 0 && <button type="button" className="text-cyan-200" onClick={() => changeRig({ gpuIds: rig.gpuIds.slice(0, -1) })}>Remove last GPU</button>}
        </div>
      </fieldset>}
      {issue && <p role="alert" className="text-rose-300">{issue}</p>}
      <div className="flex gap-3">
        <button type="submit" className="rounded bg-cyan-500 px-3 py-1.5 font-semibold text-[#020804]">{preset ? 'Save Changes' : 'Save Preset'}</button>
        <button type="button" className="text-cyan-200" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
