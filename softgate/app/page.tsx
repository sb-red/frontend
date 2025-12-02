import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const sampleFunctions = [
  { name: "ingest-events", language: "Python" },
  { name: "image-resizer", language: "Node.js" },
  { name: "metrics-collector", language: "Go" },
];

const sampleCode = `# SoftGate 함수 예시
def handler(event):
    payload = event.get("payload", {})
    return {"status": "ok", "message": payload.get("message", "Hello SoftGate")}
`;

const samplePayload = `{
  "event": "ping",
  "payload": {
    "requestId": "job-1234",
    "message": "demonstrate 3-panel layout",
    "delayMs": 1200
  }
}`;

export default function Home() {
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
                {sampleFunctions.map((fn) => (
                  <button
                    key={fn.name}
                    className="w-full rounded-lg border bg-card/60 px-3 py-2 text-left text-sm transition hover:border-primary/50 hover:bg-accent"
                  >
                    <span className="block font-medium">{fn.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {fn.language}
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b pb-4">
              <CardTitle className="text-base">코드 에디터</CardTitle>
              <Button size="sm" variant="secondary">
                저장
              </Button>
            </CardHeader>
            <CardContent className="flex-1 space-y-3">
              <div className="rounded-lg border bg-muted/40 p-4 shadow-inner">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Monaco Editor 위치(Phase 3) — 현재는 코드 블록으로 자리 표시
                </p>
                <pre className="h-[360px] overflow-auto rounded-md bg-background p-3 font-mono text-xs leading-relaxed text-foreground/90">
                  {sampleCode}
                </pre>
              </div>
            </CardContent>
          </Card>

          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b pb-4">
              <CardTitle className="text-base">실행 입력/상태</CardTitle>
              <Button size="sm" variant="outline">
                Reset
              </Button>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Payload 미리보기</p>
                <div className="min-h-[220px] rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground/80 shadow-inner">
                  {samplePayload}
                </div>
              </div>
              <Button className="w-full">실행</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
