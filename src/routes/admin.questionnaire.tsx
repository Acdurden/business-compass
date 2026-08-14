import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useReducer, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  LogOut,
  ArrowLeft,
  Plus,
  EyeOff,
  RotateCcw,
  Save,
  AlertTriangle,
  CheckCircle2,
  Undo2,
  Redo2,
  GripVertical,
} from "lucide-react";
import { requireAdminAuth } from "@/lib/require-admin-auth";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  loadQuestionnaireEditor,
  saveQuestionnaire,
  type QuestionnaireEditorData,
  type EditorSection,
  type EditorQuestion,
  type EditorAnswer,
  type EditorScoreBand,
  type EditorMultiple,
} from "@/lib/questionnaire-admin.functions";

export const Route = createFileRoute("/admin/questionnaire")({
  ssr: false,
  beforeLoad: ({ location }) => requireAdminAuth(location.href),
  head: () => ({ meta: [{ title: "Admin · Questionnaire editor" }] }),
  component: QuestionnaireEditorPage,
});

type Tab = "objective" | "advisory" | "bands" | "multiples";
type Model = QuestionnaireEditorData;
const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const emptyModel: Model = { sections: [], questions: [], answers: [], scoreBands: [], valuationMultiples: [] };

/* -------------------- undo/redo reducer -------------------- */
type Snap = { model: Model; movedS: string[]; movedQ: string[]; movedA: string[] };
type State = Snap & { baseline: Model; past: Snap[]; future: Snap[] };
type Action =
  | { type: "load"; data: Model }
  | { type: "edit"; producer: (m: Model) => Model }
  | { type: "move"; kind: "s" | "q" | "a"; id: string; producer: (m: Model) => Model }
  | { type: "pushPast"; snap: Snap }
  | { type: "editLive"; producer: (m: Model) => Model }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "saved" };

const snapOf = (s: State): Snap => ({
  model: clone(s.model),
  movedS: [...s.movedS],
  movedQ: [...s.movedQ],
  movedA: [...s.movedA],
});

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "load":
      return { model: clone(a.data), baseline: clone(a.data), movedS: [], movedQ: [], movedA: [], past: [], future: [] };
    case "edit":
      return { ...s, model: a.producer(clone(s.model)), past: [...s.past, snapOf(s)], future: [] };
    case "editLive":
      return { ...s, model: a.producer(clone(s.model)), future: [] };
    case "pushPast":
      return { ...s, past: [...s.past, a.snap], future: [] };
    case "move": {
      const ns: State = { ...s, model: a.producer(clone(s.model)), past: [...s.past, snapOf(s)], future: [] };
      if (a.kind === "s" && !ns.movedS.includes(a.id)) ns.movedS = [...s.movedS, a.id];
      if (a.kind === "q" && !ns.movedQ.includes(a.id)) ns.movedQ = [...s.movedQ, a.id];
      if (a.kind === "a" && !ns.movedA.includes(a.id)) ns.movedA = [...s.movedA, a.id];
      return ns;
    }
    case "undo": {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return { ...s, ...clone(prev), past: s.past.slice(0, -1), future: [snapOf(s), ...s.future] };
    }
    case "redo": {
      if (!s.future.length) return s;
      const nxt = s.future[0];
      return { ...s, ...clone(nxt), past: [...s.past, snapOf(s)], future: s.future.slice(1) };
    }
    case "saved":
      return { ...s, baseline: clone(s.model), movedS: [], movedQ: [], movedA: [], past: [], future: [] };
    default:
      return s;
  }
}

/* -------------------- reorder producers (flat model) -------------------- */
function pMoveSection(dragId: string, targetId: string | null) {
  return (m: Model): Model => {
    const drag = m.sections.find((s) => s.section_id === dragId);
    if (!drag) return m;
    let list = m.sections
      .filter((s) => s.questionnaire_type === drag.questionnaire_type && s.section_id !== dragId)
      .sort((a, b) => a.sort_order - b.sort_order);
    const ti = targetId ? list.findIndex((s) => s.section_id === targetId) : -1;
    list.splice(ti < 0 ? list.length : ti, 0, drag);
    list.forEach((s, i) => (s.sort_order = i + 1));
    return m;
  };
}
function pMoveQuestion(qId: string, targetSectionId: string, targetQId: string | null) {
  return (m: Model): Model => {
    const q = m.questions.find((x) => x.question_id === qId);
    if (!q) return m;
    const src = q.section_id;
    q.section_id = targetSectionId;
    let tlist = m.questions
      .filter((x) => x.section_id === targetSectionId && x.question_id !== qId)
      .sort((a, b) => a.sort_order - b.sort_order);
    const ti = targetQId ? tlist.findIndex((x) => x.question_id === targetQId) : -1;
    tlist.splice(ti < 0 ? tlist.length : ti, 0, q);
    tlist.forEach((x, i) => (x.sort_order = i + 1));
    if (src !== targetSectionId) {
      m.questions
        .filter((x) => x.section_id === src)
        .sort((a, b) => a.sort_order - b.sort_order)
        .forEach((x, i) => (x.sort_order = i + 1));
    }
    return m;
  };
}
function pMoveAnswer(aId: string, targetAId: string | null) {
  return (m: Model): Model => {
    const a = m.answers.find((x) => x.id === aId);
    if (!a) return m;
    let list = m.answers
      .filter((x) => x.question_id === a.question_id && x.id !== aId)
      .sort((x, y) => x.option_order - y.option_order);
    const ti = targetAId ? list.findIndex((x) => x.id === targetAId) : -1;
    list.splice(ti < 0 ? list.length : ti, 0, a);
    list.forEach((x, i) => (x.option_order = i + 1));
    return m;
  };
}

