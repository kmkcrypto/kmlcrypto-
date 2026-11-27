import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Search,
  StepForward,
} from 'lucide-react';
import { COMPUTE_PARTS, GPU_PARTS, STORAGE_PARTS } from '../data/catalog';

interface EducationLandingProps {
  onOpenPortal: () => void;
}

type SimStage = 'THERMAL' | 'POWER' | 'ELECTRICITY' | 'DIFFICULTY';
type CompareCategory = 'COMPUTE' | 'GPU' | 'STORAGE';
type GlossaryTopic = 'ALL' | 'CONSENSUS' | 'HARDWARE' | 'POWER_COOLING';

interface QuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
}

interface GlossaryEntry {
  id: string;
  term: string;
  topic: Exclude<GlossaryTopic, 'ALL'>;
  topicLabel: string;
  summary: string;
  formula?: string;
}

const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'q1',
    prompt:
      'Why does electrical power draw rise faster than clock frequency when overclocking silicon?',
    choices: [
      'Dynamic power scales roughly with voltage squared times frequency (P ~ V^2 * f)',
      'Power supply cables double their resistance above 100 MHz',
      'CPU cache misses consume fixed 400W bursts regardless of load',
    ],
    correctIndex: 0,
    explanation:
      'Increasing frequency usually requires higher core voltage, producing a super-linear rise in heat and wattage.',
  },
  {
    id: 'q2',
    prompt:
      'At which load band do most switched-mode power supplies (PSUs) reach peak conversion efficiency?',
    choices: [
      'Below 10% load to minimize fan RPM',
      'Between 50% and 80% of rated capacity',
      'At 105% continuous overload',
    ],
    correctIndex: 1,
    explanation:
      'PSUs minimize switching and resistive losses in the mid-to-upper load range (roughly 50-80%), avoiding thermal strain.',
  },
  {
    id: 'q3',
    prompt:
      'If a cluster draws 12 kW for IT compute and its cooling/PDU overhead adds 25% extra wall draw, what is its Power Usage Effectiveness (PUE)?',
    choices: [
      '0.80 PUE',
      '1.25 PUE',
      '3.00 PUE',
    ],
    correctIndex: 1,
    explanation:
      'PUE = Total Facility Power / IT Equipment Power = (12 kW * 1.25) / 12 kW = 1.25. Closer to 1.00 means minimal cooling waste.',
  },
  {
    id: 'q4',
    prompt:
      'What happens to per-unit block rewards after a scheduled network halving epoch?',
    choices: [
      'Block subsidy drops by 50%, requiring higher efficiency or market price to sustain margins',
      'Thermal throttling automatically doubles across all active rigs',
      'Power consumption per hash instantly falls by half',
    ],
    correctIndex: 0,
    explanation:
      'Halvings cut the newly issued block reward by 50%, squeezing older hardware with high energy cost per hash (J/TH).',
  },
];

const GLOSSARY_ENTRIES: GlossaryEntry[] = [
  {
    id: 'hashrate',
    term: 'Hash Rate (H/s, MH/s, TH/s)',
    topic: 'CONSENSUS',
    topicLabel: 'Consensus',
    summary:
      'Number of cryptographic digest evaluations a processor performs per second when searching for valid block headers.',
    formula: 'Throughput = Nonces Evaluated / Second',
  },
  {
    id: 'pow',
    term: 'Proof of Work (PoW)',
    topic: 'CONSENSUS',
    topicLabel: 'Consensus',
    summary:
      'Sybil-resistant consensus mechanism requiring verifiable computational energy expenditure so forging chain history is economically prohibitive.',
  },
  {
    id: 'difficulty',
    term: 'Mining Difficulty & Halving',
    topic: 'CONSENSUS',
    topicLabel: 'Consensus',
    summary:
      'Dynamic target threshold adjusting inversely to global network hashrate to preserve fixed block intervals, paired with periodic 50% issuance halvings.',
    formula: 'Expected Share = Node Hash / Network Difficulty',
  },
  {
    id: 'pools',
    term: 'Mining Pools (PPS vs. PPLNS vs. Solo)',
    topic: 'CONSENSUS',
    topicLabel: 'Consensus',
    summary:
      'Pay-Per-Share (PPS) smooths variance into predictable step payouts; PPLNS rewards window loyalty; Solo mining concentrates full block reward variance onto one operator.',
  },
  {
    id: 'asic',
    term: 'ASIC (Application-Specific Integrated Circuit)',
    topic: 'HARDWARE',
    topicLabel: 'Hardware',
    summary:
      'Custom silicon hardwired for one hash pipeline (e.g. SHA-256 or Scrypt), achieving orders-of-magnitude higher hashes per watt than general-purpose processors.',
  },
  {
    id: 'gpu',
    term: 'GPU (Graphics Processing Unit)',
    topic: 'HARDWARE',
    topicLabel: 'Hardware',
    summary:
      'Massively parallel SIMD vector architecture suited to memory-hard algorithms like Ethash where high VRAM bandwidth matters more than raw integer pipelines.',
  },
  {
    id: 'fpga',
    term: 'FPGA (Field-Programmable Gate Array)',
    topic: 'HARDWARE',
    topicLabel: 'Hardware',
    summary:
      'Reconfigurable logic fabric programmed via bitstreams. Bridges flexible GPU rigs and fixed custom ASIC tape-outs during architectural transitions.',
  },
  {
    id: 'pue',
    term: 'Power Consumption & PUE',
    topic: 'POWER_COOLING',
    topicLabel: 'Power & Cooling',
    summary:
      'Total electricity draw equals compute silicon watts divided by PSU efficiency plus cooling overhead. PUE measures facility overhead above raw compute load.',
    formula: 'Daily Cost = (Wall kW * Hours) * $/kWh',
  },
  {
    id: 'throttling',
    term: 'Thermal Throttling & Equilibrium',
    topic: 'POWER_COOLING',
    topicLabel: 'Power & Cooling',
    summary:
      'Automated clock-frequency cutbacks triggered past thermal ceilings (typically 80–85°C) to protect VRMs, solder joints, and silicon longevity.',
    formula: 'T_eq = T_ambient + HeatLoad - CoolingCapacity',
  },
  {
    id: 'jth',
    term: 'Hardware Efficiency (J/TH) & Depreciation',
    topic: 'HARDWARE',
    topicLabel: 'Hardware',
    summary:
      'Energy efficiency expressed as Joules per Terahash (Watts / TH/s). Lower J/TH keeps machines profitable longer as difficulty rises and resale value depreciates with age.',
    formula: 'Efficiency (J/TH) = Wall Watts / Output TH/s',
  },
];

