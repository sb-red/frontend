"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  defaultCodeByLanguage,
  type Language,
  type SoftGateFunction,
  useFunctionStore,
} from "@/lib/stores/use-function-store";
import {
  createFunction,
  deleteFunction,
  getFunction,
  getInvocationStatus,
  invokeFunction,
  listFunctions,
  listInvocations,
  type InvocationListItem,
} from "@/lib/api";
import { useShallow } from "zustand/shallow";

const languageMeta: Record<
  Language,
  { label: string; short: string; badgeClass: string }
> = {
  python: {
    label: "Python",
    short: "Py",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
  },
  node: {
    label: "Node.js",
    short: "Js",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  go: {
    label: "Go",
    short: "Go",
    badgeClass: "bg-sky-100 text-sky-800 border-sky-200",
  },
};

type RunStatus = "idle" | "queued" | "processing" | "success" | "fail";

const statusMeta: Record<
  RunStatus,
  { label: string; className: string; textClass: string }
> = {
  idle: {
    label: "Idle",
    className: "bg-muted text-foreground border-border",
    textClass: "text-muted-foreground",
  },
  queued: {
    label: "Queued",
    className: "bg-amber-100 border-amber-200",
    textClass: "text-amber-900",
  },
  processing: {
    label: "Processing",
    className: "bg-blue-100 border-blue-200",
    textClass: "text-blue-900",
  },
  success: {
    label: "Success",
    className: "bg-emerald-100 border-emerald-200",
    textClass: "text-emerald-900",
  },
  fail: {
    label: "Fail",
    className: "bg-red-100 border-red-200",
    textClass: "text-red-900",
  },
};

const formatDuration = (ms?: number | null) => {
  if (ms === undefined || ms === null) return "-";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
};

const runtimeForLanguage: Record<Language, string> = {
  python: "python",
  node: "node",
  go: "go",
};

const MAX_POLL_ATTEMPTS = 60; // ~60s with 1s interval
const MAX_STUCK_ATTEMPTS = 30; // ~30s without status change

const samplePayload = `{
  "event": "ping",
  "payload": {
    "requestId": "job-1234",
    "message": "demonstrate 3-panel layout",
    "delayMs": 1200
  }
}`;

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[460px] items-center justify-center rounded-lg border bg-muted/40 text-sm text-muted-foreground">
      Loading editor...
    </div>
  ),
});

