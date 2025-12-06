import HomePage from "@/components/home-page";
import {
  defaultCodeByLanguage,
  mapRuntimeToLanguage,
  type SoftGateFunction,
} from "@/lib/functions";
import { listFunctions } from "@/lib/api";

export const dynamic = "force-dynamic";

const fallbackFunctions: SoftGateFunction[] = [
  {
    id: 1,
    name: "ingest-events",
    language: "python",
    code: defaultCodeByLanguage.python,
    description: "Sample function placeholder",
  },
  {
    id: 2,
    name: "image-resizer",
    language: "node",
    code: defaultCodeByLanguage.node,
    description: "Sample function placeholder",
  },
  {
    id: 3,
    name: "metrics-collector",
    language: "go",
    code: defaultCodeByLanguage.go,
    description: "Sample function placeholder",
  },
];

type InitialData = {
  functions: SoftGateFunction[];
  remoteAvailable: boolean;
};

async function getInitialFunctions(): Promise<InitialData> {
  try {
    const remoteFns = await listFunctions();
    const mapped = remoteFns.map((fn) => {
      const language = mapRuntimeToLanguage(fn.runtime);
      return {
        id: fn.id,
        name: fn.name,
        language,
        code: defaultCodeByLanguage[language],
        description: fn.description,
      };
    });
    return { functions: mapped, remoteAvailable: true };
  } catch (error) {
    console.error("Failed to load functions on server", error);
    return { functions: fallbackFunctions, remoteAvailable: false };
  }
}

export default async function Home() {
  const { functions, remoteAvailable } = await getInitialFunctions();
  return (
    <HomePage
      initialFunctions={functions}
      disableRemoteFetch={!remoteAvailable}
    />
  );
}
