// Enable Banking AIS client (read-only). Secrets: EB_APP_ID, EB_PRIVATE_KEY (PEM, PKCS#8).

const API = "https://api.enablebanking.com";
// Lunar returns ~2 years on first sync; page size is unknown, so leave headroom.
const MAX_PAGES = 100;

export type EbParty = { name?: string | null } | null;

export type EbTransaction = {
  entry_reference?: string | null;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: "CRDT" | "DBIT";
  status: string;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  creditor?: EbParty;
  debtor?: EbParty;
  remittance_information?: string[] | null;
  merchant_category_code?: string | null;
  bank_transaction_code?: { code?: string | null } | null;
};

export type EbBalance = {
  balance_amount: { amount: string; currency: string };
  balance_type: string;
};

export type EbSession = {
  status: string;
  accounts: string[];
  aspsp: { name: string; country: string };
  access: { valid_until: string };
};

export type EbAccountDetails = {
  name?: string | null;
  currency: string;
  cash_account_type?: string | null;
  identification_hash: string;
};

// Sent only when the user triggered the sync, so the bank counts it as user-present.
export type PsuHeaders = { ip: string; userAgent: string } | null;

export type EbClient = {
  getSession(sessionId: string): Promise<EbSession>;
  getAccountDetails(uid: string): Promise<EbAccountDetails>;
  getBalances(uid: string, psu: PsuHeaders): Promise<EbBalance[]>;
  getTransactions(uid: string, dateFrom: string, psu: PsuHeaders): Promise<EbTransaction[]>;
};

const base64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

const encodeJson = (value: unknown): string => base64Url(new TextEncoder().encode(JSON.stringify(value)));

const importKey = (pem: string): Promise<CryptoKey> => {
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
};

const signJwt = async (appId: string, key: CryptoKey): Promise<string> => {
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = `${encodeJson({ typ: "JWT", alg: "RS256", kid: appId })}.${encodeJson({
    iss: "enablebanking.com",
    aud: "api.enablebanking.com",
    iat,
    exp: iat + 3600,
  })}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
};

type EbRequest = <T>(method: "GET" | "POST", path: string, psu: PsuHeaders, body?: unknown) => Promise<T>;

const createRequester = async (appId: string, privateKeyPem: string): Promise<EbRequest> => {
  const jwt = await signJwt(appId, await importKey(privateKeyPem));
  return async <T>(method: "GET" | "POST", path: string, psu: PsuHeaders, body?: unknown): Promise<T> => {
    const headers: Record<string, string> = { Authorization: `Bearer ${jwt}` };
    if (psu) {
      headers["Psu-Ip-Address"] = psu.ip;
      headers["Psu-User-Agent"] = psu.userAgent;
    }
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) {
      // Path without ids or query: uids and session ids never reach logs or last_error.
      const route = (path.split("?")[0] ?? "").replace(/[0-9a-f-]{36}/gi, ":id");
      throw new Error(`Enable Banking ${route} ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    return (await response.json()) as T;
  };
};

export const createEbClient = async (appId: string, privateKeyPem: string): Promise<EbClient> => {
  const request = await createRequester(appId, privateKeyPem);
  return {
    getSession: (sessionId) => request<EbSession>("GET", `/sessions/${sessionId}`, null),
    getAccountDetails: (uid) => request<EbAccountDetails>("GET", `/accounts/${uid}/details`, null),
    getBalances: async (uid, psu) => (await request<{ balances: EbBalance[] }>("GET", `/accounts/${uid}/balances`, psu)).balances,
    getTransactions: async (uid, dateFrom, psu) => {
      const rows: EbTransaction[] = [];
      const seenKeys = new Set<string>();
      let continuationKey: string | null = null;
      do {
        const query = `date_from=${dateFrom}${continuationKey ? `&continuation_key=${encodeURIComponent(continuationKey)}` : ""}`;
        const page: { transactions: EbTransaction[]; continuation_key?: string | null } = await request(
          "GET",
          `/accounts/${uid}/transactions?${query}`,
          psu,
        );
        rows.push(...page.transactions);
        const next = page.continuation_key ?? null;
        // A bank repeating its key would loop forever.
        if (next !== null && seenKeys.has(next)) throw new Error("Enable Banking transactions: continuation key repeated");
        if (next !== null) seenKeys.add(next);
        continuationKey = next;
        if (continuationKey && seenKeys.size >= MAX_PAGES) throw new Error(`Enable Banking transactions: more than ${MAX_PAGES} pages`);
      } while (continuationKey);
      return rows;
    },
  };
};

export type EbNewSession = {
  session_id: string;
  accounts: (EbAccountDetails & { uid: string })[];
  aspsp: { name: string; country: string };
  access: { valid_until: string };
};

// Consent (re)authorisation: start at the bank, then exchange the redirect code for a session.
export const createEbConsentClient = async (appId: string, privateKeyPem: string) => {
  const request = await createRequester(appId, privateKeyPem);
  return {
    maxConsentSeconds: async (aspsp: { name: string; country: string }): Promise<number | null> => {
      const { aspsps } = await request<{ aspsps: { name: string; country: string; maximum_consent_validity?: number | null }[] }>(
        "GET",
        `/aspsps?country=${encodeURIComponent(aspsp.country)}`,
        null,
      );
      return aspsps.find((a) => a.name === aspsp.name)?.maximum_consent_validity ?? null;
    },
    startAuth: (input: { aspsp: { name: string; country: string }; validUntil: string; redirectUrl: string; state: string }) =>
      request<{ url: string }>("POST", "/auth", null, {
        access: { valid_until: input.validUntil },
        aspsp: input.aspsp,
        state: input.state,
        redirect_url: input.redirectUrl,
        psu_type: "personal",
      }),
    createSession: (code: string) => request<EbNewSession>("POST", "/sessions", null, { code }),
  };
};