export default function Home() {
  const {
    functions,
    selectedId,
    setSelected,
    setCode,
    changeLanguage,
    setFunctions,
    upsertFunction,
    removeFunction,
    mergeFunction,
  } =
    useFunctionStore(
      useShallow((state) => ({
        functions: state.functions,
        selectedId: state.selectedId,
        setSelected: state.setSelected,
        setCode: state.setCode,
        changeLanguage: state.changeLanguage,
        setFunctions: state.setFunctions,
        upsertFunction: state.upsertFunction,
        removeFunction: state.removeFunction,
        mergeFunction: state.mergeFunction,
      })),
    );

  const selectedFunction = functions.find((fn) => fn.id === selectedId) ?? null;
  const selectedLanguage = selectedFunction?.language ?? "python";
  const [payload, setPayload] = useState(samplePayload);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"output" | "history">("output");
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [runLogs, setRunLogs] = useState<string[]>([]);
  const [runResult, setRunResult] = useState<string>("");
  const [runDurationMs, setRunDurationMs] = useState<number | null>(null);
  const [historyRows, setHistoryRows] = useState<InvocationListItem[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const pollRef = useRef<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createLanguage, setCreateLanguage] = useState<Language>("python");
  const [createDescription, setCreateDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [draftCounter, setDraftCounter] = useState(0);
  const lastFetchedFunctionId = useRef<number | null>(null);
  const pollAttemptsRef = useRef(0);
  const [search, setSearch] = useState("");
  const runTimeoutRef = useRef<number | null>(null);
  const lastStatusRef = useRef<RunStatus | null>(null);
  const stuckCountRef = useRef(0);

  const languageOptions = useMemo(
    () =>
      Object.entries(languageMeta).map(([value, meta]) => ({
        value: value as Language,
        label: meta.label,
      })),
    [],
  );

  const functionNameMap = useMemo(() => {
    const map = new Map<number, string>();
    functions.forEach((fn) => map.set(fn.id, fn.name));
    return map;
  }, [functions]);

  const filteredFunctions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return functions;
    return functions.filter((fn) => {
      const name = fn.name.toLowerCase();
      const desc = fn.description?.toLowerCase() ?? "";
      return name.includes(term) || desc.includes(term);
    });
  }, [functions, search]);

  const mapRuntimeToLanguage = useCallback((runtime: string | undefined): Language => {
    const normalized = runtime?.toLowerCase() ?? "";
    if (normalized.includes("py")) return "python";
    if (normalized.includes("go")) return "go";
    return "node";
  }, []);

  const parsePayloadSafely = () => {
    try {
      return JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;

    const loadFunctions = async () => {
      try {
        const remoteFns = await listFunctions();
        if (cancelled) return;
        const mapped: SoftGateFunction[] = remoteFns.map((fn) => {
          const lang = mapRuntimeToLanguage(fn.runtime);
          return {
            id: fn.id,
            name: fn.name,
            language: lang,
            code: defaultCodeByLanguage[lang],
            description: fn.description,
          };
        });
        if (mapped.length > 0) {
          setFunctions(mapped);
        }
      } catch (error) {
        console.error("Failed to load functions", error);
      }
    };

    loadFunctions();

    return () => {
      cancelled = true;
    };
  }, [mapRuntimeToLanguage, setFunctions]);

  const handleSelectFunction = (fn: SoftGateFunction) => {
    setSelected(fn.id);
  };

  const handleLanguageChange = (lang: Language) => {
    changeLanguage(lang);
  };

  const handlePayloadChange = (value: string | undefined) => {
    const next = value ?? "";
    setPayload(next);
    try {
      JSON.parse(next);
      setJsonError(null);
    } catch {
      setJsonError("유효한 JSON 형식이 아닙니다.");
    }
  };

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
  };

  const handleCreateFunction = () => {
    if (!createName.trim()) {
      showToast("error", "함수 이름을 입력하세요.");
      return;
    }
    const draftId = -(draftCounter + 1);
    setDraftCounter((n) => n + 1);
    const lang = createLanguage;
    const draftFn: SoftGateFunction = {
      id: draftId,
      name: createName.trim(),
      language: lang,
      code: defaultCodeByLanguage[lang],
      description: createDescription || undefined,
    };
    upsertFunction(draftFn);
    setSelected(draftId);
    setPayload(samplePayload);
    setShowCreateForm(false);
    setCreateName("");
    setCreateDescription("");
    setCreateLanguage("python");
    setRunStatus("idle");
    setRunLogs([]);
    setRunResult("");
    setRunDurationMs(null);
    setRunMessage("새 함수 초안이 생성되었습니다. 코드 편집 후 저장하세요.");
  };

  const handleSave = async () => {
    if (!selectedFunction) return;
    if (selectedFunction.id > 0) {
      showToast(
        "error",
        "API에 업데이트 엔드포인트가 없어 기존 함수는 저장할 수 없습니다. 새 초안을 만든 뒤 저장하세요.",
      );
      return;
    }
    const draftId = selectedFunction.id;
    setIsSaving(true);
    try {
      const res = await createFunction({
        name: selectedFunction.name,
        runtime: runtimeForLanguage[selectedLanguage],
        code: selectedFunction.code,
        description: selectedFunction.description,
        sample_event: parsePayloadSafely(),
      });
      const lang = mapRuntimeToLanguage(res.runtime);
      const savedFn: SoftGateFunction = {
        id: res.id,
        name: res.name,
        language: lang,
        code: res.code ?? selectedFunction.code,
        description: res.description,
      };
      removeFunction(draftId);
      upsertFunction(savedFn);
      setSelected(savedFn.id);
      showToast("success", "저장되었습니다 (서버에 생성됨).");
    } catch (error) {
      showToast(
        "error",
        `저장 실패: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedFunction) return;
    if (!window.confirm("선택한 함수를 삭제할까요?")) return;
    // Draft-only delete
    if (selectedFunction.id < 0) {
      removeFunction(selectedFunction.id);
      clearPoll();
      setRunStatus("idle");
      setRunLogs([]);
      setRunResult("");
      setRunDurationMs(null);
      setRunMessage(null);
      setPayload(samplePayload);
      showToast("success", "초안이 삭제되었습니다.");
      return;
    }
    setIsDeleting(true);
    try {
      await deleteFunction(selectedFunction.id);
      removeFunction(selectedFunction.id);
      clearPoll();
      setRunStatus("idle");
      setRunLogs([]);
      setRunResult("");
      setRunDurationMs(null);
      setRunMessage(null);
      setPayload(samplePayload);
      showToast("success", "삭제되었습니다.");
    } catch (error) {
      showToast(
        "error",
        `삭제 실패: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const normalizeStatus = (status?: string): RunStatus => {
    const normalized = status?.toLowerCase() ?? "";
    if (normalized.includes("queue")) return "queued";
    if (normalized.includes("process") || normalized.includes("run")) return "processing";
    if (normalized.includes("success") || normalized.includes("complete") || normalized.includes("done"))
      return "success";
    if (normalized.includes("fail") || normalized.includes("error")) return "fail";
    return "processing";
  };

  const clearPoll = () => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pollAttemptsRef.current = 0;
    stuckCountRef.current = 0;
    lastStatusRef.current = null;
    if (runTimeoutRef.current !== null) {
      clearTimeout(runTimeoutRef.current);
      runTimeoutRef.current = null;
    }
  };

  const handleRun = () => {
    // Validate again before run to avoid stale error state.
    if (!selectedFunction) {
      setRunMessage("함수를 선택하세요.");
      return;
    }
    if (selectedFunction.id < 0) {
      setRunMessage("저장 후 실행할 수 있습니다.");
      return;
    }

    try {
      const parsed = JSON.parse(payload);
      setJsonError(null);
      setActiveTab("output");
      setRunStatus("queued");
      setRunLogs(["[Queued] Job accepted"]);
      setRunResult("");
      setRunDurationMs(null);
      clearPoll();
      pollAttemptsRef.current = 0;
      stuckCountRef.current = 0;
      lastStatusRef.current = null;
      setIsRunning(true);
      setRunMessage("실행 요청 전송 중...");
      if (runTimeoutRef.current !== null) {
        clearTimeout(runTimeoutRef.current);
      }
      runTimeoutRef.current = window.setTimeout(() => {
        clearPoll();
        setIsRunning(false);
        setRunStatus("fail");
        setRunMessage("실행 시간 초과");
        setRunLogs((prev) => [...prev, "[Error] 실행 시간 초과"]);
      }, 60000);
      const startedAt = Date.now();

      invokeFunction(selectedFunction.id, parsed)
        .then((invokeRes) => {
          const status = normalizeStatus(invokeRes.status);
          setRunStatus(status);
          if (invokeRes.result) {
            setRunResult(JSON.stringify(invokeRes.result, null, 2));
          }
          if (invokeRes.duration_ms !== undefined) {
            setRunDurationMs(invokeRes.duration_ms);
          }

          if (!invokeRes.invocation_id) {
            setRunLogs((prev) => [
              ...prev,
              "[Error] invocation_id가 응답에 없습니다.",
            ]);
            setRunStatus("fail");
            setIsRunning(false);
            setRunMessage("invocation_id 누락");
            return;
          }

          setRunLogs((prev) => [
            ...prev,
            `[Invoke] id=${invokeRes.invocation_id} status=${invokeRes.status ?? "queued"}`,
          ]);

          pollRef.current = window.setInterval(async () => {
            try {
              pollAttemptsRef.current += 1;
              if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
                clearPoll();
                setIsRunning(false);
                setRunStatus("fail");
                setRunMessage("폴링 타임아웃");
                setRunLogs((prev) => [...prev, "[Error] 폴링 타임아웃"]);
                return;
              }

              const res = await getInvocationStatus(
                selectedFunction.id,
                invokeRes.invocation_id as number,
              );
              let polledStatus = normalizeStatus(res.status);
              if (polledStatus === "processing" && res.result) {
                polledStatus = "success";
              }
              if (polledStatus === "processing" && res.error_message) {
                polledStatus = "fail";
              }
              setRunStatus(polledStatus);
              if (res.duration_ms !== undefined) {
                setRunDurationMs(res.duration_ms);
              }
              if (res.result) {
                setRunResult(JSON.stringify(res.result, null, 2));
              }
              if (res.logged_at) {
                setRunLogs((prev) => [
                  ...prev,
                  `[${polledStatus}] ${res.logged_at}`,
                ]);
              }

              if (polledStatus === lastStatusRef.current) {
                stuckCountRef.current += 1;
              } else {
                stuckCountRef.current = 0;
              }
              lastStatusRef.current = polledStatus;

              if (
                (polledStatus === "processing" || polledStatus === "queued") &&
                stuckCountRef.current >= MAX_STUCK_ATTEMPTS
              ) {
                clearPoll();
                setIsRunning(false);
                setRunStatus("fail");
                setRunMessage("상태 변화 없이 대기 시간 초과");
                setRunLogs((prev) => [...prev, "[Error] 상태 변화 없음으로 중단"]);
                return;
              }

              if (polledStatus === "success" || polledStatus === "fail") {
                clearPoll();
                setIsRunning(false);
                setRunMessage(
                  polledStatus === "success"
                    ? "실행 완료"
                    : res.error_message ?? "실행 실패",
                );
                if (res.duration_ms === undefined) {
                  setRunDurationMs(Date.now() - startedAt);
                }
              }
            } catch (error) {
              clearPoll();
              setIsRunning(false);
              setRunStatus("fail");
              setRunMessage(
                `폴링 실패: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              );
              setRunLogs((prev) => [
                ...prev,
                `[Error] ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              ]);
            }
          }, 1000);
        })
        .catch((error) => {
          clearPoll();
          setIsRunning(false);
          setRunStatus("fail");
          setRunMessage(
            `실행 요청 실패: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
          setRunLogs((prev) => [
            ...prev,
            `[Error] ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          ]);
        });
    } catch {
      setJsonError("유효한 JSON 형식이 아닙니다.");
    }
  };

  useEffect(() => {
    return () => {
      clearPoll();
    };
  }, []);

  useEffect(() => {
    if (!selectedFunction || selectedFunction.id < 0) return;
    if (lastFetchedFunctionId.current === selectedFunction.id) return;
    let cancelled = false;
    lastFetchedFunctionId.current = selectedFunction.id;

    getFunction(selectedFunction.id)
      .then((detail) => {
        if (cancelled) return;
        const lang = mapRuntimeToLanguage(detail.runtime);
        mergeFunction(selectedFunction.id, {
          language: lang,
          code: detail.code ?? selectedFunction.code,
          description: detail.description,
        });
        if (detail.code) {
          setCode(detail.code);
        }
        if (detail.sample_event) {
          try {
            setPayload(JSON.stringify(detail.sample_event, null, 2));
            setJsonError(null);
          } catch {
            // ignore stringify issues
          }
        }
      })
      .catch((error) => {
        console.error("함수 상세 조회 실패", error);
      });

    return () => {
      cancelled = true;
    };
  }, [mapRuntimeToLanguage, mergeFunction, selectedFunction, setCode]);