function formatPrimaryThroughput(
  kind: CompareCategory,
  item: (typeof COMPUTE_PARTS)[number] | (typeof GPU_PARTS)[number] | (typeof STORAGE_PARTS)[number]
): { label: string; value: number; unit: string; jPerUnitLabel: string } {
  if (kind === 'STORAGE') {
    const s = item as (typeof STORAGE_PARTS)[number];
    const tbPerWatt = s.watts > 0 ? (s.storageTb / s.watts).toFixed(2) : '0.00';
    return {
      label: `${s.storageTb} TB · ${s.ramGb} GB RAM`,
      value: s.storageTb,
      unit: 'TB',
      jPerUnitLabel: `${tbPerWatt} TB/W`,
    };
  }
  const hashes = (item as (typeof COMPUTE_PARTS)[number] | (typeof GPU_PARTS)[number]).hashrates;
  if (hashes.SHA256 && hashes.SHA256 >= 1000) {
    const th = hashes.SHA256 / 1_000_000;
    const label = th >= 1 ? `${th.toFixed(1)} TH/s (SHA-256)` : `${hashes.SHA256.toLocaleString()} MH/s (SHA-256)`;
    const eff = th >= 0.1 ? `${(item.watts / th).toFixed(1)} J/TH` : `${(item.watts / Math.max(1, hashes.SHA256)).toFixed(2)} W/MH`;
    return { label, value: hashes.SHA256, unit: 'MH/s', jPerUnitLabel: eff };
  }
  if (hashes.ETHASH && hashes.ETHASH > 0) {
    return {
      label: `${hashes.ETHASH} MH/s (Ethash)`,
      value: hashes.ETHASH,
      unit: 'MH/s',
      jPerUnitLabel: `${(item.watts / hashes.ETHASH).toFixed(2)} W/MH`,
    };
  }
  if (hashes.SCRYPT && hashes.SCRYPT >= 10) {
    return {
      label: `${hashes.SCRYPT.toLocaleString()} MH/s (Scrypt)`,
      value: hashes.SCRYPT,
      unit: 'MH/s',
      jPerUnitLabel: `${(item.watts / hashes.SCRYPT).toFixed(2)} W/MH`,
    };
  }
  const rx = hashes.RANDOMX ?? hashes.SHA256 ?? 0;
  return {
    label: `${(rx * 1000).toFixed(2)} kH/s (RandomX)`,
    value: rx * 1000,
    unit: 'kH/s',
    jPerUnitLabel: rx > 0 ? `${(item.watts / (rx * 1000)).toFixed(1)} W/kH` : 'N/A',
  };
}

