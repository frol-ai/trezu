"use client";

import { Loader2, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/button";
import { PageCard } from "@/components/card";
import { CopyButton } from "@/components/copy-button";
import { Input } from "@/components/input";
import { PageComponentLayout } from "@/components/page-component-layout";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/underline-tabs";
import { useTreasury } from "@/hooks/use-treasury";
import { cn } from "@/lib/utils";
import { useNear } from "@/stores/near-store";

const BACKEND_API_BASE = process.env.NEXT_PUBLIC_BACKEND_API_BASE || "";
const AUTH_COOKIE_NAME = "auth_token";
const JWT_PLACEHOLDER = "YOUR_JWT";

interface ParamDef {
    key: string;
    kind: "text" | "number" | "select" | "date";
    required?: boolean;
    placeholder?: string;
    min?: number;
    max?: number;
}

const PARAM_DEFS: ParamDef[] = [
    { key: "accountId", kind: "text", required: true },
    { key: "limit", kind: "number", min: 1, max: 100 },
    { key: "offset", kind: "number", min: 0 },
    { key: "minUsdValue", kind: "number", min: 0 },
    { key: "transactionType", kind: "select" },
    { key: "tokenSymbol", kind: "text", placeholder: "USDC" },
    { key: "tokenSymbolNot", kind: "text", placeholder: "USDC" },
    { key: "txHash", kind: "text" },
    { key: "from", kind: "text", placeholder: "alice.near,bob.near" },
    { key: "fromNot", kind: "text", placeholder: "alice.near,bob.near" },
    { key: "to", kind: "text", placeholder: "alice.near,bob.near" },
    { key: "toNot", kind: "text", placeholder: "alice.near,bob.near" },
    { key: "startDate", kind: "date" },
    { key: "endDate", kind: "date" },
];

const TRANSACTION_TYPES: { value: string; labelKey: string }[] = [
    { value: "all", labelKey: "all" },
    { value: "outgoing", labelKey: "sent" },
    { value: "incoming", labelKey: "received" },
    { value: "staking_rewards", labelKey: "stakingRewards" },
    { value: "exchange", labelKey: "exchange" },
];

const NUMERIC_PARAMS = new Set(["limit", "offset", "minUsdValue"]);

function CodeBlock({ code, copyLabel }: { code: string; copyLabel: string }) {
    return (
        <div className="relative">
            <pre className="bg-muted rounded-lg p-4 pr-14 text-sm overflow-x-auto whitespace-pre">
                <code>{code}</code>
            </pre>
            <CopyButton
                text={code}
                variant="ghost"
                size="icon"
                aria-label={copyLabel}
                className="absolute top-2 right-2"
            />
        </div>
    );
}

export default function ApiDocsPage() {
    const t = useTranslations("pages.apiDocs");
    const tDocs = useTranslations("apiDocs");
    const tTabs = useTranslations("activity.tabs");
    const { treasuryId } = useTreasury();
    const { accountId } = useNear();

    const [values, setValues] = useState<Record<string, string>>(() => ({
        accountId: treasuryId ?? "",
        limit: "10",
        offset: "0",
        transactionType: "all",
    }));
    const [isRunning, setIsRunning] = useState(false);
    const [response, setResponse] = useState<string | null>(null);
    const [responseMeta, setResponseMeta] = useState<{
        status: number;
        ok: boolean;
        duration: number;
    } | null>(null);

    const setParam = (key: string, value: string) =>
        setValues((prev) => ({ ...prev, [key]: value }));

    const activeParams = useMemo(() => {
        const entries: [string, string][] = [];
        for (const def of PARAM_DEFS) {
            const raw = (values[def.key] ?? "").trim();
            if (!raw) continue;
            if (def.key === "transactionType" && raw === "all") continue;
            entries.push([def.key, raw]);
        }
        return entries;
    }, [values]);

    const requestUrl = `${BACKEND_API_BASE}/api/recent-activity?${new URLSearchParams(activeParams).toString()}`;

    const curlSnippet = useMemo(
        () =>
            [
                `curl "${requestUrl}" \\`,
                `  --cookie "${AUTH_COOKIE_NAME}=${JWT_PLACEHOLDER}"`,
            ].join("\n"),
        [requestUrl],
    );

    const pythonSnippet = useMemo(() => {
        const paramLines = activeParams.map(([key, value]) =>
            NUMERIC_PARAMS.has(key) && !Number.isNaN(Number(value))
                ? `        "${key}": ${value},`
                : `        "${key}": ${JSON.stringify(value)},`,
        );
        return [
            "import requests",
            "",
            `BASE_URL = "${BACKEND_API_BASE}"`,
            `JWT = "${JWT_PLACEHOLDER}"  # DevTools -> Application -> Cookies -> ${AUTH_COOKIE_NAME}`,
            "",
            "response = requests.get(",
            '    f"{BASE_URL}/api/recent-activity",',
            "    params={",
            ...paramLines,
            "    },",
            `    cookies={"${AUTH_COOKIE_NAME}": JWT},`,
            ")",
            "response.raise_for_status()",
            "activity = response.json()",
            "print(f\"Total: {activity['total']}\")",
            'for item in activity["data"]:',
            '    symbol = item["tokenMetadata"]["symbol"]',
            '    print(item["blockTime"], item["amount"], symbol, item["counterparty"])',
        ].join("\n");
    }, [activeParams]);

    const handleRun = async () => {
        setIsRunning(true);
        setResponse(null);
        setResponseMeta(null);
        const startedAt = performance.now();
        try {
            const res = await fetch(requestUrl, { credentials: "include" });
            const text = await res.text();
            setResponseMeta({
                status: res.status,
                ok: res.ok,
                duration: Math.round(performance.now() - startedAt),
            });
            try {
                setResponse(JSON.stringify(JSON.parse(text), null, 2));
            } catch {
                setResponse(text);
            }
        } catch (error) {
            setResponse(
                `${tDocs("requestFailed")}: ${error instanceof Error ? error.message : String(error)}`,
            );
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <PageComponentLayout
            title={t("title")}
            description={t("description")}
            backButton={`/${treasuryId}/dashboard`}
        >
            <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto">
                {/* Endpoint */}
                <PageCard className="gap-3">
                    <p className="font-semibold">{tDocs("endpoint")}</p>
                    <p className="text-sm text-muted-foreground">
                        {tDocs("endpointDescription")}
                    </p>
                    <CodeBlock
                        code={`GET ${BACKEND_API_BASE}/api/recent-activity`}
                        copyLabel={tDocs("copy")}
                    />
                </PageCard>

                {/* Authentication */}
                <PageCard className="gap-3">
                    <p className="font-semibold">{tDocs("authentication")}</p>
                    <p className="text-sm text-muted-foreground">
                        {tDocs("authIntro", { cookie: AUTH_COOKIE_NAME })}
                    </p>
                    <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                        <li>{tDocs("authStep1")}</li>
                        <li>
                            {tDocs("authStep2", { cookie: AUTH_COOKIE_NAME })}
                        </li>
                        <li>
                            {tDocs("authStep3", {
                                placeholder: JWT_PLACEHOLDER,
                            })}
                        </li>
                    </ul>
                    <p className="text-sm text-muted-foreground">
                        {tDocs("authPublicNote")}
                    </p>
                </PageCard>

                {/* Query parameters */}
                <PageCard className="gap-4">
                    <div className="flex flex-col gap-1">
                        <p className="font-semibold">{tDocs("parameters")}</p>
                        <p className="text-sm text-muted-foreground">
                            {tDocs("parametersDescription")}
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        {PARAM_DEFS.map((def) => (
                            <div key={def.key} className="flex flex-col gap-1">
                                <label
                                    className="text-sm font-medium flex items-center gap-2"
                                    htmlFor={`api-docs-${def.key}`}
                                >
                                    <code>{def.key}</code>
                                    {def.required && (
                                        <span className="text-xs font-normal text-muted-foreground border border-general-border rounded px-1.5 py-0.5">
                                            {tDocs("required")}
                                        </span>
                                    )}
                                </label>
                                <p className="text-xs text-muted-foreground">
                                    {tDocs(`params.${def.key}`)}
                                </p>
                                {def.kind === "select" ? (
                                    <Select
                                        value={values[def.key]?.trim() || "all"}
                                        onValueChange={(value) =>
                                            setParam(def.key, value)
                                        }
                                    >
                                        <SelectTrigger
                                            id={`api-docs-${def.key}`}
                                            className="w-full"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {TRANSACTION_TYPES.map((type) => (
                                                <SelectItem
                                                    key={type.value}
                                                    value={type.value}
                                                >
                                                    {tTabs(type.labelKey)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <Input
                                        id={`api-docs-${def.key}`}
                                        type={def.kind}
                                        min={def.min}
                                        max={def.max}
                                        placeholder={def.placeholder}
                                        value={values[def.key] ?? ""}
                                        onChange={(e) =>
                                            setParam(def.key, e.target.value)
                                        }
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </PageCard>

                {/* Code examples + runner */}
                <PageCard className="gap-4">
                    <p className="font-semibold">{tDocs("examples")}</p>

                    <Tabs defaultValue="curl">
                        <TabsList>
                            <TabsTrigger value="curl">cURL</TabsTrigger>
                            <TabsTrigger value="python">Python</TabsTrigger>
                        </TabsList>
                        <TabsContent value="curl" className="mt-4">
                            <CodeBlock
                                code={curlSnippet}
                                copyLabel={tDocs("copy")}
                            />
                        </TabsContent>
                        <TabsContent value="python" className="mt-4">
                            <CodeBlock
                                code={pythonSnippet}
                                copyLabel={tDocs("copy")}
                            />
                        </TabsContent>
                    </Tabs>

                    <div className="flex flex-wrap items-center gap-3">
                        <Button
                            onClick={handleRun}
                            disabled={isRunning || !values.accountId?.trim()}
                        >
                            {isRunning ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Play className="w-4 h-4" />
                            )}
                            {isRunning ? tDocs("running") : tDocs("run")}
                        </Button>
                        <p className="text-sm text-muted-foreground">
                            {accountId
                                ? tDocs("signedInAs", { accountId })
                                : tDocs("notSignedIn")}
                        </p>
                    </div>

                    {response !== null && (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-3">
                                <p className="text-sm font-medium">
                                    {tDocs("response")}
                                </p>
                                {responseMeta && (
                                    <span
                                        className={cn(
                                            "text-xs font-medium rounded px-1.5 py-0.5",
                                            responseMeta.ok
                                                ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                                                : "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400",
                                        )}
                                    >
                                        {tDocs("responseMeta", {
                                            status: responseMeta.status,
                                            duration: responseMeta.duration,
                                        })}
                                    </span>
                                )}
                            </div>
                            <div className="relative">
                                <pre className="bg-muted rounded-lg p-4 pr-14 text-sm overflow-auto max-h-96 whitespace-pre">
                                    <code>{response}</code>
                                </pre>
                                <CopyButton
                                    text={response}
                                    variant="ghost"
                                    size="icon"
                                    aria-label={tDocs("copy")}
                                    className="absolute top-2 right-2"
                                />
                            </div>
                        </div>
                    )}
                </PageCard>
            </div>
        </PageComponentLayout>
    );
}
