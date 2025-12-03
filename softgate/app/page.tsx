"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

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
  const { functions, selectedId, setSelected, setCode, changeLanguage } =
    useFunctionStore(
      useShallow((state) => ({
        functions: state.functions,
        selectedId: state.selectedId,
        setSelected: state.setSelected,
        setCode: state.setCode,
        changeLanguage: state.changeLanguage,
      })),
    );

  const selectedFunction = functions.find((fn) => fn.id === selectedId);
  const selectedLanguage = selectedFunction?.language ?? "python";
  const [payload, setPayload] = useState(samplePayload);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);

  const languageOptions = useMemo(
    () =>
      Object.entries(languageMeta).map(([value, meta]) => ({
        value: value as Language,
        label: meta.label,
      })),
    [],
  );

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

  const handleRun = () => {
    // Validate again before run to avoid stale error state.
    try {
      const parsed = JSON.parse(payload);
      setJsonError(null);
      setIsRunning(true);
      setRunMessage("실행 요청 전송 중...");
      // Placeholder async simulation
      setTimeout(() => {
        setIsRunning(false);
        setRunMessage(
          `실행 완료 · job preview: ${parsed?.payload?.requestId ?? "demo-job"}`,
        );
      }, 1200);
    } catch {
      setJsonError("유효한 JSON 형식이 아닙니다.");
    }
  };

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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