export const EducationLanding: React.FC<EducationLandingProps> = ({ onOpenPortal }) => {
  const [stage, setStage] = useState<SimStage>('THERMAL');
  const [clockPct, setClockPct] = useState<number>(105);
  const [ambientC, setAmbientC] = useState<number>(22);
  const [airflowCfm, setAirflowCfm] = useState<number>(55);
  const [difficultyMult, setDifficultyMult] = useState<number>(1.0);
  const [epochCount, setEpochCount] = useState<number>(0);

  // Stage 3: Electricity & Cost Lab state
  const [fleetLoadKw, setFleetLoadKw] = useState<number>(8.5);
  const [coolingOverheadPct, setCoolingOverheadPct] = useState<number>(18);
  const [elecRateKwh, setElecRateKwh] = useState<number>(0.095);
  const [dutyHours, setDutyHours] = useState<number>(24);

  // Hardware Comparator state
  const [compareCat, setCompareCat] = useState<CompareCategory>('COMPUTE');
  const [leftPartId, setLeftPartId] = useState<string>(COMPUTE_PARTS[2]?.id ?? COMPUTE_PARTS[0].id);
  const [rightPartId, setRightPartId] = useState<string>(
    COMPUTE_PARTS.find((c) => c.id === 'asic_s19_pro')?.id ?? COMPUTE_PARTS[COMPUTE_PARTS.length - 1].id
  );

  // Glossary Search & Filter
  const [glossaryQuery, setGlossaryQuery] = useState<string>('');
  const [glossaryTopic, setGlossaryTopic] = useState<GlossaryTopic>('ALL');

  // Quiz state
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<boolean>(false);

  const model = useMemo(() => {
    const fRatio = clockPct / 100;
    const baseWatts = 240;
    const rawLoadWatts = Math.round(baseWatts * Math.pow(fRatio, 1.55));
    const psuCapWatts = 550;
    const psuLoadPct = Math.min(115, Math.round((rawLoadWatts / psuCapWatts) * 100));
    const psuEfficiency =
      psuLoadPct < 20
        ? 0.82
        : psuLoadPct <= 80
        ? 0.91 - Math.abs(psuLoadPct - 55) * 0.0008
        : 0.85;
    const wallWatts = Math.round(rawLoadWatts / psuEfficiency);

    const coolingDelta = Math.max(8, airflowCfm * 0.62);
    const thermalRise = (rawLoadWatts / coolingDelta) * 5.8;
    const coreTempC = Math.round(ambientC + thermalRise);
    const isThrottled = coreTempC > 82;
    const throttlePenalty = isThrottled ? Math.max(0.45, 1 - (coreTempC - 82) * 0.03) : 1;

    const effectiveHash = Math.round(100 * fRatio * throttlePenalty);
    const epochHalvingScale = Math.pow(0.5, Math.floor(epochCount / 4));
    const relativeYield = Number(
      (((effectiveHash / 100) * epochHalvingScale) / difficultyMult).toFixed(2)
    );

    const pueRatio = 1 + coolingOverheadPct / 100;
    const totalFacilityKw = fleetLoadKw * pueRatio;
    const coolingKw = totalFacilityKw - fleetLoadKw;
    const dailyKwh = totalFacilityKw * dutyHours;
    const dailyPowerCostUsd = dailyKwh * elecRateKwh;
    const cycle30CostUsd = dailyPowerCostUsd * 30;
    const annualPowerCostUsd = dailyPowerCostUsd * 365;

    return {
      rawLoadWatts,
      psuLoadPct,
      psuEfficiencyPct: Math.round(psuEfficiency * 100),
      wallWatts,
      coreTempC,
      isThrottled,
      effectiveHash,
      epochHalvingScale,
      relativeYield,
      pueRatio,
      totalFacilityKw,
      coolingKw,
      dailyKwh,
      dailyPowerCostUsd,
      cycle30CostUsd,
      annualPowerCostUsd,
    };
  }, [
    clockPct,
    ambientC,
    airflowCfm,
    difficultyMult,
    epochCount,
    fleetLoadKw,
    coolingOverheadPct,
    elecRateKwh,
    dutyHours,
  ]);

  const chartPoints = useMemo(() => {
    const pts: { x: number; y: number; label: string }[] = [];
    if (stage === 'THERMAL') {
      for (let c = 80; c <= 150; c += 10) {
        const f = c / 100;
        const w = 240 * Math.pow(f, 1.55);
        const temp = ambientC + (w / Math.max(8, airflowCfm * 0.62)) * 5.8;
        pts.push({ x: c, y: Math.min(115, temp), label: `${c}%` });
      }
    } else if (stage === 'POWER') {
      for (let c = 80; c <= 150; c += 10) {
        const f = c / 100;
        const w = 240 * Math.pow(f, 1.55);
        pts.push({ x: c, y: Math.min(620, w), label: `${c}%` });
      }
    } else if (stage === 'ELECTRICITY') {
      for (let kw = 2; kw <= 40; kw += 4) {
        const daily = kw * (1 + coolingOverheadPct / 100) * dutyHours * elecRateKwh;
        pts.push({ x: kw, y: daily, label: `${kw}kW` });
      }
    } else {
      for (let d = 0.5; d <= 3.0; d += 0.5) {
        const yld = ((model.effectiveHash / 100) * model.epochHalvingScale) / d;
        pts.push({ x: d, y: yld, label: `${d.toFixed(1)}x` });
      }
    }
    return pts;
  }, [
    stage,
    ambientC,
    airflowCfm,
    coolingOverheadPct,
    dutyHours,
    elecRateKwh,
    model.effectiveHash,
    model.epochHalvingScale,
  ]);

  const maxChartY = useMemo(() => {
    if (stage === 'THERMAL') return 115;
    if (stage === 'POWER') return 600;
    if (stage === 'ELECTRICITY') {
      const peak = Math.max(
        60,
        ...chartPoints.map((p) => p.y),
        model.dailyPowerCostUsd * 1.15
      );
      return peak;
    }
    return 2.2;
  }, [stage, chartPoints, model.dailyPowerCostUsd]);

  const svgPath = useMemo(() => {
    if (chartPoints.length === 0) return '';
    const w = 520;
    const h = 210;
    const padX = 44;
    const padY = 22;
    const minX = chartPoints[0].x;
    const maxX = chartPoints[chartPoints.length - 1].x;

    return chartPoints
      .map((p, i) => {
        const px = padX + ((p.x - minX) / Math.max(0.001, maxX - minX)) * (w - padX * 2);
        const py = h - padY - (Math.min(maxChartY, p.y) / maxChartY) * (h - padY * 2);
        return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
      })
      .join(' ');
  }, [chartPoints, maxChartY]);

  const activeMarker = useMemo(() => {
    const w = 520;
    const h = 210;
    const padX = 44;
    const padY = 22;
    const minX = stage === 'DIFFICULTY' ? 0.5 : stage === 'ELECTRICITY' ? 2 : 80;
    const maxX = stage === 'DIFFICULTY' ? 3.0 : stage === 'ELECTRICITY' ? 40 : 150;

    const valX =
      stage === 'DIFFICULTY'
        ? difficultyMult
        : stage === 'ELECTRICITY'
        ? fleetLoadKw
        : clockPct;
    const valY =
      stage === 'THERMAL'
        ? model.coreTempC
        : stage === 'POWER'
        ? model.rawLoadWatts
        : stage === 'ELECTRICITY'
        ? model.dailyPowerCostUsd
        : model.relativeYield;

    const px = padX + ((valX - minX) / Math.max(0.001, maxX - minX)) * (w - padX * 2);
    const py = h - padY - (Math.min(maxChartY, valY) / maxChartY) * (h - padY * 2);
    return { px, py };
  }, [stage, difficultyMult, fleetLoadKw, clockPct, model, maxChartY]);

  const compareItems = useMemo(() => {
    return compareCat === 'COMPUTE'
      ? COMPUTE_PARTS
      : compareCat === 'GPU'
      ? GPU_PARTS
      : STORAGE_PARTS;
  }, [compareCat]);

  const leftPart =
    compareItems.find((i) => i.id === leftPartId) ?? compareItems[0];
  const rightPart =
    compareItems.find((i) => i.id === rightPartId) ??
    compareItems[Math.min(1, compareItems.length - 1)];

  const leftMetrics = formatPrimaryThroughput(compareCat, leftPart);
  const rightMetrics = formatPrimaryThroughput(compareCat, rightPart);

  const handleCategorySwitch = (cat: CompareCategory) => {
    setCompareCat(cat);
    const list =
      cat === 'COMPUTE' ? COMPUTE_PARTS : cat === 'GPU' ? GPU_PARTS : STORAGE_PARTS;
    setLeftPartId(list[0].id);
    setRightPartId(list[Math.min(list.length - 1, Math.max(1, Math.floor(list.length / 2)))].id);
  };

  const filteredGlossary = useMemo(() => {
    const q = glossaryQuery.trim().toLowerCase();
    return GLOSSARY_ENTRIES.filter((entry) => {
      if (glossaryTopic !== 'ALL' && entry.topic !== glossaryTopic) return false;
      if (!q) return true;
      return (
        entry.term.toLowerCase().includes(q) ||
        entry.summary.toLowerCase().includes(q) ||
        (entry.formula?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [glossaryQuery, glossaryTopic]);

  const resetLab = () => {
    setClockPct(105);
    setAmbientC(22);
    setAirflowCfm(55);
    setDifficultyMult(1.0);
    setEpochCount(0);
    setFleetLoadKw(8.5);
    setCoolingOverheadPct(18);
    setElecRateKwh(0.095);
    setDutyHours(24);
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const quizScore = QUIZ_QUESTIONS.reduce(
    (acc, q) => (answers[q.id] === q.correctIndex ? acc + 1 : acc),
    0
  );

  return (
    <div className="relative min-h-screen bg-[#F8FAFC] text-slate-900">
      {/* 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-6 py-4">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            OpenCourse Computing
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => scrollTo('sandbox')}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Mining Lab
            </button>
            <button
              type="button"
              onClick={() => scrollTo('compare')}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Hardware Compare
            </button>
            <button
              type="button"
              onClick={() => scrollTo('curriculum')}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Curriculum
            </button>
            <button
              type="button"
              onClick={() => scrollTo('formulas')}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Glossary
            </button>
            <button
              type="button"
              onClick={() => scrollTo('quiz')}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Self-Check
            </button>
          </nav>

          <button
            type="button"
            onClick={() => scrollTo('quiz')}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            Take Concept Quiz
          </button>
        </div>
      </header>

      <main id="top" className="max-w-[1200px] mx-auto px-6 py-10 space-y-14">
        {/* Focused Editorial Header */}
        <section className="max-w-3xl space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            <span>Course CS-304</span>
            <span aria-hidden="true">·</span>
            <span>Hardware Architecture &amp; Distributed Systems</span>
            <span aria-hidden="true">·</span>
            <span>Interactive Mining Lab</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
            Power Scaling, Thermal Limits &amp; Mining Economics
          </h1>
          <p className="text-base text-slate-600 leading-relaxed">
            Explore how silicon clock scaling, cooling airflow, electricity contracts, and
            network difficulty govern modern proof-of-work and proof-of-space compute clusters.
          </p>
        </section>

        {/* Two-Zone Educational Simulation Sandbox */}
        <section id="sandbox" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-200/75">
              {(
                [
                  { id: 'THERMAL', label: '1. Thermal Equilibrium' },
                  { id: 'POWER', label: '2. Power & PSU Curve' },
                  { id: 'ELECTRICITY', label: '3. Electricity & Cost Lab' },
                  { id: 'DIFFICULTY', label: '4. Epoch & Difficulty' },
                ] as { id: SimStage; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStage(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    stage === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEpochCount((c) => c + 1)}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <StepForward className="w-3.5 h-3.5 text-sky-600" />
                <span>Step Epoch ({epochCount})</span>
              </button>
              <button
                type="button"
                onClick={resetLab}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Reset Lab</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Zone: Interactive Curve Stage */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-slate-900">
                    {stage === 'THERMAL'
                      ? 'Silicon Core Temperature vs. Clock Multiplier'
                      : stage === 'POWER'
                      ? 'Dynamic Component Load vs. Clock Multiplier'
                      : stage === 'ELECTRICITY'
                      ? 'Daily Electricity Spend vs. Fleet Compute Load'
                      : 'Relative Compute Yield vs. Network Difficulty'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {stage === 'THERMAL'
                      ? 'Throttling begins above the 82°C thermal envelope.'
                      : stage === 'POWER'
                      ? 'Optimal PSU conversion occurs between 50% and 80% load.'
                      : stage === 'ELECTRICITY'
                      ? 'Total wall spend scales with PUE cooling overhead, duty hours, and tariff $/kWh.'
                      : 'Halving triggers every 4 epochs; higher difficulty dilutes per-node share.'}
                  </p>
                </div>

                {stage === 'ELECTRICITY' ? (
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 whitespace-nowrap shrink-0 tabular-nums">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>PUE {model.pueRatio.toFixed(2)}</span>
                  </div>
                ) : (
                  <div
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap shrink-0 ${
                      model.isThrottled ? 'text-rose-600' : 'text-emerald-700'
                    }`}
                  >
                    {model.isThrottled ? (
                      <>
                        <AlertTriangle className="w-4 h-4" />
                        <span>THROTTLED</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>NOMINAL</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <svg
                  viewBox="0 0 520 210"
                  className="w-full h-52 overflow-visible"
                  role="img"
                  aria-label="Interactive system response curve"
                >
                  {[40, 80, 120, 160].map((yPos) => (
                    <line
                      key={yPos}
                      x1="44"
                      y1={yPos}
                      x2="476"
                      y2={yPos}
                      stroke="#E2E8F0"
                      strokeDasharray="3 3"
                    />
                  ))}
                  <line x1="44" y1="22" x2="44" y2="188" stroke="#94A3B8" strokeWidth="1.2" />
                  <line x1="44" y1="188" x2="476" y2="188" stroke="#94A3B8" strokeWidth="1.2" />

                  {stage === 'THERMAL' && (
                    <>
                      <line
                        x1="44"
                        y1={188 - (82 / 115) * 166}
                        x2="476"
                        y2={188 - (82 / 115) * 166}
                        stroke="#DC2626"
                        strokeWidth="1.2"
                        strokeDasharray="5 4"
                      />
                      <text
                        x="382"
                        y={188 - (82 / 115) * 166 - 6}
                        fill="#DC2626"
                        fontSize="10"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        82°C Limit
                      </text>
                    </>
                  )}

                  <path
                    d={svgPath}
                    fill="none"
                    stroke="#0284C7"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />

                  <circle
                    cx={activeMarker.px}
                    cy={activeMarker.py}
                    r="6"
                    fill={
                      stage === 'ELECTRICITY'
                        ? '#0284C7'
                        : model.isThrottled
                        ? '#DC2626'
                        : '#059669'
                    }
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />

                  <text
                    x="260"
                    y="204"
                    textAnchor="middle"
                    fill="#64748B"
                    fontSize="10"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    {stage === 'DIFFICULTY'
                      ? 'Network Difficulty (0.5x — 3.0x)'
                      : stage === 'ELECTRICITY'
                      ? 'Fleet Compute Load (2 kW — 40 kW)'
                      : 'Clock Scale (80% — 150%)'}
                  </text>
                  <text
                    x="14"
                    y="105"
                    textAnchor="middle"
                    fill="#64748B"
                    fontSize="10"
                    transform="rotate(-90 14 105)"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    {stage === 'THERMAL'
                      ? 'Temp (°C)'
                      : stage === 'POWER'
                      ? 'Watts (W)'
                      : stage === 'ELECTRICITY'
                      ? 'Daily Cost ($)'
                      : 'Yield Index'}
                  </text>
                </svg>
              </div>

              {/* Live Metrics Strip */}
              {stage === 'ELECTRICITY' ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
                  <div>
                    <div className="text-xs text-slate-500">Total Wall Draw</div>
                    <div className="font-mono text-lg font-semibold tabular-nums text-slate-900 mt-0.5">
                      {model.totalFacilityKw.toFixed(2)} kW
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Cooling Overhead</div>
                    <div className="font-mono text-lg font-semibold tabular-nums text-slate-900 mt-0.5">
                      +{model.coolingKw.toFixed(2)} kW
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Daily Power Bill</div>
                    <div className="font-mono text-lg font-semibold tabular-nums text-sky-700 mt-0.5">
                      ${model.dailyPowerCostUsd.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">30-Step Cycle / Annual</div>
                    <div className="font-mono text-sm font-semibold tabular-nums text-slate-900 mt-1">
                      ${Math.round(model.cycle30CostUsd).toLocaleString()} / $
                      {Math.round(model.annualPowerCostUsd).toLocaleString()}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
                  <div>
                    <div className="text-xs text-slate-500">Core Temperature</div>
                    <div
                      className={`font-mono text-lg font-semibold tabular-nums mt-0.5 ${
                        model.isThrottled ? 'text-rose-600' : 'text-slate-900'
                      }`}
                    >
                      {model.coreTempC}°C
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Wall Power Draw</div>
                    <div className="font-mono text-lg font-semibold tabular-nums text-slate-900 mt-0.5">
                      {model.wallWatts} W
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">PSU Efficiency</div>
                    <div className="font-mono text-lg font-semibold tabular-nums text-slate-900 mt-0.5">
                      {model.psuEfficiencyPct}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Effective Yield</div>
                    <div className="font-mono text-lg font-semibold tabular-nums text-sky-700 mt-0.5">
                      {model.relativeYield.toFixed(2)}x
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Zone: Parameter Controls & Equations */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-6">
              {stage === 'ELECTRICITY' ? (
                <div className="space-y-5">
                  <h2 className="font-display text-lg font-semibold text-slate-900">
                    Facility Tariff Variables
                  </h2>

                  <label className="block space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">Fleet Compute Load</span>
                      <span className="font-mono tabular-nums text-slate-900 font-semibold">
                        {fleetLoadKw.toFixed(1)} kW
                      </span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={40}
                      step={0.5}
                      value={fleetLoadKw}
                      onChange={(e) => setFleetLoadKw(Number(e.target.value))}
                      className="w-full accent-sky-600 cursor-pointer"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">Cooling &amp; PDU Overhead</span>
                      <span className="font-mono tabular-nums text-slate-900 font-semibold">
                        +{coolingOverheadPct}% (PUE {(1 + coolingOverheadPct / 100).toFixed(2)})
                      </span>
                    </div>
                    <input
                      type="range"
                      min={4}
                      max={50}
                      step={2}
                      value={coolingOverheadPct}
                      onChange={(e) => setCoolingOverheadPct(Number(e.target.value))}
                      className="w-full accent-sky-600 cursor-pointer"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">Electricity Contract Rate</span>
                      <span className="font-mono tabular-nums text-slate-900 font-semibold">
                        ${elecRateKwh.toFixed(3)} / kWh
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.035}
                      max={0.22}
                      step={0.005}
                      value={elecRateKwh}
                      onChange={(e) => setElecRateKwh(Number(e.target.value))}
                      className="w-full accent-sky-600 cursor-pointer"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">Daily Duty Cycle</span>
                      <span className="font-mono tabular-nums text-slate-900 font-semibold">
                        {dutyHours} hrs / day
                      </span>
                    </div>
                    <input
                      type="range"
                      min={6}
                      max={24}
                      step={1}
                      value={dutyHours}
                      onChange={(e) => setDutyHours(Number(e.target.value))}
                      className="w-full accent-sky-600 cursor-pointer"
                    />
                  </label>
                </div>
              ) : (
                <div className="space-y-5">
                  <h2 className="font-display text-lg font-semibold text-slate-900">
                    Interactive Variables
                  </h2>

                  <label className="block space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">Clock Multiplier</span>
                      <span className="font-mono tabular-nums text-slate-900 font-semibold">
                        {clockPct}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={80}
                      max={150}
                      step={5}
                      value={clockPct}
                      onChange={(e) => setClockPct(Number(e.target.value))}
                      className="w-full accent-sky-600 cursor-pointer"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">Ambient Room Temperature</span>
                      <span className="font-mono tabular-nums text-slate-900 font-semibold">
                        {ambientC}°C
                      </span>
                    </div>
                    <input
                      type="range"
                      min={12}
                      max={38}
                      step={1}
                      value={ambientC}
                      onChange={(e) => setAmbientC(Number(e.target.value))}
                      className="w-full accent-sky-600 cursor-pointer"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">Coolant Airflow</span>
                      <span className="font-mono tabular-nums text-slate-900 font-semibold">
                        {airflowCfm} CFM
                      </span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={120}
                      step={5}
                      value={airflowCfm}
                      onChange={(e) => setAirflowCfm(Number(e.target.value))}
                      className="w-full accent-sky-600 cursor-pointer"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">Network Difficulty</span>
                      <span className="font-mono tabular-nums text-slate-900 font-semibold">
                        {difficultyMult.toFixed(1)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={3.0}
                      step={0.1}
                      value={difficultyMult}
                      onChange={(e) => setDifficultyMult(Number(e.target.value))}
                      className="w-full accent-sky-600 cursor-pointer"
                    />
                  </label>
                </div>
              )}

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="text-xs font-semibold text-slate-700">Governing Model</div>
                <div className="font-mono text-xs text-slate-800 bg-white border border-slate-200 rounded px-3 py-2">
                  {stage === 'ELECTRICITY'
                    ? 'Cost_day = kW_compute * PUE * Hours * Rate_kWh'
                    : 'P_wall = (P_base * (f / f_0)^1.55) / eta_psu'}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {stage === 'ELECTRICITY'
                    ? `Consuming ${model.dailyKwh.toFixed(1)} kWh/day across compute and HVAC (${model.pueRatio.toFixed(
                        2
                      )} PUE). Negotiating wholesale rates to $0.05/kWh saves $${Math.max(
                        0,
                        Math.round(model.dailyKwh * (elecRateKwh - 0.05) * 30)
                      ).toLocaleString()} per 30-step cycle.`
                    : model.isThrottled
                    ? `Core temperature reached ${model.coreTempC}°C (>82°C). Raise coolant airflow or lower clock scale to prevent thermal throttling.`
                    : `System operating inside safe thermal headroom (${model.coreTempC}°C) at ${model.psuLoadPct}% PSU load (${model.epochHalvingScale}x subsidy).`}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Side-by-Side Hardware Comparison Tool */}
        <section id="compare" className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-900">
                Hardware Architecture Comparator
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Benchmark purchase cost, wattage, thermal heat load, acoustic footprint, and efficiency across hardware generations.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100">
              {(
                [
                  { id: 'COMPUTE', label: 'CPUs / FPGAs / ASICs' },
                  { id: 'GPU', label: 'GPUs' },
                  { id: 'STORAGE', label: 'Storage Arrays' },
                ] as { id: CompareCategory; label: string }[]
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleCategorySwitch(cat.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    compareCat === cat.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Configuration A</span>
              <select
                value={leftPart.id}
                onChange={(e) => setLeftPartId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-sky-600"
              >
                {compareItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} (Gen {item.generation ?? 1} · ${item.cost.toLocaleString()})
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Configuration B</span>
              <select
                value={rightPart.id}
                onChange={(e) => setRightPartId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-sky-600"
              >
                {compareItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} (Gen {item.generation ?? 1} · ${item.cost.toLocaleString()})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Specification</th>
                  <th className="py-3 px-4 text-slate-900">{leftPart.name}</th>
                  <th className="py-3 px-4 text-slate-900">{rightPart.name}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-3 px-4 font-medium text-slate-600">Era &amp; Silicon Gen</td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-900">
                    {leftPart.era} · Gen {leftPart.generation ?? 1}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-900">
                    {rightPart.era} · Gen {rightPart.generation ?? 1}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-slate-600">Purchase Price</td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-900">
                    ${leftPart.cost.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-900">
                    ${rightPart.cost.toLocaleString()}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-slate-600">Primary Output</td>
                  <td className="py-3 px-4 font-mono tabular-nums text-sky-700 font-semibold">
                    {leftMetrics.label}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-sky-700 font-semibold">
                    {rightMetrics.label}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-slate-600">Power Draw &amp; Efficiency</td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-900">
                    {leftPart.watts} W · {leftMetrics.jPerUnitLabel}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-900">
                    {rightPart.watts} W · {rightMetrics.jPerUnitLabel}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-slate-600">Thermal &amp; Acoustic Load</td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-900">
                    +{leftPart.heatC}°C heat ·{' '}
                    {'noiseDba' in leftPart ? `${leftPart.noiseDba} dBA` : 'Passive array'}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-900">
                    +{rightPart.heatC}°C heat ·{' '}
                    {'noiseDba' in rightPart ? `${rightPart.noiseDba} dBA` : 'Passive array'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Curriculum Modules */}
        <section id="curriculum" className="space-y-5">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900">
              Core Curriculum Modules
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Foundational engineering principles behind compute clusters and ledger verification.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <article className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5">
              <div className="text-xs text-slate-500">Module 01 · Consensus Mechanics</div>
              <h3 className="font-display text-lg font-semibold text-slate-900">
                01. Proof-of-Work &amp; Difficulty Adjustments
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Nodes compute repeated cryptographic digests to find a value below a target
                threshold. As total network hash rate rises, difficulty scales up to preserve steady
                block intervals.
              </p>
            </article>

            <article className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5">
              <div className="text-xs text-slate-500">Module 02 · Electrical Engineering</div>
              <h3 className="font-display text-lg font-semibold text-slate-900">
                02. Power Delivery &amp; PUE Economics
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Every AC-to-DC power supply and cooling chiller adds overhead above raw compute load.
                Matching contract kW limits, PSU efficiency bands, and low $/kWh tariffs drives net margin.
              </p>
            </article>

            <article className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5">
              <div className="text-xs text-slate-500">Module 03 · Thermodynamics</div>
              <h3 className="font-display text-lg font-semibold text-slate-900">
                03. Heat Flux &amp; Thermal Equilibrium
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Virtually 100% of electrical energy delivered to compute boards becomes thermal
                energy. Steady-state temperature depends on intake ambient plus active cooling airflow.
              </p>
            </article>
          </div>
        </section>

        {/* Searchable & Topic-Filterable Reference Glossary */}
        <section id="formulas" className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900">
                Reference Terminology &amp; Equations ({filteredGlossary.length} / {GLOSSARY_ENTRIES.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Filter core systems terms across consensus, silicon hardware, and thermodynamics.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={glossaryQuery}
                  onChange={(e) => setGlossaryQuery(e.target.value)}
                  placeholder="Search terms..."
                  aria-label="Search glossary terms"
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-sky-600 w-44"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100">
                {(
                  [
                    { id: 'ALL', label: 'All' },
                    { id: 'CONSENSUS', label: 'Consensus' },
                    { id: 'HARDWARE', label: 'Hardware' },
                    { id: 'POWER_COOLING', label: 'Power & Cooling' },
                  ] as { id: GlossaryTopic; label: string }[]
                ).map((topic) => (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => setGlossaryTopic(topic.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      glossaryTopic === topic.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {topic.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredGlossary.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">
              No matching concepts found for &ldquo;{glossaryQuery}&rdquo;.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-4">
              {filteredGlossary.map((entry) => (
                <div key={entry.id} className="py-2.5 border-b border-slate-100 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900">{entry.term}</div>
                    <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap shrink-0">
                      {entry.topicLabel}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{entry.summary}</p>
                  {entry.formula && (
                    <div className="font-mono text-[11px] text-sky-800 bg-slate-50 border border-slate-200 rounded px-2.5 py-1 inline-block mt-1">
                      {entry.formula}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Interactive Comprehension Check */}
        <section id="quiz" className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900">
                Concept Comprehension Check
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Verify your understanding of thermal limits, PSU efficiency, PUE, and network halvings.
              </p>
            </div>
            {quizSubmitted && (
              <div className="font-mono text-sm font-semibold text-sky-700 tabular-nums">
                Score: {quizScore} / {QUIZ_QUESTIONS.length}
              </div>
            )}
          </div>

          <div className="space-y-6">
            {QUIZ_QUESTIONS.map((q, idx) => (
              <div
                key={q.id}
                className="space-y-2.5 pb-5 border-b border-slate-100 last:border-b-0 last:pb-0"
              >
                <div className="text-sm font-semibold text-slate-900">
                  {idx + 1}. {q.prompt}
                </div>
                <div className="space-y-2">
                  {q.choices.map((choice, cIdx) => {
                    const selected = answers[q.id] === cIdx;
                    const isRight = cIdx === q.correctIndex;
                    let cls =
                      'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700';
                    if (quizSubmitted) {
                      if (isRight) {
                        cls = 'border-emerald-300 bg-emerald-50 text-emerald-900 font-medium';
                      } else if (selected && !isRight) {
                        cls = 'border-rose-300 bg-rose-50 text-rose-900';
                      }
                    } else if (selected) {
                      cls = 'border-sky-500 bg-sky-50 text-sky-900 font-medium';
                    }
                    return (
                      <button
                        key={choice}
                        type="button"
                        onClick={() => {
                          setAnswers((prev) => ({ ...prev, [q.id]: cIdx }));
                          setQuizSubmitted(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 rounded-lg border text-xs transition-colors ${cls}`}
                      >
                        {choice}
                      </button>
                    );
                  })}
                </div>
                {quizSubmitted && (
                  <p className="text-xs text-slate-600 pt-1">{q.explanation}</p>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setQuizSubmitted(true)}
              className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              Check Answers
            </button>
            <button
              type="button"
              onClick={() => {
                setAnswers({});
                setQuizSubmitted(false);
              }}
              className="px-4 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            >
              Clear
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12 px-6 py-6">
        <div className="max-w-[1200px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>OpenCourse Computing Commons · Hardware &amp; Distributed Systems Curriculum</span>
          <span>Module 4 Study Guide</span>
        </div>
      </footer>

      {/* Nondescript Corner Entry Button leading to the Matrix Title Menu & Game */}
      <button
        type="button"
        onClick={onOpenPortal}
        title="System Console"
        aria-label="Open system console"
        className="fixed bottom-4 right-4 z-30 px-3 py-2 min-h-[40px] rounded-md bg-white/95 hover:bg-slate-100 border border-slate-200 text-slate-400 hover:text-slate-700 font-mono text-[11px] tracking-tight shadow-xs transition-colors whitespace-nowrap shrink-0"
      >
        Sys · v2.4
      </button>
    </div>
  );
};
