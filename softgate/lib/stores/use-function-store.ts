"use client";

import { create } from "zustand";

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

const initialFunctions: SoftGateFunction[] = [
  {
    id: 1,
    name: "ingest-events",
    language: "python",
    code: defaultCodeByLanguage.python,
  },
  {
    id: 2,
    name: "image-resizer",
    language: "node",
    code: defaultCodeByLanguage.node,
  },
  {
    id: 3,
    name: "metrics-collector",
    language: "go",
    code: defaultCodeByLanguage.go,
  },
];

type FunctionStore = {
  functions: SoftGateFunction[];
  selectedId: number | null;
  setFunctions: (functions: SoftGateFunction[]) => void;
  setSelected: (id: number) => void;
  setCode: (code: string) => void;
  changeLanguage: (language: Language) => void;
  upsertFunction: (fn: SoftGateFunction) => void;
  removeFunction: (id: number) => void;
  mergeFunction: (id: number, partial: Partial<SoftGateFunction>) => void;
};

export const useFunctionStore = create<FunctionStore>((set) => ({
  functions: initialFunctions,
  selectedId: initialFunctions[0]?.id ?? null,
  setFunctions: (functions) =>
    set((state) => ({
      functions,
      selectedId:
        functions.length > 0 ? functions[0].id : state.selectedId ?? null,
    })),
  setSelected: (id) =>
    set((state) => (state.selectedId === id ? state : { selectedId: id })),
  setCode: (code) =>
    set((state) => {
      const current = state.functions.find((fn) => fn.id === state.selectedId);
      if (!current || current.code === code) return state;

      return {
        functions: state.functions.map((fn) =>
          fn.id === state.selectedId ? { ...fn, code } : fn,
        ),
      };
    }),
  changeLanguage: (language) =>
    set((state) => {
      const current = state.functions.find((fn) => fn.id === state.selectedId);
      const nextCode = defaultCodeByLanguage[language];
      if (!current) return state;
      if (current.language === language && current.code === nextCode)
        return state;

      return {
        functions: state.functions.map((fn) =>
          fn.id === state.selectedId
            ? { ...fn, language, code: nextCode }
            : fn,
        ),
      };
    }),
  upsertFunction: (fn) =>
    set((state) => {
      const exists = state.functions.find((item) => item.id === fn.id);
      if (exists) {
        return {
          functions: state.functions.map((item) =>
            item.id === fn.id ? { ...item, ...fn } : item,
          ),
          selectedId: state.selectedId ?? fn.id,
        };
      }
      return {
        functions: [...state.functions, fn],
        selectedId: fn.id,
      };
    }),
  removeFunction: (id) =>
    set((state) => {
      const filtered = state.functions.filter((fn) => fn.id !== id);
      const nextSelected =
        state.selectedId === id
          ? filtered[0]?.id ?? null
          : state.selectedId;
      return {
        functions: filtered,
        selectedId: nextSelected,
      };
    }),
  mergeFunction: (id, partial) =>
    set((state) => ({
      functions: state.functions.map((fn) =>
        fn.id === id ? { ...fn, ...partial } : fn,
      ),
    })),
}));
