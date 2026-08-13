import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  LogOut,
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  Plus,
  EyeOff,
  RotateCcw,
  Save,
  AlertTriangle,
  CheckCircle2,
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

const emptyModel: Model = {
  sections: [],
  questions: [],
  answers: [],
  scoreBands: [],
  valuationMultiples: [],
};

function QuestionnaireEditorPage() {
  const navigate = useNavigate();
  const load = useServerFn(loadQuestionnaireEditor);
  const save = useServerFn(saveQuestionnaire);

  const [model, setModel] = useState<Model>(emptyModel);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>("objective");
  const [confirmOpen, setConfirmOpen] = useState(false);

  function reload() {
    setLoading(true);
    load()
      .then((d) => {
        setModel(d as Model);
        setDirty(false);
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

  function edit(mut: (m: Model) => Model) {
    setModel((prev) => mut(structuredClone(prev)));
    setDirty(true);
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  // ---------- scoring helpers (mirror the server) ----------
  const qMax = (questionId: string, m: Model = model) => {
    const opts = m.answers.filter(
      (a) => a.question_id === questionId && a.active !== false && a.points !== null && a.points !== undefined,
    );
    return opts.length ? Math.max(...opts.map((a) => Number(a.points))) : 0;
  };
  const isInfoQuestion = (questionId: string, m: Model = model) =>
    m.answers.filter((a) => a.question_id === questionId).every((a) => a.points === null || a.points === undefined);
  const secMax = (sectionId: string, m: Model = model) =>
    m.questions
      .filter((q) => q.section_id === sectionId && q.active !== false)
      .reduce((t, q) => t + qMax(q.question_id, m), 0);
  const totalFor = (qtype: string, m: Model = model) =>
    m.sections
      .filter((s) => s.questionnaire_type === qtype && s.active !== false)
      .reduce((t, s) => t + secMax(s.section_id, m), 0);

  const objectiveTopBand = useMemo(() => {
    const bands = model.scoreBands.filter((b) => b.band_type === "ObjectivePosition");
    return bands.length ? Math.max(...bands.map((b) => Number(b.max_score))) : 0;
  }, [model.scoreBands]);

  // ---------- mutation helpers ----------
  const patchSection = (id: string, patch: Partial<EditorSection>) =>
    edit((m) => ({ ...m, sections: m.sections.map((s) => (s.section_id === id ? { ...s, ...patch } : s)) }));
  const patchQuestion = (id: string, patch: Partial<EditorQuestion>) =>
    edit((m) => ({ ...m, questions: m.questions.map((q) => (q.question_id === id ? { ...q, ...patch } : q)) }));
  const patchAnswer = (id: string, patch: Partial<EditorAnswer>) =>
    edit((m) => ({ ...m, answers: m.answers.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const patchBand = (id: string, patch: Partial<EditorScoreBand>) =>
    edit((m) => ({ ...m, scoreBands: m.scoreBands.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  const patchMultiple = (idx: number, patch: Partial<EditorMultiple>) =>
    edit((m) => ({
      ...m,
      valuationMultiples: m.valuationMultiples.map((x) => (x.band_index === idx ? { ...x, ...patch } : x)),
    }));

  function reorder<T>(arr: T[], idField: (t: T) => string, orderField: keyof T, id: string, dir: -1 | 1) {
    const sorted = [...arr].sort((a, b) => Number(a[orderField]) - Number(b[orderField]));
    const i = sorted.findIndex((x) => idField(x) === id);
    if (i < 0 || i + dir < 0 || i + dir >= sorted.length) return arr;
    [sorted[i], sorted[i + dir]] = [sorted[i + dir], sorted[i]];
    sorted.forEach((x, idx) => ((x as Record<string, unknown>)[orderField as string] = idx + 1));
    return arr.map((orig) => sorted.find((x) => idField(x) === idField(orig)) ?? orig);
  }

  const moveSection = (qtype: string, id: string, dir: -1 | 1) =>
    edit((m) => {
      const group = m.sections.filter((s) => s.questionnaire_type === qtype);
      const others = m.sections.filter((s) => s.questionnaire_type !== qtype);
      return { ...m, sections: [...others, ...reorder(group, (s) => s.section_id, "sort_order", id, dir)] };
    });
  const moveQuestion = (sectionId: string, id: string, dir: -1 | 1) =>
    edit((m) => {
      const group = m.questions.filter((q) => q.section_id === sectionId);
      const others = m.questions.filter((q) => q.section_id !== sectionId);
      return { ...m, questions: [...others, ...reorder(group, (q) => q.question_id, "sort_order", id, dir)] };
    });
  const moveAnswer = (questionId: string, id: string, dir: -1 | 1) =>
    edit((m) => {
      const group = m.answers.filter((a) => a.question_id === questionId);
      const others = m.answers.filter((a) => a.question_id !== questionId);
      return { ...m, answers: [...others, ...reorder(group, (a) => a.id, "option_order", id, dir)] };
    });

  // ---------- add helpers ----------
  function nextNumericId(prefix: string, existing: string[]): string {
    const re = new RegExp(`^${prefix}(\\d+)`);
    let max = 0;
    for (const id of existing) {
      const mm = id.match(re);
      if (mm) max = Math.max(max, parseInt(mm[1], 10));
    }
    return `${prefix}${max + 1}`;
  }

  const addSection = (qtype: string) =>
    edit((m) => {
      const prefix = qtype === "objective" ? "S" : "A";
      const id = nextNumericId(prefix, m.sections.map((s) => s.section_id));
      const order = Math.max(0, ...m.sections.filter((s) => s.questionnaire_type === qtype).map((s) => s.sort_order)) + 1;
      const sec: EditorSection = {
        section_id: id,
        section_name: "New section",
        questionnaire_type: qtype,
        sort_order: order,
        active: true,
        max_score: 0,
      };
      return { ...m, sections: [...m.sections, sec] };
    });

  const addQuestion = (sectionId: string, qtype: string) =>
    edit((m) => {
      const prefix = qtype === "objective" ? "Q" : "AQ";
      const id = nextNumericId(prefix, m.questions.map((q) => q.question_id));
      const num = Math.max(0, ...m.questions.filter((q) => q.questionnaire_type === qtype).map((q) => q.question_number)) + 1;
      const order = Math.max(0, ...m.questions.filter((q) => q.section_id === sectionId).map((q) => q.sort_order)) + 1;
      const q: EditorQuestion = {
        question_id: id,
        section_id: sectionId,
        questionnaire_type: qtype,
        question_number: num,
        question_text: "New question",
        response_type: "SingleSelect",
        sort_order: order,
        active: true,
        max_score: 1,
      };
      const a1: EditorAnswer = {
        id: `${id}_A1`, question_id: id, section_id: sectionId, option_order: 1,
        answer_text: "First answer", points: 0, value_min: null, value_max: null, value_type: "Text", active: true,
      };
      const a2: EditorAnswer = {
        id: `${id}_A2`, question_id: id, section_id: sectionId, option_order: 2,
        answer_text: "Second answer", points: 1, value_min: null, value_max: null, value_type: "Text", active: true,
      };
      return { ...m, questions: [...m.questions, q], answers: [...m.answers, a1, a2] };
    });

  const addAnswer = (questionId: string, sectionId: string | null) =>
    edit((m) => {
      const opts = m.answers.filter((a) => a.question_id === questionId);
      const order = Math.max(0, ...opts.map((a) => a.option_order)) + 1;
      const id = `${questionId}_A${order}${opts.some((a) => a.id === `${questionId}_A${order}`) ? `_${order}` : ""}`;
      const a: EditorAnswer = {
        id, question_id: questionId, section_id: sectionId, option_order: order,
        answer_text: "New answer", points: 0, value_min: null, value_max: null, value_type: "Text", active: true,
      };
      return { ...m, answers: [...m.answers, a] };
    });

  // ---------- save ----------
  async function doSave() {
    setSaving(true);
    try {
      await save({ data: model });
      toast.success("Saved — changes are live");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
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

  return (
    <main className="min-h-screen pb-28">
      <header className="border-b border-border/60 sticky top-0 bg-background/95 backdrop-blur z-20">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Admin</p>
            <h1 className="text-lg font-semibold tracking-tight">Questionnaire editor</h1>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/submissions">
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                Submissions
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="h-3.5 w-3.5 mr-1.5" />
              Sign out
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-6 flex gap-1 flex-wrap border-t border-border/40">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2.5 text-[13px] font-medium border-b-2 -mb-px ${
                tab === t.key
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {(tab === "objective" || tab === "advisory") && (
          <EditorPane
            qtype={tab}
            model={model}
            qMax={qMax}
            secMax={secMax}
            totalFor={totalFor}
            isInfoQuestion={isInfoQuestion}
            objectiveTopBand={objectiveTopBand}
            patchSection={patchSection}
            patchQuestion={patchQuestion}
            patchAnswer={patchAnswer}
            moveSection={moveSection}
            moveQuestion={moveQuestion}
            moveAnswer={moveAnswer}
            addSection={addSection}
            addQuestion={addQuestion}
            addAnswer={addAnswer}
          />
        )}
        {tab === "bands" && (
          <BandsPane model={model} patchBand={patchBand} objectiveTotal={totalFor("objective")} objectiveTopBand={objectiveTopBand} />
        )}
        {tab === "multiples" && <MultiplesPane model={model} patchMultiple={patchMultiple} />}
      </div>

      {/* Save bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 backdrop-blur z-30">
        <div className="mx-auto max-w-5xl px-6 py-3 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {dirty ? <span className="text-foreground font-medium">Unsaved changes</span> : "All changes saved"}
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={reload} disabled={!dirty || saving}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Revert
            </Button>
            <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={!dirty || saving}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Publish changes to the live questionnaire?"
        description={
          <span>
            These edits go live on kriterionbvi.com immediately. Existing client submissions keep their original
            answers and scores — only new submissions use the updated questionnaire.
            <br />
            <br />
            Objective max score: <b>{totalFor("objective")} pts</b> · Advisory max score:{" "}
            <b>{totalFor("advisory")} pts</b>
            {totalFor("objective") !== objectiveTopBand && (
              <span className="block mt-2 text-amber-700 dark:text-amber-300">
                ⚠ Objective max score ({totalFor("objective")}) no longer matches the top score band (
                {objectiveTopBand}). Review the Score bands tab before publishing.
              </span>
            )}
          </span>
        }
        confirmLabel="Yes, publish live"
        onConfirm={() => void doSave()}
      />
    </main>
  );
}

/* ============================ Editor pane ============================ */
function EditorPane(props: {
  qtype: "objective" | "advisory";
  model: Model;
  qMax: (id: string) => number;
  secMax: (id: string) => number;
  totalFor: (q: string) => number;
  isInfoQuestion: (id: string) => boolean;
  objectiveTopBand: number;
  patchSection: (id: string, p: Partial<EditorSection>) => void;
  patchQuestion: (id: string, p: Partial<EditorQuestion>) => void;
  patchAnswer: (id: string, p: Partial<EditorAnswer>) => void;
  moveSection: (qtype: string, id: string, dir: -1 | 1) => void;
  moveQuestion: (sectionId: string, id: string, dir: -1 | 1) => void;
  moveAnswer: (questionId: string, id: string, dir: -1 | 1) => void;
  addSection: (qtype: string) => void;
  addQuestion: (sectionId: string, qtype: string) => void;
  addAnswer: (questionId: string, sectionId: string | null) => void;
}) {
  const { qtype, model } = props;
  const sections = model.sections
    .filter((s) => s.questionnaire_type === qtype)
    .sort((a, b) => a.sort_order - b.sort_order);
  const total = props.totalFor(qtype);
  const covered = qtype === "objective" ? total === props.objectiveTopBand : true;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Stat label="Sections" value={sections.filter((s) => s.active !== false).length} />
        <Stat label="Questions" value={model.questions.filter((q) => q.questionnaire_type === qtype && q.active !== false).length} />
        <Stat label="Max possible score" value={`${total} pts`} />
        {qtype === "objective" ? (
          covered ? (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> Score bands cover 0–{total}
            </span>
          ) : (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" /> Max is {total}, top band ends at {props.objectiveTopBand} — update Score bands
            </span>
          )
        ) : (
          <span className="ml-auto text-xs text-muted-foreground">Adjusted score is normalized to 0–100 (see Score bands)</span>
        )}
      </div>

      {sections.map((s, si) => {
        const questions = model.questions
          .filter((q) => q.section_id === s.section_id)
          .sort((a, b) => a.sort_order - b.sort_order);
        const info = s.max_score === 0 && questions.every((q) => props.isInfoQuestion(q.question_id));
        return (
          <div
            key={s.section_id}
            className={`rounded-xl border border-border bg-card shadow-sm mb-4 ${s.active === false ? "opacity-50" : ""}`}
          >
            <div className="flex items-center gap-2 p-3 border-b border-border bg-muted/30 rounded-t-xl">
              <span className="font-mono text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {s.section_id}
              </span>
              <Input
                value={s.section_name}
                onChange={(e) => props.patchSection(s.section_id, { section_name: e.target.value })}
                className="h-8 font-semibold flex-1 min-w-[120px]"
              />
              {info ? (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-2 py-1 rounded-full">
                  Info · not scored
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-primary bg-muted border border-border px-2.5 py-1 rounded-full whitespace-nowrap">
                  Section max: {props.secMax(s.section_id)}
                </span>
              )}
              <IconBtn title="Move up" disabled={si === 0} onClick={() => props.moveSection(qtype, s.section_id, -1)}>
                <ChevronUp className="h-4 w-4" />
              </IconBtn>
              <IconBtn title="Move down" disabled={si === sections.length - 1} onClick={() => props.moveSection(qtype, s.section_id, 1)}>
                <ChevronDown className="h-4 w-4" />
              </IconBtn>
              <IconBtn
                title={s.active === false ? "Restore section" : "Hide section"}
                onClick={() => props.patchSection(s.section_id, { active: s.active === false })}
              >
                {s.active === false ? <RotateCcw className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </IconBtn>
            </div>

            <div>
              {questions.map((q, qi) => {
                const qInfo = props.isInfoQuestion(q.question_id);
                const answers = model.answers
                  .filter((a) => a.question_id === q.question_id)
                  .sort((a, b) => a.option_order - b.option_order);
                const qmax = props.qMax(q.question_id);
                return (
                  <div key={q.question_id} className={`p-3 pl-4 border-b border-border last:border-b-0 ${q.active === false ? "opacity-50" : ""}`}>
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground mt-2 whitespace-nowrap">Q{q.question_number}</span>
                      <textarea
                        value={q.question_text}
                        onChange={(e) => props.patchQuestion(q.question_id, { question_text: e.target.value })}
                        rows={1}
                        className="flex-1 resize-none rounded-md border border-transparent hover:border-border focus:border-ring focus:outline-none bg-transparent px-2 py-1.5 text-sm min-h-[34px]"
                      />
                      {qInfo ? (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-2 py-1 rounded-full mt-1">Not scored</span>
                      ) : (
                        <span className="text-[11px] font-semibold text-primary bg-muted border border-border px-2.5 py-1 rounded-full mt-1 whitespace-nowrap">
                          Q max: {qmax}
                        </span>
                      )}
                      <div className="flex gap-1 mt-1">
                        <IconBtn title="Move up" disabled={qi === 0} onClick={() => props.moveQuestion(s.section_id, q.question_id, -1)}>
                          <ChevronUp className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn title="Move down" disabled={qi === questions.length - 1} onClick={() => props.moveQuestion(s.section_id, q.question_id, 1)}>
                          <ChevronDown className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn
                          title={q.active === false ? "Restore" : "Hide question"}
                          onClick={() => props.patchQuestion(q.question_id, { active: q.active === false })}
                        >
                          {q.active === false ? <RotateCcw className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </IconBtn>
                      </div>
                    </div>

                    <div className="mt-2 pl-6">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground text-left">
                            <th className="w-8 font-semibold py-1">#</th>
                            <th className="font-semibold py-1">Answer</th>
                            {!qInfo && <th className="w-20 font-semibold py-1">Points</th>}
                            <th className="w-40 font-semibold py-1">Value type</th>
                            <th className="w-20" />
                          </tr>
                        </thead>
                        <tbody>
                          {answers.map((a, ai) => {
                            const top = !qInfo && qmax > 0 && Number(a.points) === qmax && a.active !== false;
                            const range = a.value_type && a.value_type !== "Text";
                            return (
                              <tr key={a.id} className={`border-t border-border/60 ${a.active === false ? "opacity-40" : ""}`}>
                                <td className="text-center text-muted-foreground text-xs py-1">{ai + 1}</td>
                                <td className="py-1 pr-2">
                                  <Input
                                    value={a.answer_text}
                                    onChange={(e) => props.patchAnswer(a.id, { answer_text: e.target.value })}
                                    className="h-8"
                                  />
                                </td>
                                {!qInfo && (
                                  <td className="py-1 pr-2">
                                    <Input
                                      type="number"
                                      value={a.points ?? ""}
                                      onChange={(e) =>
                                        props.patchAnswer(a.id, {
                                          points: e.target.value === "" ? null : Number(e.target.value),
                                        })
                                      }
                                      className={`h-8 w-16 text-center font-semibold ${top ? "border-emerald-500/50 bg-emerald-500/10" : ""}`}
                                    />
                                  </td>
                                )}
                                <td className="py-1 text-xs text-muted-foreground">
                                  {a.value_type || "Text"}
                                  {range && (
                                    <span className="block text-[11px] opacity-70">
                                      {a.value_min ?? "−"} to {a.value_max ?? "+"}
                                    </span>
                                  )}
                                </td>
                                <td className="py-1">
                                  <div className="flex gap-1 justify-end">
                                    <IconBtn title="Move up" disabled={ai === 0} onClick={() => props.moveAnswer(q.question_id, a.id, -1)}>
                                      <ChevronUp className="h-4 w-4" />
                                    </IconBtn>
                                    <IconBtn title="Move down" disabled={ai === answers.length - 1} onClick={() => props.moveAnswer(q.question_id, a.id, 1)}>
                                      <ChevronDown className="h-4 w-4" />
                                    </IconBtn>
                                    <IconBtn
                                      title={a.active === false ? "Restore" : "Hide answer"}
                                      onClick={() => props.patchAnswer(a.id, { active: a.active === false })}
                                    >
                                      {a.active === false ? <RotateCcw className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                    </IconBtn>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <MiniBtn onClick={() => props.addAnswer(q.question_id, s.section_id)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add answer
                      </MiniBtn>
                    </div>
                  </div>
                );
              })}
              <div className="p-3 pl-6">
                <MiniBtn onClick={() => props.addQuestion(s.section_id, qtype)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add question to {s.section_name}
                </MiniBtn>
              </div>
            </div>
          </div>
        );
      })}

      <button
        onClick={() => props.addSection(qtype)}
        className="w-full rounded-xl border border-dashed border-border bg-card py-3 text-sm font-semibold text-muted-foreground hover:text-primary hover:border-ring"
      >
        <Plus className="h-4 w-4 mr-1.5 inline" /> Add a new section
      </button>
    </div>
  );
}

/* ============================ Bands pane ============================ */
function BandsPane(props: {
  model: Model;
  patchBand: (id: string, p: Partial<EditorScoreBand>) => void;
  objectiveTotal: number;
  objectiveTopBand: number;
}) {
  const obj = props.model.scoreBands
    .filter((b) => b.band_type === "ObjectivePosition")
    .sort((a, b) => a.min_score - b.min_score);
  const adj = props.model.scoreBands
    .filter((b) => b.band_type === "AdjustedValueScore")
    .sort((a, b) => a.min_score - b.min_score);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-semibold">Objective Position bands</h2>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2">
          Maps a client's total <b>objective</b> score to a market-position label. These should cover the full
          possible range with no gaps.
        </p>
        {props.objectiveTotal === props.objectiveTopBand ? (
          <p className="text-xs rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-3 py-2 mb-2">
            ✓ These bands cover the full objective range (0–{props.objectiveTotal}).
          </p>
        ) : (
          <p className="text-xs rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 mb-2">
            ⚠ The objective max score is now <b>{props.objectiveTotal}</b> but the top band ends at{" "}
            <b>{props.objectiveTopBand}</b>. Adjust the ranges so every score maps to a band.
          </p>
        )}
        <BandTable bands={obj} patchBand={props.patchBand} />
      </div>
      <div>
        <h2 className="text-sm font-semibold">Adjusted Value Score bands</h2>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2">
          Maps the <b>adjusted</b> score (normalized to 0–100) to a value band shown to advisors and clients.
        </p>
        <BandTable bands={adj} patchBand={props.patchBand} />
      </div>
    </div>
  );
}

function BandTable({
  bands,
  patchBand,
}: {
  bands: EditorScoreBand[];
  patchBand: (id: string, p: Partial<EditorScoreBand>) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground text-left">
            <th className="px-3 py-2">ID</th>
            <th className="px-3 py-2 w-24">Min</th>
            <th className="px-3 py-2 w-24">Max</th>
            <th className="px-3 py-2">Label</th>
            <th className="px-3 py-2">Tag</th>
          </tr>
        </thead>
        <tbody>
          {bands.map((b) => (
            <tr key={b.id} className="border-t border-border">
              <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{b.id}</td>
              <td className="px-2 py-1.5">
                <Input
                  type="number"
                  value={b.min_score}
                  onChange={(e) => patchBand(b.id, { min_score: Number(e.target.value) })}
                  className="h-8 w-20 text-center"
                />
              </td>
              <td className="px-2 py-1.5">
                <Input
                  type="number"
                  value={b.max_score}
                  onChange={(e) => patchBand(b.id, { max_score: Number(e.target.value) })}
                  className="h-8 w-20 text-center"
                />
              </td>
              <td className="px-2 py-1.5">
                <Input value={b.label} onChange={(e) => patchBand(b.id, { label: e.target.value })} className="h-8" />
              </td>
              <td className="px-2 py-1.5">
                <Input
                  value={b.extra_value ?? ""}
                  onChange={(e) => patchBand(b.id, { extra_value: e.target.value })}
                  className="h-8"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============================ Multiples pane ============================ */
function MultiplesPane({
  model,
  patchMultiple,
}: {
  model: Model;
  patchMultiple: (idx: number, p: Partial<EditorMultiple>) => void;
}) {
  const rows = [...model.valuationMultiples].sort((a, b) => a.band_index - b.band_index);
  return (
    <div>
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 px-4 py-3 text-sm mb-4 flex gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <b>This table drives the valuation math.</b> Each row is a multiplier anchor the model interpolates
          between as a client's score rises (anchor 0 = a score of zero; the last anchor = the maximum score).
          Changing these numbers changes every future client's calculated valuation.
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground text-left">
              <th className="px-3 py-2 w-28">Anchor</th>
              <th className="px-3 py-2">Net Fee Income multiple</th>
              <th className="px-3 py-2">EBITDA multiple</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <tr key={m.band_index} className="border-t border-border">
                <td className="px-3 py-1.5 text-muted-foreground">
                  {i === 0 ? "Score 0" : i === rows.length - 1 ? "Max score" : `Anchor ${i + 1}`}
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    type="number"
                    step="0.1"
                    value={m.nfi_multiple}
                    onChange={(e) => patchMultiple(m.band_index, { nfi_multiple: Number(e.target.value) })}
                    className="h-8 w-28"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    type="number"
                    step="0.1"
                    value={m.ebitda_multiple}
                    onChange={(e) => patchMultiple(m.band_index, { ebitda_multiple: Number(e.target.value) })}
                    className="h-8 w-28"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================ small UI bits ============================ */
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:border-ring disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function MiniBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded-md border border-dashed border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-primary hover:border-ring mt-2"
    >
      {children}
    </button>
  );
}
