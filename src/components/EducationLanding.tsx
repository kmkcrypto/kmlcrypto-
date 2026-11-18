import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw, StepForward } from 'lucide-react';

interface EducationLandingProps {
  onOpenPortal: () => void;
}

type SimStage = 'THERMAL' | 'POWER' | 'DIFFICULTY';

interface QuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
}

const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'q1',
    prompt: 'Why does electrical power draw rise faster than clock frequency when overclocking silicon?',
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
    prompt: 'At which load band do most switched-mode power supplies (PSUs) reach peak conversion efficiency?',
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
    prompt: 'What happens to per-unit block rewards after a scheduled network halving epoch?',
    choices: [
      'Block subsidy drops by 50%, requiring higher efficiency or market price to sustain margins',
      'Thermal throttling automatically doubles across all active rigs',
      'Power consumption per hash instantly falls by half',
    ],
    correctIndex: 0,
    explanation:
      'Halvings cut the newly issued block reward by 50%, squeezing older hardware with high energy cost per hash.',
  },
];

export const EducationLanding: React.FC<EducationLandingProps> = ({ onOpenPortal }) => {
  const [stage, setStage] = useState<SimStage>('THERMAL');
  const [clockPct, setClockPct] = useState<number>(105);
  const [ambientC, setAmbientC] = useState<number>(22);
  const [airflowCfm, setAirflowCfm] = useState<number>(55);
  const [difficultyMult, setDifficultyMult] = useState<number>(1.0);
  const [epochCount, setEpochCount] = useState<number>(0);

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
    };
  }, [clockPct, ambientC, airflowCfm, difficultyMult, epochCount]);

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
    } else {
      for (let d = 0.5; d <= 3.0; d += 0.5) {
        const yld = ((model.effectiveHash / 100) * model.epochHalvingScale) / d;
        pts.push({ x: d, y: yld, label: `${d.toFixed(1)}x` });
      }
    }
    return pts;
  }, [stage, ambientC, airflowCfm, model.effectiveHash, model.epochHalvingScale]);

  const svgPath = useMemo(() => {
    if (chartPoints.length === 0) return '';
    const w = 520;
    const h = 210;
    const padX = 44;
    const padY = 22;
    const minX = chartPoints[0].x;
    const maxX = chartPoints[chartPoints.length - 1].x;
    const maxY = stage === 'THERMAL' ? 115 : stage === 'POWER' ? 600 : 2.2;

    return chartPoints
      .map((p, i) => {
        const px = padX + ((p.x - minX) / Math.max(0.001, maxX - minX)) * (w - padX * 2);
        const py = h - padY - (Math.min(maxY, p.y) / maxY) * (h - padY * 2);
        return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
      })
      .join(' ');
  }, [chartPoints, stage]);

  const activeMarker = useMemo(() => {
    const w = 520;
    const h = 210;
    const padX = 44;
    const padY = 22;
    const minX = stage === 'DIFFICULTY' ? 0.5 : 80;
    const maxX = stage === 'DIFFICULTY' ? 3.0 : 150;
    const maxY = stage === 'THERMAL' ? 115 : stage === 'POWER' ? 600 : 2.2;

    const valX = stage === 'DIFFICULTY' ? difficultyMult : clockPct;
    const valY =
      stage === 'THERMAL'
        ? model.coreTempC
        : stage === 'POWER'
        ? model.rawLoadWatts
        : model.relativeYield;

    const px = padX + ((valX - minX) / Math.max(0.001, maxX - minX)) * (w - padX * 2);
    const py = h - padY - (Math.min(maxY, valY) / maxY) * (h - padY * 2);
    return { px, py };
  }, [stage, difficultyMult, clockPct, model]);

  const resetLab = () => {
    setClockPct(105);
    setAmbientC(22);
    setAirflowCfm(55);
    setDifficultyMult(1.0);
    setEpochCount(0);
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
              Thermal Lab
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
              Key Equations
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
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span>Course CS-304</span>
            <span aria-hidden="true">·</span>
            <span>Hardware Architecture &amp; Distributed Systems</span>
            <span aria-hidden="true">·</span>
            <span>Interactive Module 4</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
            Power Scaling, Heat Dissipation &amp; Hash Throughput
          </h1>
          <p className="text-base text-slate-600 leading-relaxed">
            Explore how silicon clock scaling, power supply conversion curves, and ambient cooling
            interact in high-density compute nodes and proof-of-work verification clusters.
          </p>
        </section>

        {/* Two-Zone Educational Simulation Sandbox */}
        <section id="sandbox" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-200/75">
              {(
                [
                  { id: 'THERMAL', label: 'Stage 1: Thermal Equilibrium' },
                  { id: 'POWER', label: 'Stage 2: Power & PSU Curve' },
                  { id: 'DIFFICULTY', label: 'Stage 3: Epoch & Yield' },
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
                      : 'Relative Compute Yield vs. Network Difficulty'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {stage === 'THERMAL'
                      ? 'Throttling begins above the 82°C thermal envelope.'
                      : stage === 'POWER'
                      ? 'Optimal PSU conversion occurs between 50% and 80% load.'
                      : 'Halving triggers every 4 epochs; higher difficulty dilutes per-node share.'}
                  </p>
                </div>

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
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <svg
                  viewBox="0 0 520 210"
                  className="w-full h-52 overflow-visible"
                  role="img"
                  aria-label="Interactive system response curve"
                >
                  {/* Grid lines */}
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
                  {/* Axes */}
                  <line x1="44" y1="22" x2="44" y2="188" stroke="#94A3B8" strokeWidth="1.2" />
                  <line x1="44" y1="188" x2="476" y2="188" stroke="#94A3B8" strokeWidth="1.2" />

                  {/* Thermal 82C threshold */}
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

                  {/* Curve path */}
                  <path
                    d={svgPath}
                    fill="none"
                    stroke="#0284C7"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />

                  {/* Active point */}
                  <circle
                    cx={activeMarker.px}
                    cy={activeMarker.py}
                    r="6"
                    fill={model.isThrottled ? '#DC2626' : '#059669'}
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />

                  {/* Axis labels */}
                  <text
                    x="260"
                    y="204"
                    textAnchor="middle"
                    fill="#64748B"
                    fontSize="10"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    {stage === 'DIFFICULTY' ? 'Network Difficulty (0.5x — 3.0x)' : 'Clock Scale (80% — 150%)'}
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
                    {stage === 'THERMAL' ? 'Temp (°C)' : stage === 'POWER' ? 'Watts (W)' : 'Yield Index'}
                  </text>
                </svg>
              </div>

              {/* Live Metrics Strip */}
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
            </div>

            {/* Right Zone: Parameter Controls & Equations */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-6">
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

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="text-xs font-semibold text-slate-700">Governing Model</div>
                <div className="font-mono text-xs text-slate-800 bg-white border border-slate-200 rounded px-3 py-2">
                  P_wall = (P_base * (f / f_0)^1.55) / eta_psu
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {model.isThrottled
                    ? `Core temperature reached ${model.coreTempC}°C (>82°C). Raise coolant airflow or lower clock scale to prevent thermal throttling.`
                    : `System operating inside safe thermal headroom (${model.coreTempC}°C) at ${model.psuLoadPct}% PSU load (${model.epochHalvingScale}x subsidy).`}
                </p>
              </div>
            </div>
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
                02. Power Delivery &amp; Conversion Loss
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Every AC-to-DC power supply incurs conversion loss as heat. Matching PSU capacity so
                continuous draw stays in the 50–80% band avoids premature component wear and wasted
                kilowatt-hours.
              </p>
            </article>

            <article className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5">
              <div className="text-xs text-slate-500">Module 03 · Thermodynamics</div>
              <h3 className="font-display text-lg font-semibold text-slate-900">
                03. Heat Flux &amp; Thermal Equilibrium
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Virtually 100% of electrical energy delivered to compute boards becomes thermal
                energy. Steady-state temperature depends on room intake ambient plus heatsink airflow
                capacity.
              </p>
            </article>
          </div>
        </section>

        {/* Reference Equations & Glossary */}
        <section id="formulas" className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">
              Reference Terminology &amp; Equations
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-4 divide-y md:divide-y-0 divide-slate-100">
            <div className="py-2 border-b border-slate-100">
              <div className="text-sm font-semibold text-slate-900">Pool Variance (PPS vs. Solo)</div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Pay-Per-Share (PPS) smooths variance into predictable step payouts, whereas Solo
                mining concentrates all expected reward into discrete probabilistic block events.
              </p>
            </div>
            <div className="py-2 border-b border-slate-100">
              <div className="text-sm font-semibold text-slate-900">Efficiency (Joules / Hash)</div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Calculated as wall power divided by effective hash output. Lower J/TH extends
                hardware economic lifespan after halving epochs.
              </p>
            </div>
            <div className="py-2">
              <div className="text-sm font-semibold text-slate-900">Thermal Throttling</div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Automated firmware clock reduction triggered when junction temperatures exceed safe
                operating ceilings (typically 80–85°C), protecting solder joints and VRMs.
              </p>
            </div>
            <div className="py-2">
              <div className="text-sm font-semibold text-slate-900">Block Subsidy Halving</div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                A deterministic supply schedule that cuts newly minted coin issuance by 50% at fixed
                interval boundaries.
              </p>
            </div>
          </div>
        </section>

        {/* Interactive Comprehension Check */}
        <section id="quiz" className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900">
                Concept Comprehension Check
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Verify your understanding of the three simulation stages above.
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
              <div key={q.id} className="space-y-2.5 pb-5 border-b border-slate-100 last:border-b-0 last:pb-0">
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
