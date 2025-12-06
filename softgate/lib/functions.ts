export type Language =
  | "python"
  | "pypy3"
  | "node"
  | "go"
  | "java11"
  | "java17"
  | "java21"
  | "swift"
  | "kotlin";

export type SoftGateFunction = {
  id: number;
  name: string;
  language: Language;
  code: string;
  description?: string;
};

export const defaultCodeByLanguage: Record<Language, string> = {
  python: `def handler(event):
    payload = event.get("payload", {})
    user = payload.get("user", "world")
    return {
        "status": "ok",
        "lang": "python",
        "echo": payload,
        "message": f"Hello, {user}!"
    }
`,
  pypy3: `def handler(event):
    payload = event.get("payload", {})
    user = payload.get("user", "world")
    return {
        "status": "ok",
        "lang": "pypy3",
        "echo": payload,
        "message": f"Hello, {user} (PyPy3)!"
    }
`,
  node: `exports.handler = async (event) => {
  const payload = event?.payload ?? {};
  return { status: "ok", lang: "node", echo: payload };
};
`,
  go: `package main

import "context"

func Handler(ctx context.Context, event map[string]any) (map[string]any, error) {
    return map[string]any{"status": "ok", "lang": "go", "echo": event}, nil
}
`,
  java11: `import java.util.HashMap;
import java.util.Map;

public class Handler {
    public Map<String, Object> handle(Map<String, Object> event) {
        Map<String, Object> res = new HashMap<>();
        res.put("status", "ok");
        res.put("lang", "java11");
        res.put("echo", event);
        return res;
    }
}
`,
  java17: `import java.util.HashMap;
import java.util.Map;

public class Handler {
    public Map<String, Object> handle(Map<String, Object> event) {
        Map<String, Object> res = new HashMap<>();
        res.put("status", "ok");
        res.put("lang", "java17");
        res.put("echo", event);
        return res;
    }
}
`,
  java21: `import java.util.HashMap;
import java.util.Map;

public class Handler {
    public Map<String, Object> handle(Map<String, Object> event) {
        Map<String, Object> res = new HashMap<>();
        res.put("status", "ok");
        res.put("lang", "java21");
        res.put("echo", event);
        return res;
    }
}
`,
  swift: `import Foundation

struct Handler {
    func handle(event: [String: Any]) -> [String: Any] {
        return [
            "status": "ok",
            "lang": "swift",
            "echo": event
        ]
    }
}
`,
  kotlin: `fun handler(event: Map<String, Any?>): Map<String, Any?> {
    return mapOf(
        "status" to "ok",
        "lang" to "kotlin",
        "echo" to event
    )
}
`,
};

export const runtimeForLanguage: Record<Language, string> = {
  python: "python",
  pypy3: "pypy3",
  node: "node",
  go: "go",
  java11: "java11",
  java17: "java17",
  java21: "java21",
  swift: "swift",
  kotlin: "kotlin",
};

export const editorLanguageFor: Record<Language, string> = {
  python: "python",
  pypy3: "python",
  node: "javascript",
  go: "go",
  java11: "java",
  java17: "java",
  java21: "java",
  swift: "swift",
  kotlin: "kotlin",
};

export function mapRuntimeToLanguage(runtime: string | undefined): Language {
  const normalized = runtime?.toLowerCase() ?? "";
  if (normalized.includes("pypy")) return "pypy3";
  if (normalized.includes("python") || normalized === "py") return "python";
  if (normalized.includes("java21")) return "java21";
  if (normalized.includes("java17")) return "java17";
  if (normalized.includes("java11")) return "java11";
  if (normalized.includes("java")) return "java17";
  if (normalized.includes("swift")) return "swift";
  if (normalized.includes("kotlin")) return "kotlin";
  if (normalized.includes("go")) return "go";
  if (normalized.includes("node") || normalized.includes("js")) return "node";
  return "node";
}
