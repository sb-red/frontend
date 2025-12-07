"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Snowfall from 'react-snowfall'
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  defaultCodeByLanguage,
  editorLanguageFor,
  mapRuntimeToLanguage,
  runtimeForLanguage,
  type Language,
  type SoftGateFunction,
} from "@/lib/functions";
import { cn } from "@/lib/utils";
import {
  createFunction,
  deleteFunction,
  getFunction,
  getInvocationStatus,
  invokeFunction,
  listInvocations,
  listSchedules,
  createSchedule,
  deleteSchedule,
  type InvocationListItem,
} from "@/lib/api";

type HomePageProps = {
  initialFunctions: SoftGateFunction[];
  disableRemoteFetch?: boolean;
};

const languageMeta: Record<
  Language,
  { label: string; short: string; badgeClass: string }
> = {
  python: {
    label: "Python",
    short: "Py",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
  },
  pypy3: {
    label: "PyPy3",
    short: "PyPy",
    badgeClass: "bg-orange-100 text-orange-800 border-orange-200",
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
  cpp: {
    label: "Cpp",
    short: "Cpp",
    badgeClass: "bg-navy-100 text-sky-800 border-sky-200",
  },
  java11: {
    label: "Java 11",
    short: "J11",
    badgeClass: "bg-yellow-100 text-yellow-900 border-yellow-200",
  },
  java17: {
    label: "Java 17",
    short: "J17",
    badgeClass: "bg-amber-100 text-amber-900 border-amber-200",
  },
  java21: {
    label: "Java 21",
    short: "J21",
    badgeClass: "bg-lime-100 text-lime-900 border-lime-200",
  },
  swift: {
    label: "Swift",
    short: "Sw",
    badgeClass: "bg-red-100 text-red-900 border-red-200",
  },
  kotlin: {
    label: "Kotlin (JVM)",
    short: "Kt",
    badgeClass: "bg-purple-100 text-purple-900 border-purple-200",
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

const formatScheduleTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

type ScheduleItem = {
  id: number;
  scheduled_at: string;
  payload?: Record<string, unknown>;
  function_id?: number;
  function_name?: string;
  status?: string;
};

const MAX_POLL_ATTEMPTS = 60; // ~60s with 1s interval
const MAX_STUCK_ATTEMPTS = 30; // ~30s without status change

const samplePayload = `{
  "score": "85"
}`;

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[460px] items-center justify-center rounded-lg border bg-muted/40 text-sm text-muted-foreground">
      Loading editor...
    </div>
  ),
});