useEffect(() => {
  if (activeTab !== "history" || !selectedFunction || selectedFunction.id < 0) {
    return;
  }
  let cancelled = false;
  setHistoryError(null);
  setHistoryLoading(true);
  setHistoryRows([]);
  listInvocations(selectedFunction.id, 20)
    .then((rows) => {
      if (cancelled) return;
      setHistoryRows(rows);
    })
    .catch((error) => {
      if (cancelled) return;
      setHistoryError(
        error instanceof Error ? error.message : "이력 불러오기에 실패했습니다.",
      );
      setHistoryRows([]);
    })
    .finally(() => {
      if (!cancelled) setHistoryLoading(false);
    });

  return () => {
    cancelled = true;
  };
}, [activeTab, selectedFunction]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.08),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.08),transparent_30%),radial-gradient(circle_at_50%_80%,rgba(16,185,129,0.08),transparent_30%)]" />
      <div className="pointer-events-none absolute -right-16 top-10 h-48 w-48 rounded-full bg-red-400/25 blur-3xl mix-blend-screen" />
      <div className="pointer-events-none absolute -left-10 bottom-12 h-56 w-56 rounded-full bg-emerald-300/20 blur-3xl mix-blend-screen" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_10%,rgba(255,255,255,0.25),transparent_30%),radial-gradient(circle_at_70%_90%,rgba(255,255,255,0.2),transparent_35%)]" />
      {toast && (
        <div
          className={cn(
            "fixed right-4 top-4 z-50 rounded-lg border px-4 py-2 text-sm shadow-lg backdrop-blur",
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900",
          )}
        >
          {toast.message}
        </div>
      )}
      <div className="relative mx-auto flex min-h-screen w-full max-w-screen-2xl flex-col gap-6 px-4 py-8 lg:px-10">
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-1.5 rounded-full bg-gradient-to-b from-slate-900 via-slate-700 to-slate-400" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                  Trusted Infra
                </p>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                  SoftGate Console
                </h1>
              </div>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-slate-200/80 bg-white/70 px-3 py-1 text-xs font-medium text-slate-500 shadow-sm backdrop-blur md:flex">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.25)]" />
              Live Workspace
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                <span aria-hidden>🎄</span> Holiday
              </span>
            </div>
          </div>
          <p className="text-sm text-slate-600">
            Serverless Function Workspace
          </p>
        </header>

        <div className="grid flex-1 gap-4 auto-rows-[minmax(0,1fr)] lg:grid-cols-[2fr_5fr_3fr]">
          <Card className="h-full rounded-2xl border border-slate-200/80 bg-white/80 shadow-lg shadow-slate-200/60 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b pb-4">
              <CardTitle className="text-base">함수 목록</CardTitle>
              <Button
                size="sm"
                onClick={() => setShowCreateForm((prev) => !prev)}
                variant={showCreateForm ? "secondary" : "default"}
              >
                {showCreateForm ? "닫기" : "+ 함수 생성"}
              </Button>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search functions"
                  className="h-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
                    Clear
                  </Button>
                )}
              </div>
              {showCreateForm && (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm">
                  <Input
                    placeholder="함수 이름"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    className="h-9"
                  />
                  <select
                    value={createLanguage}
                    onChange={(e) =>
                      setCreateLanguage(e.target.value as Language)
                    }
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
                  >
                    {languageOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    placeholder="설명 (선택)"
                    value={createDescription}
                    onChange={(e) => setCreateDescription(e.target.value)}
                    className="h-9"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={handleCreateFunction}
                    >
                      생성
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowCreateForm(false);
                        setCreateName("");
                        setCreateDescription("");
                        setCreateLanguage("python");
                      }}
                    >
                      취소
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    생성 시 기본 템플릿 코드가 에디터에 표시됩니다.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                {filteredFunctions.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                    검색 결과가 없습니다.
                  </div>
                )}
                {filteredFunctions.map((fn) => {
                  const meta = languageMeta[fn.language];
                  const isActive = selectedId === fn.id;
                  return (
                    <button
                      key={fn.id}
                      type="button"
                      onClick={() => handleSelectFunction(fn)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl border border-slate-200/60 bg-white/70 px-3 py-2 text-left text-sm transition shadow-sm",
                        "hover:border-primary/50 hover:bg-slate-50",
                        isActive &&
                          "border-primary/60 bg-slate-100 ring-2 ring-primary/30 shadow-md",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex size-9 items-center justify-center rounded-full border text-xs font-semibold shadow-sm bg-white",
                            meta.badgeClass,
                          )}
                        >
                          {meta.short}
                        </span>
                        <div>
                          <span className="block font-medium">{fn.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {meta.label}
                          </span>
                        </div>
                      </div>
                      {isActive && (
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                          Active
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="h-full rounded-2xl border border-slate-200/80 bg-white/80 shadow-lg shadow-slate-200/60 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b pb-4">
              <CardTitle className="text-base">코드 에디터</CardTitle>
              <div className="flex items-center gap-2">
                <select
                  value={selectedLanguage}
                  onChange={(event) =>
                    handleLanguageChange(event.target.value as Language)
                  }
                  className="h-9 rounded-md border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
                >
                  {languageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleSave}
                  disabled={isSaving || !selectedFunction}
                >
                  {isSaving ? "저장 중..." : "저장"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isDeleting || !selectedFunction}
                >
                  {isDeleting ? "삭제 중..." : "삭제"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 space-y-3">
              <MonacoEditor
                height="460px"
                language={selectedLanguage === "node" ? "javascript" : selectedLanguage}
                value={selectedFunction?.code ?? defaultCodeByLanguage.python}
                onChange={(value) => setCode(value ?? "")}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  scrollBeyondLastLine: false,
                  renderWhitespace: "selection",
                  automaticLayout: true,
                }}
                className="overflow-hidden rounded-xl border border-slate-900/40 shadow-inner"
              />
            </CardContent>
          </Card>

          <Card className="h-full rounded-2xl border border-slate-200/80 bg-white/80 shadow-lg shadow-slate-200/60 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b pb-4">
              <CardTitle className="text-base">실행 입력/상태</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setPayload(samplePayload);
                  setJsonError(null);
                  setRunMessage(null);
                  setRunStatus("idle");
                  setRunLogs([]);
                  setRunResult("");
                  setRunDurationMs(null);
                  setIsRunning(false);
                  clearPoll();
                }}
              >
                Reset
              </Button>
            </CardHeader>
            <CardContent className="flex h-full flex-col space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Payload 미리보기</p>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-inner">
                  <MonacoEditor
                    height="220px"
                    language="json"
                    value={payload}
                    onChange={handlePayloadChange}
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 12,
                      scrollBeyondLastLine: false,
                      renderWhitespace: "selection",
                      automaticLayout: true,
                    }}
                    className="monaco-input"
                  />
                </div>
                {jsonError ? (
                  <p className="text-xs font-medium text-destructive">
                    {jsonError}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    JSON valid. 실행 시 payload로 전송됩니다.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={handleRun}
                  disabled={
                    Boolean(jsonError) || isRunning || !selectedFunction || selectedFunction.id < 0
                  }
                >
                  {isRunning ? "실행 중..." : selectedFunction ? "실행" : "함수 선택"}
                </Button>
                {runMessage && (
                  <p className="text-xs text-muted-foreground">{runMessage}</p>
                )}
              </div>
              <div className="flex flex-1 flex-col space-y-3 border-t pt-4 min-h-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1 rounded-md bg-muted/60 p-1 text-sm">
                    <button
                      type="button"
                      onClick={() => setActiveTab("output")}
                      className={cn(
                        "rounded-md px-3 py-1.5 font-medium transition",
                        activeTab === "output"
                          ? "bg-background shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Output
                    </button>
                    <button
                      type="button"
                    onClick={() => setActiveTab("history")}
                    className={cn(
                      "rounded-md px-3 py-1.5 font-medium transition",
                      activeTab === "history"
                        ? "bg-background shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      History
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
                        statusMeta[runStatus].className,
                        statusMeta[runStatus].textClass,
                      )}
                    >
                      {statusMeta[runStatus].label}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                      Duration
                      <span className="text-foreground">{formatDuration(runDurationMs)}</span>
                    </span>
                  </div>
                </div>

                {activeTab === "output" ? (
                  <div
                    className="flex flex-1 min-h-0 w-full flex-col gap-3"
                    style={{ scrollbarGutter: "stable both-edges" }}
                  >
                    {runStatus === "fail" && (
                      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        오류가 발생했습니다. 로그를 확인하세요.
                      </div>
                    )}
                    {!selectedFunction && (
                      <div className="rounded-md border border-border bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                        함수를 선택하면 실행 결과가 표시됩니다.
                      </div>
                    )}
                    <div className="grid h-full min-h-0 w-full grid-rows-[1fr_1fr] gap-3">
                      <div className="flex min-h-0 min-w-0 flex-col rounded-lg border bg-card/60 p-3">
                        <p className="mb-2 text-xs font-semibold text-muted-foreground">
                          Logs
                        </p>
                        <div className="mt-1 flex-1 overflow-auto rounded-md border border-border/60 bg-card/80 p-2 font-mono text-xs leading-relaxed text-foreground/80">
                          {runLogs.length === 0 ? (
                            <p className="text-muted-foreground">No logs yet.</p>
                          ) : (
                            runLogs.map((line, idx) => (
                              <p
                                key={idx}
                                className="whitespace-pre-wrap break-all"
                              >
                                {line}
                              </p>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="flex min-h-0 min-w-0 flex-col rounded-lg border bg-card/60 p-3">
                        <p className="mb-2 text-xs font-semibold text-muted-foreground">
                          Result
                        </p>
                        <pre className="mt-1 flex-1 overflow-auto rounded-md border border-border/60 bg-card/80 p-3 text-xs leading-relaxed text-foreground/80">
                          {runResult || "결과가 아직 없습니다. 실행 후 결과가 표시됩니다."}
                        </pre>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex flex-1 min-h-0 w-full flex-col overflow-hidden rounded-lg border bg-card/60 overflow-y-scroll"
                    style={{ scrollbarGutter: "stable both-edges" }}
                  >
                    {!selectedFunction || selectedFunction.id < 0 ? (
                      <div className="p-3 text-xs text-muted-foreground">
                        함수를 저장한 뒤 이력이 표시됩니다.
                      </div>
                    ) : historyLoading ? (
                      <div className="p-3 text-xs text-muted-foreground">
                        이력 불러오는 중...
                      </div>
                    ) : historyError ? (
                      <div className="p-3 text-xs text-destructive">
                        {historyError}
                      </div>
                    ) : historyRows.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground">
                        이력이 없습니다. 실행 후 기록이 표시됩니다.
                      </div>
                    ) : (
                      <div className="h-full overflow-auto overflow-x-auto">
                        <table className="min-w-full table-fixed text-left text-xs">
                          <thead className="bg-muted/80 text-foreground sticky top-0">
                            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              <th className="px-3 py-2 font-semibold">Function</th>
                              <th className="px-3 py-2 font-semibold">Status</th>
                              <th className="px-3 py-2 font-semibold">Duration</th>
                              <th className="px-3 py-2 font-semibold">Started</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/80">
                            {historyRows.map((row) => {
                              const badgeClass =
                                (row.status ?? "").toLowerCase() === "success"
                                  ? "bg-emerald-100 text-emerald-900"
                                  : "bg-red-100 text-red-900";
                              const fnName =
                                functionNameMap.get(row.function_id ?? -1) ??
                                selectedFunction?.name ??
                                "-";
                              const started =
                                row.invoked_at && row.invoked_at.length >= 19
                                  ? row.invoked_at.slice(0, 19)
                                  : row.invoked_at ?? "-";
                              return (
                                <tr key={row.id} className="hover:bg-accent/40">
                                  <td className="px-3 py-2">{fnName}</td>
                                  <td className="px-3 py-2">
                                    <span
                                      className={cn(
                                        "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                                        badgeClass,
                                      )}
                                    >
                                      {row.status ?? "-"}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground">
                                    {formatDuration(row.duration_ms)}
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground">
                                    {started}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
