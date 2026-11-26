// Invented people, cards and accounts for tests. Every value here is fake.
// Shapes follow real Enable Banking rows (see the eb-*.json dumps next to this file).

export const OWNER = { name: "Ivan Testov", upper: "IVAN TESTOV" };
export const PARTNER = { name: "Mara Probova", upper: "MARA PROBOVA" };
export const JOINT_HOLDER = "MARA PROBOVA & IVAN TESTOV";
export const FAMILY = { name: "Olena Fakeenko" };
export const FRIEND = { name: "Peter Example" }; // settle-up person

// Owner's cards: 1111 = personal Revolut card, 3333 = owner's card on the joint account,
// 9001 = owner's Apple Pay device number (tops up personal and joint).
export const OWN_CARD_SUFFIXES = ["1111", "3333", "9001"];
// Partner's top-up cards on the joint account.
export const PARTNER_CARD_SUFFIXES = ["7001", "7002"];

export const FAKE_IBAN = {
  lunar: "DK0000000000000001",
  revolutPersonal: "LT000000000000000002",
  joint: "LT000000000000000003",
  savings: "LT000000000000000004",
  friend: "DK0000000000000099",
};

export const DUMPS = {
  lunar: "eb-lunar.json",
  revolutPersonal: "eb-revolut-personal.json",
  revolutEur: "eb-revolut-eur.json",
  joint: "eb-revolut-joint.json",
  savings: "eb-revolut-savings.json",
} as const;

export type EbAmount = { currency: string; amount: string };
export type EbParty = {
  name: string | null;
  postal_address?: null;
  organisation_id?: null;
  private_id?: null;
  contact_details?: null;
} | null;
export type EbRow = {
  entry_reference: string | null;
  merchant_category_code: string | null;
  transaction_amount: EbAmount;
  creditor: EbParty;
  creditor_account: { iban?: string; other?: { identification: string; scheme_name: string } } | null;
  debtor: EbParty;
  debtor_account: { iban?: string } | null;
  bank_transaction_code: { description: string | null; code: string; sub_code: string | null } | null;
  credit_debit_indicator: "CRDT" | "DBIT";
  status: "BOOK" | "PDNG";
  booking_date: string | null;
  value_date: string | null;
  transaction_date: string | null;
  remittance_information: string[] | null;
  debtor_account_additional_identification: { identification: string; scheme_name: string; issuer: string }[] | null;
  exchange_rate: {
    unit_currency: string;
    exchange_rate: string;
    instructed_amount: EbAmount;
  } | null;
};
export type EbAccount = {
  uid: string;
  session_id: string;
  name: string;
  product: string | null;
  iban: string;
  currency: string;
  cash_account_type: "CACC" | "SVGS";
  identification_hash: string;
};
export type EbBalance = {
  name: string;
  balance_amount: EbAmount;
  balance_type: string;
  reference_date: string | null;
};
export type EbDump = { account: EbAccount; balances: EbBalance[]; raw: EbRow[] };

export async function loadDump(file: string): Promise<EbDump> {
  const text = await Deno.readTextFile(new URL(file, import.meta.url));
  return JSON.parse(text) as EbDump;
}

// Builds one raw row with real-shaped defaults; tests override only what they need.
export function ebRow(over: Partial<EbRow>): EbRow {
  return {
    entry_reference: crypto.randomUUID(),
    merchant_category_code: null,
    transaction_amount: { currency: "DKK", amount: "10.00" },
    creditor: null,
    creditor_account: null,
    debtor: null,
    debtor_account: null,
    bank_transaction_code: null,
    credit_debit_indicator: "DBIT",
    status: "BOOK",
    booking_date: "2026-11-02",
    value_date: null,
    transaction_date: null,
    remittance_information: null,
    debtor_account_additional_identification: null,
    exchange_rate: null,
    ...over,
  };
}

export function party(name: string): EbParty {
  return { name, postal_address: null, organisation_id: null, private_id: null, contact_details: null };
}