export default function HomePage({
  initialFunctions,
  disableRemoteFetch = false,
}: HomePageProps) {
  const [functions, setFunctionsState] = useState<SoftGateFunction[]>(
    initialFunctions,
  );
  const [selectedId, setSelectedId] = useState<number | null>(
    initialFunctions[0]?.id ?? null,
  );
  const selectedFunction = useMemo(
    () => functions.find((fn) => fn.id === selectedId) ?? null,
    [functions, selectedId],
  );
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
  const [toast, setToast] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [draftCounter, setDraftCounter] = useState(0);
  const lastFetchedFunctionId = useRef<number | null>(null);
  const pollAttemptsRef = useRef(0);
  const [search, setSearch] = useState("");
  const runTimeoutRef = useRef<number | null>(null);
  const lastStatusRef = useRef<RunStatus | null>(null);
  const stuckCountRef = useRef(0);
  const remoteEnabled = !disableRemoteFetch;
  const [scheduleTime, setScheduleTime] = useState("");
  const [schedulePayload, setSchedulePayload] = useState(samplePayload);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [schedulesError, setSchedulesError] = useState<string | null>(null);
  const scheduleTimersRef = useRef<Map<number, number>>(new Map());
  const showToast = useCallback(
    (type: "success" | "error", message: string) => {
      setToast({ type, message });
    },
    [],
  );

  const setFunctions = useCallback(
    (next: SoftGateFunction[]) => {
      setFunctionsState(next);
      setSelectedId((current) => {
        if (current !== null && next.some((fn) => fn.id === current)) {
          return current;
        }
        return next[0]?.id ?? null;
      });
    },
    [],
  );

  useEffect(() => {
    setFunctions(initialFunctions);
  }, [initialFunctions, setFunctions]);

  useEffect(() => {
    const dt = new Date(Date.now() + 10 * 60 * 1000);
    const localIso = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setScheduleTime(localIso);
  }, [selectedFunction?.id]);

  const setCode = useCallback(
    (code: string) => {
      setFunctionsState((prev) =>
        prev.map((fn) => (fn.id === selectedId ? { ...fn, code } : fn)),
      );
    },
    [selectedId],
  );

  const changeLanguage = useCallback(
    (language: Language) => {
      setFunctionsState((prev) =>
        prev.map((fn) =>
          fn.id === selectedId
            ? { ...fn, language, code: defaultCodeByLanguage[language] }
            : fn,
        ),
      );
    },
    [selectedId],
  );

  const upsertFunction = useCallback((fn: SoftGateFunction) => {
    setFunctionsState((prev) => {
      const exists = prev.some((item) => item.id === fn.id);
      if (exists) {
        return prev.map((item) => (item.id === fn.id ? { ...item, ...fn } : item));
      }
      return [...prev, fn];
    });
    setSelectedId((current) => current ?? fn.id);
  }, []);

  const removeFunction = useCallback((id: number) => {
    setFunctionsState((prev) => {
      const filtered = prev.filter((fn) => fn.id !== id);
      setSelectedId((current) =>
        current === id ? filtered[0]?.id ?? null : current,
      );
      return filtered;
    });
  }, []);

  const mergeFunction = useCallback(
    (id: number, partial: Partial<SoftGateFunction>) => {
      setFunctionsState((prev) =>
        prev.map((fn) => (fn.id === id ? { ...fn, ...partial } : fn)),
      );
    },
    [],
  );

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

  const parsePayloadSafely = () => {
    try {
      return JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  };

  const clearScheduleTimers = useCallback(() => {
    scheduleTimersRef.current.forEach((id) => window.clearTimeout(id));
    scheduleTimersRef.current.clear();
  }, []);

  const normalizeStatus = useCallback((status?: string): RunStatus => {
    const normalized = status?.toLowerCase() ?? "";
    if (normalized.includes("queue")) return "queued";
    if (normalized.includes("process") || normalized.includes("run")) return "processing";
    if (normalized.includes("success") || normalized.includes("complete") || normalized.includes("done"))
      return "success";
    if (normalized.includes("fail") || normalized.includes("error")) return "fail";
    return "processing";
  }, []);

  const clearPoll = useCallback(() => {
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
  }, []);

  const logScheduleStart = useCallback(
    (item: ScheduleItem) => {
      setActiveTab("output");
      setRunStatus("queued");
      setRunResult("");
      setRunDurationMs(null);
      setIsRunning(true);
      setRunMessage("예약 실행이 시작되었습니다.");
      const targetFnId = item.function_id ?? selectedFunction?.id ?? null;
      setRunLogs((prev) => [
        ...prev,
        `[Schedule] ${new Date(item.scheduled_at).toISOString()} 실행 시작 (id=${item.id})`,
      ]);

      if (!remoteEnabled || !targetFnId || targetFnId < 0) {
        setIsRunning(false);
        return;
      }

      clearPoll();
      pollAttemptsRef.current = 0;
      stuckCountRef.current = 0;
      lastStatusRef.current = null;

      const startedAt = Date.now();
      const payloadToSend = item.payload ?? {};

      invokeFunction(targetFnId, payloadToSend)
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
              "[Schedule] invocation_id가 응답에 없습니다.",
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
                targetFnId,
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
              } else if (res.error_message) {
                setRunResult(res.error_message);
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
                    ? "예약 실행 완료"
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
    },
    [clearPoll, normalizeStatus, remoteEnabled, selectedFunction],
  );

  const registerScheduleTimer = useCallback(
    (item: ScheduleItem) => {
      const time = new Date(item.scheduled_at).getTime();
      if (Number.isNaN(time)) return;
      const now = Date.now();
      const wait = time - now;
      const trigger = () => {
        logScheduleStart(item);
        scheduleTimersRef.current.delete(item.id);
      };
      if (wait <= 0) return;
      const timerId = window.setTimeout(trigger, wait);
      scheduleTimersRef.current.set(item.id, timerId);
    },
    [logScheduleStart],
  );

  const handleScheduleAdd = useCallback(() => {
    if (!remoteEnabled) {
      showToast("error", "백엔드 API 연결이 활성화되지 않았습니다.");
      return;
    }
    const targetFn =
      functions.find((fn) => fn.id === selectedId) ?? functions[0];
    if (!targetFn || targetFn.id < 0) {
      showToast("error", "스케줄을 연결할 함수를 먼저 선택/저장하세요.");
      return;
    }
    if (!scheduleTime) {
      showToast("error", "예약할 날짜와 시간을 선택하세요.");
      return;
    }
    const parsedDate = new Date(scheduleTime);
    if (Number.isNaN(parsedDate.getTime())) {
      showToast("error", "유효한 날짜/시간이 아닙니다.");
      return;
    }
    if (parsedDate.getTime() <= Date.now()) {
      showToast("error", "미래 시간으로만 예약할 수 있습니다.");
      return;
    }
    let parsedPayload: Record<string, unknown> | undefined;
    const trimmed = schedulePayload.trim();
    if (trimmed) {
      try {
        parsedPayload = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        showToast("error", "Payload는 JSON이어야 합니다.");
        return;
      }
    }
    const iso = parsedDate.toISOString();
    createSchedule(targetFn.id, {
      scheduled_at: iso,
      payload: parsedPayload,
    })
      .then((res) => {
        setSchedules((prev) => [...prev, res]);
        registerScheduleTimer(res);
        showToast("success", "스케줄이 추가되었습니다.");
      })
      .catch((error) => {
        showToast(
          "error",
          error instanceof Error ? error.message : "스케줄 생성에 실패했습니다.",
        );
      });
  }, [
    functions,
    registerScheduleTimer,
    remoteEnabled,
    schedulePayload,
    scheduleTime,
    selectedId,
    showToast,
  ]);

  const handleScheduleDelete = useCallback((id: number) => {
    const targetFn =
      functions.find((fn) => fn.id === selectedId) ?? functions[0];
    if (!remoteEnabled) {
      showToast("error", "백엔드 API 연결이 활성화되지 않았습니다.");
      return;
    }
    if (!targetFn) return;
    deleteSchedule(targetFn.id, id)
      .then(() => {
        setSchedules((prev) => prev.filter((item) => item.id !== id));
        clearScheduleTimers();
        showToast("success", "스케줄이 삭제되었습니다.");
      })
      .catch((error) => {
        showToast(
          "error",
          error instanceof Error ? error.message : "삭제에 실패했습니다.",
        );
      });
  }, [clearScheduleTimers, functions, remoteEnabled, selectedId, showToast]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    clearScheduleTimers();
    if (!remoteEnabled || !selectedFunction || selectedFunction.id < 0) {
      setSchedules([]);
      setSchedulesError(null);
      setSchedulesLoading(false);
      return;
    }
    let cancelled = false;
    setSchedulesLoading(true);
    setSchedulesError(null);
    listSchedules(selectedFunction.id)
      .then((rows) => {
        if (cancelled) return;
        setSchedules(rows);
      })
      .catch((error) => {
        if (cancelled) return;
        setSchedulesError(
          error instanceof Error ? error.message : "스케줄 불러오기에 실패했습니다.",
        );
        setSchedules([]);
      })
      .finally(() => {
        if (!cancelled) setSchedulesLoading(false);
      });

    return () => {
      cancelled = true;
      clearScheduleTimers();
    };
  }, [clearScheduleTimers, remoteEnabled, selectedFunction]);

  useEffect(() => {
    clearScheduleTimers();
    schedules.forEach(registerScheduleTimer);
    return () => {
      clearScheduleTimers();
    };
  }, [clearScheduleTimers, registerScheduleTimer, schedules]);

  const handleSelectFunction = (fn: SoftGateFunction) => {
    setSelectedId(fn.id);
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
    setSelectedId(draftId);
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
    if (!remoteEnabled) {
      showToast("error", "백엔드 API 연결이 활성화되지 않았습니다.");
      return;
    }
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
      setSelectedId(savedFn.id);
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

  const handleRun = () => {
    if (!remoteEnabled) {
      setRunMessage("백엔드 API 연결이 설정되지 않았습니다.");
      return;
    }
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
  }, [clearPoll]);

  useEffect(() => {
    clearPoll();
    setIsRunning(false);
    setRunStatus("idle");
    setRunLogs([]);
    setRunResult("");
    setRunDurationMs(null);
    setRunMessage(null);
    setHistoryRows([]);
    setHistoryError(null);
  }, [clearPoll, selectedFunction?.id]);

  useEffect(() => {
    if (!remoteEnabled) return;
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
  }, [mergeFunction, remoteEnabled, selectedFunction, setCode]);

  useEffect(() => {
    if (
      !remoteEnabled ||
      activeTab !== "history" ||
      !selectedFunction ||
      selectedFunction.id < 0
    ) {
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
  }, [activeTab, remoteEnabled, selectedFunction]);

return (
  <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100">
    <Snowfall />
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.08),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.08),transparent_30%),radial-gradient(circle_at_50%_80%,rgba(16,185,129,0.08),transparent_30%)]" />
    <div className="pointer-events-none absolute -right-16 top-10 h-64 w-64 rounded-full bg-rose-500/30 blur-[100px] mix-blend-multiply" />
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
            <div className="h-10 w-1.5 rounded-full bg-gradient-to-b from-red-600 via-rose-500 to-red-800 shadow-[0_0_15px_rgba(225,29,72,0.5)]" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Team RED
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
              <span aria-hidden>🎄</span> Christmas
            </span>
          </div>
        </div>
        <p className="text-sm text-slate-600">Serverless Function Workspace</p>
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
                      "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-all duration-300",
                      "border-slate-200/60 bg-white/70 hover:bg-slate-50 hover:border-rose-200/50 shadow-sm",
                      isActive &&
                        "border-rose-200 bg-rose-50/80 ring-1 ring-rose-500/30 shadow-[0_0_20px_rgba(244,63,94,0.15)] z-10",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex size-9 items-center justify-center rounded-full border text-xs font-semibold shadow-sm transition-colors",
                          // 수정: 아이콘 뱃지도 활성 시 붉은 계열로
                          isActive 
                            ? "bg-white border-rose-100 text-rose-600" 
                            : "bg-white " + meta.badgeClass
                        )}
                      >
                        {meta.short}
                      </span>
                      <div>
                        <span className={cn("block font-medium transition-colors", isActive ? "text-slate-900" : "")}>
                          {fn.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {meta.label}
                        </span>
                      </div>
                    </div>
                    {isActive && (
                       <div className="flex items-center gap-1.5 rounded-full bg-white/60 px-2 py-1 shadow-sm border border-emerald-100">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                          Active
                        </span>
                      </div>
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
              language={editorLanguageFor[selectedLanguage] ?? "plaintext"}
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

      <Card className="relative rounded-2xl border border-slate-200/80 bg-white/85 shadow-xl shadow-slate-200/70 backdrop-blur text-[15px]">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b pb-4">
          <div className="space-y-1">
            <CardTitle className="text-lg">Scheduler</CardTitle>
            <p className="text-sm text-muted-foreground">
              실행 시점을 지정해 예약 실행을 만듭니다. 예약이 시작되면 Output 로그에 시작 메시지가 표시됩니다.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-semibold text-muted-foreground">
              {schedules.length} scheduled
            </span>
            {!remoteEnabled && (
              <span className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[12px] font-semibold text-red-700">
                API disabled
              </span>
            )}
          </div>
      </CardHeader>
      <CardContent className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  대상 함수
                </label>
                <p className="text-sm font-semibold text-slate-900">
                  {selectedFunction?.name ?? "선택된 함수 없음"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  예약은 현재 선택된 함수에 대해 생성됩니다.
                </p>
              </div>

              <div className="space-y-3 w-full">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    실행 일시
                  </label>
                  <Input
                    type="datetime-local"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="h-10 w-full"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    현재 시각 이후로만 설정할 수 있습니다.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Payload (선택)
                  </label>
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-900 shadow-inner">
                    <MonacoEditor
                      height="180px"
                      language="json"
                      value={schedulePayload}
                      onChange={(value) => setSchedulePayload(value ?? "")}
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
                  <p className="text-[11px] text-muted-foreground">
                    비워두면 payload는 전송하지 않습니다.
                  </p>
                </div>

                <Button className="w-full h-10 text-[15px]" onClick={handleScheduleAdd}>
                  예약 생성
                </Button>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">예약 목록</p>
                  <p className="text-xs text-muted-foreground">
                    삭제 시 백엔드에 바로 반영됩니다.
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {schedulesLoading
                    ? "불러오는 중..."
                    : schedulesError
                      ? "오류 발생"
                      : `${schedules.length}개`}
                </span>
              </div>
              <div className="space-y-2 max-h-80 overflow-auto">
                {schedulesError ? (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                    {schedulesError}
                  </div>
                ) : schedules.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-muted-foreground">
                    예약된 실행이 없습니다. 왼쪽에서 실행 시점을 추가하세요.
                  </div>
                ) : (
                  schedules
                    .slice()
                    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))
                    .map((item) => {
                      const fnName = selectedFunction?.name ?? "알 수 없음";
                      const isPast = new Date(item.scheduled_at).getTime() <= Date.now();
                      const statusLabel = isPast ? "실행됨" : "대기";
                      const statusClass = isPast
                        ? "bg-emerald-100 text-emerald-900 border-emerald-200"
                        : "bg-amber-100 text-amber-900 border-amber-200";
                      return (
                        <div
                          key={item.id}
                          className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border border-slate-200 bg-white/80 px-3 py-3 shadow-[0_4px_20px_rgba(15,23,42,0.05)]"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
                              <span>{fnName}</span>
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                                  statusClass,
                                )}
                              >
                                {statusLabel}
                              </span>
                            </div>
                            <p className="text-[12px] text-muted-foreground">
                              ID: {item.id} · {formatScheduleTime(item.scheduled_at)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleScheduleDelete(item.id)}
                            >
                              삭제
                            </Button>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          </div>
      </CardContent>
    </Card>
    </div>
  </div>
);
}
