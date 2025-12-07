export type Language =
  | "python"
  | "pypy3"
  | "node"
  | "go"
  | "cpp"
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
  score = int(event.get("score", 0))

  if score >= 90:
      grade = "A"
  elif score >= 80:
      grade = "B"
  elif score >= 70:
      grade = "C"
  elif score >= 60:
      grade = "D"
  else:
      grade = "F"

  return {
      "score": score,
      "grade": grade
  }
  `,
  pypy3: `def handler(event):
  message = event.get("message", "hello")
  return {
      "runtime": "pypy3",
      "echo": message
  }
  `,
  node: `function handler(event) {
  const score = parseInt(event.score ?? 0, 10);
  let grade;
  if (score >= 90) grade = "A";
  else if (score >= 80) grade = "B";
  else if (score >= 70) grade = "C";
  else if (score >= 60) grade = "D";
  else grade = "F";

  return {
    score,
    grade,
  };
}
  `,
  go: `func handler(event map[string]interface{}) map[string]interface{} {
    score := int(event["score"].(float64))
    var grade string

    switch {
    case score >= 90:
        grade = "A"
    case score >= 80:
        grade = "B"
    case score >= 70:
        grade = "C"
    case score >= 60:
        grade = "D"
    default:
        grade = "F"
    }

    return map[string]interface{}{
        "score": score,
        "grade": grade,
    }
}
  `,
  cpp: `#include <string>

json handler(const json& event) {
    int score = event["score"].get<int>();
    std::string grade;

    if (score >= 90) grade = "A";
    else if (score >= 80) grade = "B";
    else if (score >= 70) grade = "C";
    else if (score >= 60) grade = "D";
    else grade = "F";

    return {{"score", score}, {"grade", grade}};
}
  `,
  java11: `import java.util.Map;
import java.util.HashMap;

class Handler {
  public static Map<String, Object> handle(Map<String, Object> event) {
    Map<String, Object> result = new HashMap<>();
    Object rawScore = event.getOrDefault("score", 0);
    int score = Integer.parseInt(String.valueOf(rawScore));
    result.put("score", score);
    result.put("runtime", "java11");
    return result;
  }
}
  `,
  java17: `import java.util.Map;
import java.util.HashMap;

class Handler {
    public static Map<String, Object> handle(Map<String, Object> event) {
        Map<String, Object> result = new HashMap<>();
        String name = String.valueOf(event.getOrDefault("name", "world"));
        result.put("message", "Hello " + name + " from Java 17");
        return result;
    }
}
  `,
  java21: `import java.util.Map;
import java.util.HashMap;

class Handler {
    public static Map<String, Object> handle(Map<String, Object> event) {
        Map<String, Object> result = new HashMap<>();
        String name = String.valueOf(event.getOrDefault("name", "world"));
        result.put("message", "Hello " + name + " from Java 21");
        return result;
    }
}
  `,
  swift: `func handler(event: [String: Any]) -> [String: Any] {
  let name = event["name"] as? String ?? "world"
  return [
      "runtime": "swift",
      "greeting": "Hello \\(name) from Swift"
  ]
}
  `,
  kotlin: `object Handler {
    @JvmStatic
    fun handle(event: Map<String, Any?>): Map<String, Any?> {
        val text = event["message"]?.toString() ?: "hello"
        return mapOf(
            "runtime" to "kotlin",
            "echo" to text
        )
    }
}
  `,
};

export const runtimeForLanguage: Record<Language, string> = {
  python: "python",
  pypy3: "pypy3",
  node: "node",
  go: "go",
  cpp: "cpp",
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
  cpp: "cpp",
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
  if (normalized.includes("cpp") || normalized.includes("cpp")) return "cpp";
  return "node";
}
