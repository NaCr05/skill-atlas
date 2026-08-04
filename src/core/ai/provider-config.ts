export type AiProvider = "openai" | "deepseek";
export type AiProviderSelection = "auto" | AiProvider | "invalid";

export interface AiProviderConfig {
  selection: AiProviderSelection;
  requestedValue: string;
  provider?: AiProvider;
  configured: boolean;
  apiKey?: string;
  model?: string;
  missingVariables: string[];
  configuredProviders: AiProvider[];
}

const PROVIDER_VARIABLES: Record<AiProvider, { key: string; model: string }> = {
  openai: { key: "OPENAI_API_KEY", model: "OPENAI_MODEL" },
  deepseek: { key: "DEEPSEEK_API_KEY", model: "DEEPSEEK_MODEL" },
};

function providerValues(
  provider: AiProvider,
  env: Readonly<Partial<NodeJS.ProcessEnv>>,
): Pick<AiProviderConfig, "apiKey" | "model" | "missingVariables" | "configured"> {
  const variables = PROVIDER_VARIABLES[provider];
  const apiKey = env[variables.key]?.trim();
  const model = env[variables.model]?.trim();
  const missingVariables = [
    ...(!apiKey ? [variables.key] : []),
    ...(!model ? [variables.model] : []),
  ];
  return { apiKey, model, missingVariables, configured: missingVariables.length === 0 };
}

export function resolveAiProviderConfig(
  env: Readonly<Partial<NodeJS.ProcessEnv>> = process.env,
): AiProviderConfig {
  const requestedValue = env.AI_PROVIDER?.trim().toLocaleLowerCase() || "auto";
  const selection: AiProviderSelection = ["auto", "openai", "deepseek"].includes(requestedValue)
    ? requestedValue as Exclude<AiProviderSelection, "invalid">
    : "invalid";
  const openai = providerValues("openai", env);
  const deepseek = providerValues("deepseek", env);
  const configuredProviders: AiProvider[] = [
    ...(openai.configured ? ["openai" as const] : []),
    ...(deepseek.configured ? ["deepseek" as const] : []),
  ];

  if (selection === "invalid") {
    return {
      selection,
      requestedValue,
      configured: false,
      missingVariables: ["AI_PROVIDER"],
      configuredProviders,
    };
  }

  const provider = selection === "auto"
    ? openai.configured
      ? "openai"
      : deepseek.configured
        ? "deepseek"
        : openai.apiKey || openai.model
          ? "openai"
          : deepseek.apiKey || deepseek.model
            ? "deepseek"
            : undefined
    : selection;

  if (!provider) {
    return {
      selection,
      requestedValue,
      configured: false,
      missingVariables: [],
      configuredProviders,
    };
  }

  return {
    selection,
    requestedValue,
    provider,
    configuredProviders,
    ...(provider === "openai" ? openai : deepseek),
  };
}

export function aiProviderLabel(provider?: AiProvider): string {
  return provider === "openai" ? "OpenAI" : provider === "deepseek" ? "DeepSeek" : "None";
}