/* -------------------- component -------------------- */
function QuestionnaireEditorPage() {
  const navigate = useNavigate();
  const load = useServerFn(loadQuestionnaireEditor);
  const save = useServerFn(saveQuestionnaire);

  const [st, dispatch] = useReducer(reducer, {
    model: emptyModel,
    baseline: emptyModel,
    movedS: [],
    movedQ: [],
    movedA: [],
    past: [],
    future: [],
  } as State);
  const stRef = useRef(st);
  stRef.current = st;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("objective");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragRef = useRef<{ kind: "s" | "q" | "a"; id: string } | null>(null);
  const beforeEdit = useRef<Snap | null>(null);

  const model = st.model;
  const dirty = !eq(model, st.baseline);

  function reload() {
    setLoading(true);
    load()
      .then((d) => {
        dispatch({ type: "load", data: d as Model });
        setLoading(false);
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Failed to load questionnaire");
        setLoading(false);
      });
  }
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keyboard undo/redo
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: "undo" });
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        dispatch({ type: "redo" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  /* ---- text/points edit lifecycle (one undo step per field session) ---- */
  function beginEdit() {
    if (!beforeEdit.current) beforeEdit.current = snapOf(stRef.current);
  }
  function liveEdit(producer: (m: Model) => Model) {
    dispatch({ type: "editLive", producer });
  }
  function endEdit() {
    if (beforeEdit.current) {
      if (!eq(beforeEdit.current.model, stRef.current.model)) {
        dispatch({ type: "pushPast", snap: beforeEdit.current });
      }
      beforeEdit.current = null;
    }
  }

  /* ---- scoring helpers (mirror server) ---- */
  const qMax = (qid: string, m: Model = model) => {
    const opts = m.answers.filter((a) => a.question_id === qid && a.active !== false && a.points != null);
    return opts.length ? Math.max(...opts.map((a) => Number(a.points))) : 0;
  };
  const isInfoQ = (qid: string, m: Model = model) =>
    m.answers.filter((a) => a.question_id === qid).every((a) => a.points == null);
  const secMax = (sid: string, m: Model = model) =>
    m.questions.filter((q) => q.section_id === sid && q.active !== false).reduce((t, q) => t + qMax(q.question_id, m), 0);
  const totalFor = (qt: string, m: Model = model) =>
    m.sections
      .filter((s) => s.questionnaire_type === qt && s.active !== false)
      .reduce((t, s) => t + secMax(s.section_id, m), 0);
  const objectiveTopBand = (() => {
    const b = model.scoreBands.filter((x) => x.band_type === "ObjectivePosition");
    return b.length ? Math.max(...b.map((x) => Number(x.max_score))) : 0;
  })();

  /* ---- baseline lookups for "was #" ---- */
  const baseSecsOf = (qt: string) =>
    st.baseline.sections.filter((s) => s.questionnaire_type === qt).sort((a, b) => a.sort_order - b.sort_order);
  const baseSecIndex = (qt: string, id: string) => baseSecsOf(qt).findIndex((s) => s.section_id === id);
  const baseQ = (id: string) => st.baseline.questions.find((q) => q.question_id === id) || null;
  const baseSecName = (id: string) => st.baseline.sections.find((s) => s.section_id === id)?.section_name ?? "";
  const baseQIndex = (secId: string, id: string) =>
    st.baseline.questions
      .filter((q) => q.section_id === secId)
      .sort((a, b) => a.sort_order - b.sort_order)
      .findIndex((q) => q.question_id === id);
  const baseA = (id: string) => st.baseline.answers.find((a) => a.id === id) || null;
  const baseAIndex = (qid: string, id: string) =>
    st.baseline.answers
      .filter((a) => a.question_id === qid)
      .sort((a, b) => a.option_order - b.option_order)
      .findIndex((a) => a.id === id);

  /* ---- mutations ---- */
  const patchSection = (id: string, patch: Partial<EditorSection>) =>
    dispatch({ type: "edit", producer: (m) => ({ ...m, sections: m.sections.map((s) => (s.section_id === id ? { ...s, ...patch } : s)) }) });
  const patchQuestion = (id: string, patch: Partial<EditorQuestion>) =>
    dispatch({ type: "edit", producer: (m) => ({ ...m, questions: m.questions.map((q) => (q.question_id === id ? { ...q, ...patch } : q)) }) });
  const patchAnswer = (id: string, patch: Partial<EditorAnswer>) =>
    dispatch({ type: "edit", producer: (m) => ({ ...m, answers: m.answers.map((a) => (a.id === id ? { ...a, ...patch } : a)) }) });
  const patchBand = (id: string, patch: Partial<EditorScoreBand>) =>
    dispatch({ type: "edit", producer: (m) => ({ ...m, scoreBands: m.scoreBands.map((b) => (b.id === id ? { ...b, ...patch } : b)) }) });
  const patchMultiple = (idx: number, patch: Partial<EditorMultiple>) =>
    dispatch({ type: "edit", producer: (m) => ({ ...m, valuationMultiples: m.valuationMultiples.map((x) => (x.band_index === idx ? { ...x, ...patch } : x)) }) });

  // live text patch (no history per keystroke)
  const liveSection = (id: string, patch: Partial<EditorSection>) => { beginEdit(); liveEdit((m) => ({ ...m, sections: m.sections.map((s) => (s.section_id === id ? { ...s, ...patch } : s)) })); };
  const liveQuestion = (id: string, patch: Partial<EditorQuestion>) => { beginEdit(); liveEdit((m) => ({ ...m, questions: m.questions.map((q) => (q.question_id === id ? { ...q, ...patch } : q)) })); };
  const liveAnswer = (id: string, patch: Partial<EditorAnswer>) => { beginEdit(); liveEdit((m) => ({ ...m, answers: m.answers.map((a) => (a.id === id ? { ...a, ...patch } : a)) })); };

  function nextId(prefix: string, existing: string[]) {
    const re = new RegExp(`^${prefix}(\\d+)`);
    let max = 0;
    for (const id of existing) { const mm = id.match(re); if (mm) max = Math.max(max, parseInt(mm[1], 10)); }
    return `${prefix}${max + 1}`;
  }
  const addSection = (qt: string) =>
    dispatch({ type: "edit", producer: (m) => {
      const id = nextId(qt === "objective" ? "S" : "A", m.sections.map((s) => s.section_id));
      const order = Math.max(0, ...m.sections.filter((s) => s.questionnaire_type === qt).map((s) => s.sort_order)) + 1;
      return { ...m, sections: [...m.sections, { section_id: id, section_name: "New section", questionnaire_type: qt, sort_order: order, active: true, max_score: 0 }] };
    } });
  const addQuestion = (secId: string, qt: string) =>
    dispatch({ type: "edit", producer: (m) => {
      const id = nextId(qt === "objective" ? "Q" : "AQ", m.questions.map((q) => q.question_id));
      const num = Math.max(0, ...m.questions.filter((q) => q.questionnaire_type === qt).map((q) => q.question_number)) + 1;
      const order = Math.max(0, ...m.questions.filter((q) => q.section_id === secId).map((q) => q.sort_order)) + 1;
      const q: EditorQuestion = { question_id: id, section_id: secId, questionnaire_type: qt, question_number: num, question_text: "New question", response_type: "SingleSelect", sort_order: order, active: true, max_score: 1 };
      const a1: EditorAnswer = { id: `${id}_A1`, question_id: id, section_id: secId, option_order: 1, answer_text: "First answer", points: 0, value_min: null, value_max: null, value_type: "Text", active: true };
      const a2: EditorAnswer = { id: `${id}_A2`, question_id: id, section_id: secId, option_order: 2, answer_text: "Second answer", points: 1, value_min: null, value_max: null, value_type: "Text", active: true };
      return { ...m, questions: [...m.questions, q], answers: [...m.answers, a1, a2] };
    } });
  const addAnswer = (qid: string, secId: string | null) =>
    dispatch({ type: "edit", producer: (m) => {
      const opts = m.answers.filter((a) => a.question_id === qid);
      const order = Math.max(0, ...opts.map((a) => a.option_order)) + 1;
      let id = `${qid}_A${order}`;
      while (opts.some((a) => a.id === id)) id = `${id}_x`;
      return { ...m, answers: [...m.answers, { id, question_id: qid, section_id: secId, option_order: order, answer_text: "New answer", points: 0, value_min: null, value_max: null, value_type: "Text", active: true }] };
    } });

  /* ---- drag & drop ---- */
  const onGripDragStart = (kind: "s" | "q" | "a", id: string) => (e: React.DragEvent) => {
    dragRef.current = { kind, id };
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", id); } catch { /* noop */ }
  };
  const onGripDragEnd = () => { dragRef.current = null; setDragOver(null); };
  const dropSectionReorder = (targetId: string) => (e: React.DragEvent) => {
    const d = dragRef.current; if (!d) return;
    if (d.kind === "s") { e.preventDefault(); e.stopPropagation(); if (d.id !== targetId) dispatch({ type: "move", kind: "s", id: d.id, producer: pMoveSection(d.id, targetId) }); }
  };
  const dropQuestionOnSection = (secId: string) => (e: React.DragEvent) => {
    const d = dragRef.current; if (!d) return;
    if (d.kind === "q") { e.preventDefault(); dispatch({ type: "move", kind: "q", id: d.id, producer: pMoveQuestion(d.id, secId, null) }); }
  };
  const dropQuestionBefore = (secId: string, targetQId: string) => (e: React.DragEvent) => {
    const d = dragRef.current; if (!d) return;
    if (d.kind === "q") { e.preventDefault(); e.stopPropagation(); if (d.id !== targetQId) dispatch({ type: "move", kind: "q", id: d.id, producer: pMoveQuestion(d.id, secId, targetQId) }); }
  };
  const dropAnswerBefore = (qid: string, targetAId: string) => (e: React.DragEvent) => {
    const d = dragRef.current; if (!d) return;
    if (d.kind === "a" && model.answers.find((x) => x.id === d.id)?.question_id === qid) { e.preventDefault(); e.stopPropagation(); if (d.id !== targetAId) dispatch({ type: "move", kind: "a", id: d.id, producer: pMoveAnswer(d.id, targetAId) }); }
  };
  const allowDrop = (kinds: string[]) => (e: React.DragEvent) => { if (dragRef.current && kinds.includes(dragRef.current.kind)) e.preventDefault(); };

  /* ---- save ---- */
  async function doSave() {
    setSaving(true);
    try {
      await save({ data: model });
      dispatch({ type: "saved" });
      toast.success("Saved — changes are live");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /* ---- change summary (only reports moves the admin actually made) ---- */
  const summary = buildSummary(model, st.baseline, st);

  function switchTab(t: Tab) { setTab(t); }
  function onTabClick(t: Tab) {
    if (t === tab) return;
    if (dirty && (tab === "objective" || tab === "advisory" || tab === "bands" || tab === "multiples")) {
      setPendingTab(t);
    } else switchTab(t);
  }

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center">
        <p className="text-sm text-muted-foreground">Loading questionnaire…</p>
      </main>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "objective", label: "Objective questionnaire" },
    { key: "advisory", label: "Advisory questionnaire" },
    { key: "bands", label: "Score bands" },
    { key: "multiples", label: "Valuation multipliers" },
  ];

  const api = {
    model, qMax, secMax, totalFor, isInfoQ, objectiveTopBand,
    liveSection, liveQuestion, liveAnswer, patchSection, patchQuestion, patchAnswer, endEdit,
    addSection, addQuestion, addAnswer,
    onGripDragStart, onGripDragEnd, dropSectionReorder, dropQuestionOnSection, dropQuestionBefore, dropAnswerBefore, allowDrop,
    dragOver, setDragOver,
    movedS: st.movedS, movedQ: st.movedQ, movedA: st.movedA,
    baseSecIndex, baseQ, baseSecName, baseQIndex, baseA, baseAIndex,
  };

  return (
    <main className="min-h-screen pb-28">
      <header className="border-b border-border/60 sticky top-0 bg-background/95 backdrop-blur z-20">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Admin</p>
            <h1 className="text-lg font-semibold tracking-tight">Questionnaire editor</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => dispatch({ type: "undo" })} disabled={!st.past.length}>
              <Undo2 className="h-3.5 w-3.5 mr-1.5" /> Undo
            </Button>
            <Button variant="outline" size="sm" onClick={() => dispatch({ type: "redo" })} disabled={!st.future.length}>
              <Redo2 className="h-3.5 w-3.5 mr-1.5" /> Redo
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/submissions"><ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Submissions</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="h-3.5 w-3.5 mr-1.5" />Sign out
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-6 flex gap-1 flex-wrap border-t border-border/40">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => onTabClick(t.key)}
              className={`px-3 py-2.5 text-[13px] font-medium border-b-2 -mb-px ${tab === t.key ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
              {dirty && tab === t.key ? <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle" /> : null}
            </button>
          ))}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {(tab === "objective" || tab === "advisory") && <EditorPane qtype={tab} api={api} />}
        {tab === "bands" && <BandsPane model={model} patchBand={patchBand} endEdit={endEdit} liveBand={(id, p) => { beginEdit(); liveEdit((m) => ({ ...m, scoreBands: m.scoreBands.map((b) => (b.id === id ? { ...b, ...p } : b)) })); }} objectiveTotal={totalFor("objective")} objectiveTopBand={objectiveTopBand} />}
        {tab === "multiples" && <MultiplesPane model={model} patchMultiple={patchMultiple} endEdit={endEdit} liveMultiple={(idx, p) => { beginEdit(); liveEdit((m) => ({ ...m, valuationMultiples: m.valuationMultiples.map((x) => (x.band_index === idx ? { ...x, ...p } : x)) })); }} />}
      </div>

      {/* save bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 backdrop-blur z-30">
        <div className="mx-auto max-w-5xl px-6 py-3 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {dirty ? <span className="text-foreground font-medium">{summary.total} unsaved change{summary.total === 1 ? "" : "s"}</span> : "All changes saved"}
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "undo" })} disabled={!st.past.length}>
              <Undo2 className="h-3.5 w-3.5 mr-1.5" /> Undo
            </Button>
            <Button variant="ghost" size="sm" onClick={reload} disabled={!dirty || saving}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Discard all
            </Button>
            <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={!dirty || saving}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>

      {/* save confirmation with change summary */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Publish changes to the live questionnaire?"
        description={<ChangeSummary summary={summary} totalObj={totalFor("objective")} totalAdv={totalFor("advisory")} objectiveTopBand={objectiveTopBand} />}
        confirmLabel="Yes, publish live"
        onConfirm={() => void doSave()}
      />

      {/* unsaved-changes guard on tab switch */}
      <ConfirmDialog
        open={pendingTab !== null}
        onOpenChange={(o) => { if (!o) setPendingTab(null); }}
        title="You have unsaved changes"
        description="Your edits are kept as you move between tabs, but they are not live yet. Switch tabs and keep editing, or cancel to stay and save first."
        cancelLabel="Stay here"
        confirmLabel="Switch tab"
        onConfirm={() => { if (pendingTab) switchTab(pendingTab); setPendingTab(null); }}
      />
    </main>
  );
}

/* ============================ change summary ============================ */
type Summary = {
  total: number;
  groups: { points: string[]; move: string[]; rename: string[]; hide: string[]; add: string[] };
};
function buildSummary(model: Model, base: Model, st: State): Summary {
  const g: Summary["groups"] = { points: [], move: [], rename: [], hide: [], add: [] };
  const baseSec = (id: string) => base.sections.find((s) => s.section_id === id) || null;
  const baseSecIdx = (qt: string, id: string) => base.sections.filter((s) => s.questionnaire_type === qt).sort((a, b) => a.sort_order - b.sort_order).findIndex((s) => s.section_id === id);
  const curSecIdx = (qt: string, id: string) => model.sections.filter((s) => s.questionnaire_type === qt).sort((a, b) => a.sort_order - b.sort_order).findIndex((s) => s.section_id === id);
  const baseQ = (id: string) => base.questions.find((q) => q.question_id === id) || null;
  const baseQIdx = (secId: string, id: string) => base.questions.filter((q) => q.section_id === secId).sort((a, b) => a.sort_order - b.sort_order).findIndex((q) => q.question_id === id);
  const curQIdx = (secId: string, id: string) => model.questions.filter((q) => q.section_id === secId).sort((a, b) => a.sort_order - b.sort_order).findIndex((q) => q.question_id === id);
  const baseA = (id: string) => base.answers.find((a) => a.id === id) || null;
  const baseAIdx = (qid: string, id: string) => base.answers.filter((a) => a.question_id === qid).sort((a, b) => a.option_order - b.option_order).findIndex((a) => a.id === id);
  const curAIdx = (qid: string, id: string) => model.answers.filter((a) => a.question_id === qid).sort((a, b) => a.option_order - b.option_order).findIndex((a) => a.id === id);
  const secName = (id: string) => model.sections.find((s) => s.section_id === id)?.section_name ?? id;
  const baseSecName = (id: string) => base.sections.find((s) => s.section_id === id)?.section_name ?? id;
  const qLabel = (q: EditorQuestion) => `Q${q.question_number}`;

  for (const s of model.sections) {
    const os = baseSec(s.section_id);
    if (!os) { g.add.push(`New section "${s.section_name}"`); continue; }
    if (os.section_name !== s.section_name) g.rename.push(`Section renamed: "${os.section_name}" → "${s.section_name}"`);
    if (os.active !== s.active) g.hide.push(`Section "${s.section_name}" ${s.active ? "restored" : "hidden"}`);
    if (st.movedS.includes(s.section_id)) {
      const from = baseSecIdx(s.questionnaire_type, s.section_id) + 1;
      const to = curSecIdx(s.questionnaire_type, s.section_id) + 1;
      if (from !== to) g.move.push(`Section "${s.section_name}" moved: position ${from} → ${to}`);
    }
  }
  for (const q of model.questions) {
    const oq = baseQ(q.question_id);
    if (!oq) { g.add.push(`New question in "${secName(q.section_id)}"`); continue; }
    if (oq.question_text !== q.question_text) g.rename.push(`${qLabel(q)} text changed`);
    if (oq.active !== q.active) g.hide.push(`${qLabel(q)} ${q.active ? "restored" : "hidden"}`);
    if (oq.section_id !== q.section_id) {
      g.move.push(`${qLabel(q)} moved from "${baseSecName(oq.section_id)}" to "${secName(q.section_id)}"`);
    } else if (st.movedQ.includes(q.question_id)) {
      const from = baseQIdx(q.section_id, q.question_id) + 1;
      const to = curQIdx(q.section_id, q.question_id) + 1;
      if (from !== to) g.move.push(`${qLabel(q)} reordered in "${secName(q.section_id)}": position ${from} → ${to}`);
    }
  }
  for (const a of model.answers) {
    const oa = baseA(a.id);
    const q = model.questions.find((x) => x.question_id === a.question_id);
    const lbl = q ? `Q${q.question_number}` : a.question_id;
    if (!oa) { g.add.push(`New answer under ${lbl}`); continue; }
    if (oa.answer_text !== a.answer_text) g.rename.push(`${lbl} answer text changed`);
    if (Number(oa.points) !== Number(a.points)) g.points.push(`${lbl} · "${a.answer_text}" points: ${oa.points ?? "—"} → ${a.points ?? "—"}`);
    if (oa.active !== a.active) g.hide.push(`${lbl} answer "${a.answer_text}" ${a.active ? "restored" : "hidden"}`);
    if (st.movedA.includes(a.id)) {
      const from = baseAIdx(a.question_id, a.id) + 1;
      const to = curAIdx(a.question_id, a.id) + 1;
      if (from !== to) g.move.push(`${lbl} answer "${a.answer_text}" reordered: position ${from} → ${to}`);
    }
  }
  const total = g.points.length + g.move.length + g.rename.length + g.hide.length + g.add.length;
  return { total, groups: g };
}

function ChangeSummary({ summary, totalObj, totalAdv, objectiveTopBand }: { summary: Summary; totalObj: number; totalAdv: number; objectiveTopBand: number }) {
  const titles: Record<string, string> = { points: "Scoring changes", move: "Reordering & moves", rename: "Text changes", hide: "Hidden / restored", add: "Additions" };
  const order: (keyof Summary["groups"])[] = ["points", "move", "rename", "hide", "add"];
  return (
    <span className="block">
      <span className="block text-muted-foreground">
        These edits go live on kriterionbvi.com immediately. Existing client submissions keep their original answers
        and scores — only new submissions use the updated questionnaire.
      </span>
      {summary.total === 0 ? (
        <span className="block mt-3 text-muted-foreground">No changes to publish.</span>
      ) : (
        <span className="block mt-3 max-h-64 overflow-auto">
          {order.filter((k) => summary.groups[k].length).map((k) => (
            <span key={k} className="block mb-2">
              <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{titles[k]} ({summary.groups[k].length})</span>
              {summary.groups[k].map((line, i) => (
                <span key={i} className="block text-[13px] text-foreground border-t border-border/60 py-0.5">{line}</span>
              ))}
            </span>
          ))}
        </span>
      )}
      <span className="block mt-3 text-muted-foreground">
        Objective max score: <b>{totalObj} pts</b> · Advisory max score: <b>{totalAdv} pts</b>
      </span>
      {totalObj !== objectiveTopBand && (
        <span className="block mt-2 text-amber-700 dark:text-amber-300">
          ⚠ Objective max score ({totalObj}) no longer matches the top score band ({objectiveTopBand}). Review the Score bands tab before publishing.
        </span>
      )}
    </span>
  );
}

/* ============================ editor pane ============================ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EditorPane({ qtype, api }: { qtype: "objective" | "advisory"; api: any }) {
  const model: Model = api.model;
  const sections = model.sections.filter((s: EditorSection) => s.questionnaire_type === qtype).sort((a: EditorSection, b: EditorSection) => a.sort_order - b.sort_order);
  const total = api.totalFor(qtype);
  const covered = qtype === "objective" ? total === api.objectiveTopBand : true;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Stat label="Sections" value={sections.filter((s: EditorSection) => s.active !== false).length} />
        <Stat label="Questions" value={model.questions.filter((q: EditorQuestion) => q.questionnaire_type === qtype && q.active !== false).length} />
        <Stat label="Max possible score" value={`${total} pts`} />
        {qtype === "objective" ? (
          covered ? (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> Score bands cover 0–{total}
            </span>
          ) : (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" /> Max is {total}, top band ends at {api.objectiveTopBand}
            </span>
          )
        ) : (
          <span className="ml-auto text-xs text-muted-foreground">Adjusted score is normalized to 0–100 (see Score bands)</span>
        )}
      </div>

      {sections.map((s: EditorSection) => {
        const questions = model.questions.filter((q: EditorQuestion) => q.section_id === s.section_id).sort((a: EditorQuestion, b: EditorQuestion) => a.sort_order - b.sort_order);
        const info = s.max_score === 0 && questions.every((q: EditorQuestion) => api.isInfoQ(q.question_id));
        const oIdx = api.baseSecIndex(qtype, s.section_id);
        const curIdx = sections.findIndex((x: EditorSection) => x.section_id === s.section_id);
        const movedSec = api.movedS.includes(s.section_id) && oIdx >= 0 && oIdx !== curIdx;
        return (
          <div
            key={s.section_id}
            data-sec={s.section_id}
            onDragOver={api.allowDrop(["s", "q"])}
            onDrop={(e: React.DragEvent) => { api.dropSectionReorder(s.section_id)(e); if (!e.defaultPrevented) api.dropQuestionOnSection(s.section_id)(e); }}
            className={`rounded-xl border shadow-sm mb-4 ${movedSec ? "border-amber-400 bg-amber-50/60 dark:bg-amber-500/5" : "border-border bg-card"} ${s.active === false ? "opacity-50" : ""}`}
          >
            <div className="flex items-center gap-2 p-3 border-b border-border bg-muted/30 rounded-t-xl">
              <span
                draggable
                onDragStart={api.onGripDragStart("s", s.section_id)}
                onDragEnd={api.onGripDragEnd}
                title="Drag to reorder section"
                className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
              >
                <GripVertical className="h-4 w-4" />
              </span>
              <span className="font-mono text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded">{s.section_id}</span>
              <Input value={s.section_name} onChange={(e) => api.liveSection(s.section_id, { section_name: e.target.value })} onBlur={api.endEdit} className="h-8 font-semibold flex-1 min-w-[120px]" />
              {movedSec && <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-background border border-amber-400/60 rounded-full px-2 py-0.5">moved · was #{oIdx + 1}</span>}
              {info ? (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-2 py-1 rounded-full">Info · not scored</span>
              ) : (
                <span className="text-[11px] font-semibold text-primary bg-muted border border-border px-2.5 py-1 rounded-full whitespace-nowrap">Section max: {api.secMax(s.section_id)}</span>
              )}
              <button type="button" title={s.active === false ? "Restore section" : "Hide section"} onClick={() => api.patchSection(s.section_id, { active: s.active === false })} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:border-ring">
                {s.active === false ? <RotateCcw className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>

            <div>
              {questions.map((q: EditorQuestion) => {
                const qInfo = api.isInfoQ(q.question_id);
                const answers = model.answers.filter((a: EditorAnswer) => a.question_id === q.question_id).sort((a: EditorAnswer, b: EditorAnswer) => a.option_order - b.option_order);
                const qmax = api.qMax(q.question_id);
                const oq: EditorQuestion | null = api.baseQ(q.question_id);
                const fromOther = oq && oq.section_id !== q.section_id;
                const oQIdx = oq ? api.baseQIndex(q.section_id, q.question_id) : -1;
                const curQIdx = questions.findIndex((x: EditorQuestion) => x.question_id === q.question_id);
                const movedQ = api.movedQ.includes(q.question_id) && (fromOther || (oQIdx >= 0 && oQIdx !== curQIdx));
                return (
                  <div
                    key={q.question_id}
                    onDragOver={api.allowDrop(["q"])}
                    onDrop={api.dropQuestionBefore(s.section_id, q.question_id)}
                    className={`p-3 pl-4 border-b border-border last:border-b-0 ${movedQ ? "bg-amber-50/60 dark:bg-amber-500/5" : ""} ${q.active === false ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <span draggable onDragStart={api.onGripDragStart("q", q.question_id)} onDragEnd={api.onGripDragEnd} title="Drag to reorder, or into another section" className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground mt-1.5">
                        <GripVertical className="h-4 w-4" />
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground mt-2 whitespace-nowrap">Q{q.question_number}</span>
                      <textarea value={q.question_text} onChange={(e) => api.liveQuestion(q.question_id, { question_text: e.target.value })} onBlur={api.endEdit} rows={1} className="flex-1 resize-none rounded-md border border-transparent hover:border-border focus:border-ring focus:outline-none bg-transparent px-2 py-1.5 text-sm min-h-[34px]" />
                      {movedQ && <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-background border border-amber-400/60 rounded-full px-2 py-0.5 mt-1 whitespace-nowrap">{fromOther ? `moved from ${api.baseSecName(oq!.section_id)}` : `was #${oQIdx + 1}`}</span>}
                      {qInfo ? (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-2 py-1 rounded-full mt-1">Not scored</span>
                      ) : (
                        <span className="text-[11px] font-semibold text-primary bg-muted border border-border px-2.5 py-1 rounded-full mt-1 whitespace-nowrap">Q max: {qmax}</span>
                      )}
                      <button type="button" title={q.active === false ? "Restore" : "Hide question"} onClick={() => api.patchQuestion(q.question_id, { active: q.active === false })} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:border-ring mt-1">
                        {q.active === false ? <RotateCcw className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                    </div>

                    <div className="mt-2 pl-6">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground text-left">
                            <th className="w-6" />
                            <th className="w-7 font-semibold py-1">#</th>
                            <th className="font-semibold py-1">Answer</th>
                            {!qInfo && <th className="w-20 font-semibold py-1">Points</th>}
                            <th className="w-36 font-semibold py-1">Value type</th>
                            <th className="w-16" />
                          </tr>
                        </thead>
                        <tbody>
                          {answers.map((a: EditorAnswer) => {
                            const top = !qInfo && qmax > 0 && Number(a.points) === qmax && a.active !== false;
                            const range = a.value_type && a.value_type !== "Text";
                            const oa: EditorAnswer | null = api.baseA(a.id);
                            const oaIdx = oa ? api.baseAIndex(a.question_id, a.id) : -1;
                            const curAIdx = answers.findIndex((x: EditorAnswer) => x.id === a.id);
                            const movedA = api.movedA.includes(a.id) && oaIdx >= 0 && oaIdx !== curAIdx;
                            return (
                              <tr key={a.id} onDragOver={api.allowDrop(["a"])} onDrop={api.dropAnswerBefore(q.question_id, a.id)} className={`border-t border-border/60 ${movedA ? "bg-amber-50/60 dark:bg-amber-500/5" : ""} ${a.active === false ? "opacity-40" : ""}`}>
                                <td className="py-1"><span draggable onDragStart={api.onGripDragStart("a", a.id)} onDragEnd={api.onGripDragEnd} title="Drag to reorder answer" className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground inline-flex"><GripVertical className="h-3.5 w-3.5" /></span></td>
                                <td className="text-center text-muted-foreground text-xs py-1">{curAIdx + 1}</td>
                                <td className="py-1 pr-2"><Input value={a.answer_text} onChange={(e) => api.liveAnswer(a.id, { answer_text: e.target.value })} onBlur={api.endEdit} className="h-8" /></td>
                                {!qInfo && (
                                  <td className="py-1 pr-2">
                                    <Input type="number" value={a.points ?? ""} onChange={(e) => api.liveAnswer(a.id, { points: e.target.value === "" ? null : Number(e.target.value) })} onBlur={api.endEdit} className={`h-8 w-16 text-center font-semibold ${top ? "border-emerald-500/50 bg-emerald-500/10" : ""}`} />
                                  </td>
                                )}
                                <td className="py-1 text-xs text-muted-foreground">
                                  {a.value_type || "Text"}
                                  {range && <span className="block text-[11px] opacity-70">{a.value_min ?? "−"} to {a.value_max ?? "+"}</span>}
                                </td>
                                <td className="py-1">
                                  <div className="flex items-center gap-1 justify-end">
                                    {movedA && <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300">#{oaIdx + 1}→</span>}
                                    <button type="button" title={a.active === false ? "Restore" : "Hide answer"} onClick={() => api.patchAnswer(a.id, { active: a.active === false })} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:border-ring">
                                      {a.active === false ? <RotateCcw className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <MiniBtn onClick={() => api.addAnswer(q.question_id, s.section_id)}><Plus className="h-3.5 w-3.5 mr-1" /> Add answer</MiniBtn>
                    </div>
                  </div>
                );
              })}
              <div className="p-3 pl-6"><MiniBtn onClick={() => api.addQuestion(s.section_id, qtype)}><Plus className="h-3.5 w-3.5 mr-1" /> Add question to {s.section_name}</MiniBtn></div>
            </div>
          </div>
        );
      })}

      <button onClick={() => api.addSection(qtype)} className="w-full rounded-xl border border-dashed border-border bg-card py-3 text-sm font-semibold text-muted-foreground hover:text-primary hover:border-ring">
        <Plus className="h-4 w-4 mr-1.5 inline" /> Add a new section
      </button>
    </div>
  );
}

/* ============================ bands pane ============================ */
function BandsPane({ model, patchBand, liveBand, endEdit, objectiveTotal, objectiveTopBand }: {
  model: Model; patchBand: (id: string, p: Partial<EditorScoreBand>) => void; liveBand: (id: string, p: Partial<EditorScoreBand>) => void; endEdit: () => void; objectiveTotal: number; objectiveTopBand: number;
}) {
  const obj = model.scoreBands.filter((b) => b.band_type === "ObjectivePosition").sort((a, b) => a.min_score - b.min_score);
  const adj = model.scoreBands.filter((b) => b.band_type === "AdjustedValueScore").sort((a, b) => a.min_score - b.min_score);
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-semibold">Objective Position bands</h2>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2">Maps a client's total <b>objective</b> score to a market-position label. These should cover the full possible range with no gaps.</p>
        {objectiveTotal === objectiveTopBand ? (
          <p className="text-xs rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-3 py-2 mb-2">✓ These bands cover the full objective range (0–{objectiveTotal}).</p>
        ) : (
          <p className="text-xs rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 mb-2">⚠ The objective max score is now <b>{objectiveTotal}</b> but the top band ends at <b>{objectiveTopBand}</b>. Adjust the ranges so every score maps to a band.</p>
        )}
        <BandTable bands={obj} patchBand={patchBand} liveBand={liveBand} endEdit={endEdit} />
      </div>
      <div>
        <h2 className="text-sm font-semibold">Adjusted Value Score bands</h2>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2">Maps the <b>adjusted</b> score (normalized to 0–100) to a value band shown to advisors and clients.</p>
        <BandTable bands={adj} patchBand={patchBand} liveBand={liveBand} endEdit={endEdit} />
      </div>
    </div>
  );
}
function BandTable({ bands, patchBand, liveBand, endEdit }: { bands: EditorScoreBand[]; patchBand: (id: string, p: Partial<EditorScoreBand>) => void; liveBand: (id: string, p: Partial<EditorScoreBand>) => void; endEdit: () => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground text-left">
            <th className="px-3 py-2">ID</th><th className="px-3 py-2 w-24">Min</th><th className="px-3 py-2 w-24">Max</th><th className="px-3 py-2">Label</th><th className="px-3 py-2">Tag</th>
          </tr>
        </thead>
        <tbody>
          {bands.map((b) => (
            <tr key={b.id} className="border-t border-border">
              <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{b.id}</td>
              <td className="px-2 py-1.5"><Input type="number" value={b.min_score} onChange={(e) => liveBand(b.id, { min_score: Number(e.target.value) })} onBlur={endEdit} className="h-8 w-20 text-center" /></td>
              <td className="px-2 py-1.5"><Input type="number" value={b.max_score} onChange={(e) => liveBand(b.id, { max_score: Number(e.target.value) })} onBlur={endEdit} className="h-8 w-20 text-center" /></td>
              <td className="px-2 py-1.5"><Input value={b.label} onChange={(e) => liveBand(b.id, { label: e.target.value })} onBlur={endEdit} className="h-8" /></td>
              <td className="px-2 py-1.5"><Input value={b.extra_value ?? ""} onChange={(e) => liveBand(b.id, { extra_value: e.target.value })} onBlur={endEdit} className="h-8" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============================ multiples pane ============================ */
function MultiplesPane({ model, patchMultiple, liveMultiple, endEdit }: { model: Model; patchMultiple: (idx: number, p: Partial<EditorMultiple>) => void; liveMultiple: (idx: number, p: Partial<EditorMultiple>) => void; endEdit: () => void }) {
  const rows = [...model.valuationMultiples].sort((a, b) => a.band_index - b.band_index);
  return (
    <div>
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 px-4 py-3 text-sm mb-4 flex gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div><b>This table drives the valuation math.</b> Each row is a multiplier anchor the model interpolates between as a client's score rises (top row = a score of zero; bottom row = the maximum score). Changing these numbers changes every future client's calculated valuation.</div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground text-left">
              <th className="px-3 py-2 w-28">Anchor</th><th className="px-3 py-2">Net Fee Income multiple</th><th className="px-3 py-2">EBITDA multiple</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <tr key={m.band_index} className="border-t border-border">
                <td className="px-3 py-1.5 text-muted-foreground">{i === 0 ? "Score 0" : i === rows.length - 1 ? "Max score" : `Anchor ${i + 1}`}</td>
                <td className="px-2 py-1.5"><Input type="number" step="0.1" value={m.nfi_multiple} onChange={(e) => liveMultiple(m.band_index, { nfi_multiple: Number(e.target.value) })} onBlur={endEdit} className="h-8 w-28" /></td>
                <td className="px-2 py-1.5"><Input type="number" step="0.1" value={m.ebitda_multiple} onChange={(e) => liveMultiple(m.band_index, { ebitda_multiple: Number(e.target.value) })} onBlur={endEdit} className="h-8 w-28" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================ small bits ============================ */
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
function MiniBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center rounded-md border border-dashed border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-primary hover:border-ring mt-2">
      {children}
    </button>
  );
}
