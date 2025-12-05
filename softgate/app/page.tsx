"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

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
  } =
    useFunctionStore(
      useShallow((state) => ({
        functions: state.functions,
        selectedId: state.selectedId,
        setSelected: state.setSelected,
        setCode: state.setCode,
        changeLanguage: state.changeLanguage,
        setFunctions: state.setFunctions,
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
  const pollRef = useRef<number | null>(null);

  const languageOptions = useMemo(
    () =>
      Object.entries(languageMeta).map(([value, meta]) => ({
        value: value as Language,
        label: meta.label,
      })),
    [],
  );

  const mapRuntimeToLanguage = (runtime: string | undefined): Language => {
    const normalized = runtime?.toLowerCase() ?? "";
    if (normalized.includes("py")) return "python";
    if (normalized.includes("go")) return "go";
    return "node";
  };

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
      } finally {
        // no-op
      }
    };

    loadFunctions();

    return () => {
      cancelled = true;
    };
  }, [setFunctions]);

  const handleSelectFunction = (fn: SoftGateFunction) => {
    setSelected(fn.id);
  };

  const handleLanguageChange = (lang: Language) => {
    changeLanguage(lang);
  };

  const handleSave = () => {
    if (!selectedFunction) return;
    // Placeholder persistence: log out the payload to be wired to an API later.
    console.log("[save]", {
      id: selectedFunction.id,
      name: selectedFunction.name,
      language: selectedFunction.language,
      code: selectedFunction.code,
    });
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

  const normalizeStatus = (status?: string): RunStatus => {
    const normalized = status?.toLowerCase() ?? "";
    if (normalized.startsWith("queue")) return "queued";
    if (normalized.startsWith("process")) return "processing";
    if (normalized.startsWith("success")) return "success";
    if (normalized.startsWith("fail") || normalized === "error") return "fail";
    return "processing";
  };

  const clearPoll = () => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleRun = () => {
    // Validate again before run to avoid stale error state.
    if (!selectedFunction) {
      setRunMessage("함수를 선택하세요.");
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
      setIsRunning(true);
      setRunMessage("실행 요청 전송 중...");
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
              const res = await getInvocationStatus(
                selectedFunction.id,
                invokeRes.invocation_id as number,
              );
              const polledStatus = normalizeStatus(res.status);
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
  if (activeTab !== "history" || !selectedFunction) {
    return;
  }
  let cancelled = false;
  setHistoryError(null);
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
    });

  return () => {
    cancelled = true;
  };
}, [activeTab, selectedFunction]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-muted/40 via-background to-background">
      <div className="mx-auto flex min-h-screen w-full max-w-screen-2xl flex-col gap-6 px-4 py-8 lg:px-10">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-muted-foreground md:text-base">
            SoftGate Console
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                Serverless Function Workspace
              </h1>
              <p className="text-sm text-muted-foreground">
                Phase 1 · Tailwind + shadcn/ui 기반 3단 레이아웃
              </p>
            </div>
            <Button variant="outline" size="sm">
              Preview Only
            </Button>
          </div>
        </header>

        <div className="grid flex-1 gap-4 auto-rows-[minmax(0,1fr)] lg:grid-cols-[2fr_5fr_3fr]">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b pb-4">
              <CardTitle className="text-base">함수 목록</CardTitle>
              <Button size="sm">+ 함수 생성</Button>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              <Input placeholder="Search functions" className="h-10" />
              <div className="space-y-2">
                {functions.map((fn) => {
                  const meta = languageMeta[fn.language];
                  const isActive = selectedId === fn.id;
                  return (
                    <button
                      key={fn.id}
                      type="button"
                      onClick={() => handleSelectFunction(fn)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg border bg-card/60 px-3 py-2 text-left text-sm transition",
                        "hover:border-primary/50 hover:bg-accent",
                        isActive &&
                          "border-primary/60 bg-accent/80 ring-1 ring-primary/40",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex size-9 items-center justify-center rounded-full border text-xs font-semibold shadow-sm",
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

          <Card className="h-full">
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
                <Button size="sm" variant="secondary" onClick={handleSave}>
                  저장
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
              />
            </CardContent>
          </Card>

          <Card className="h-full">
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
            <CardContent className="flex-1 space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Payload 미리보기</p>
                <div className="rounded-lg border bg-muted/40 p-2 shadow-inner">
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
                  disabled={Boolean(jsonError) || isRunning}
                >
                  {isRunning ? "실행 중..." : "실행"}
                </Button>
                {runMessage && (
                  <p className="text-xs text-muted-foreground">{runMessage}</p>
                )}
              </div>
              <div className="space-y-3 border-t pt-4">
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
                      {runDurationMs !== null && (
                        <span className="text-[11px] font-medium text-foreground/70">
                          {runDurationMs}ms
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {activeTab === "output" ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border bg-card/60 p-3">
                      <p className="mb-2 text-xs font-semibold text-muted-foreground">
                        Logs
                      </p>
                      <div className="space-y-1 rounded-md bg-background/60 p-2 font-mono text-xs leading-relaxed text-foreground/80">
                        {runLogs.length === 0 ? (
                          <p className="text-muted-foreground">No logs yet.</p>
                        ) : (
                          runLogs.map((line, idx) => (
                            <p key={idx} className="truncate">
                              {line}
                            </p>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-card/60 p-3">
                      <p className="mb-2 text-xs font-semibold text-muted-foreground">
                        Result
                      </p>
                      <pre className="max-h-56 overflow-auto rounded-md bg-background/60 p-3 text-xs leading-relaxed text-foreground/80">
                        {runResult || "결과가 아직 없습니다. 실행 후 결과가 표시됩니다."}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border bg-card/60">
                    {historyError ? (
                      <div className="p-3 text-xs text-destructive">
                        {historyError}
                      </div>
                    ) : historyRows.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground">
                        이력이 없습니다. 실행 후 기록이 표시됩니다.
                      </div>
                    ) : (
                      <table className="min-w-full text-left text-xs">
                        <thead className="bg-muted/80 text-foreground">
                          <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            <th className="px-3 py-2 font-semibold">Job ID</th>
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
                            return (
                              <tr key={row.id} className="hover:bg-accent/40">
                                <td className="px-3 py-2 font-mono">{row.id}</td>
                                <td className="px-3 py-2">
                                  {selectedFunction?.name ?? "-"}
                                </td>
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
                                  {row.duration_ms !== undefined
                                    ? `${row.duration_ms}ms`
                                    : "-"}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {row.invoked_at ?? "-"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
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
