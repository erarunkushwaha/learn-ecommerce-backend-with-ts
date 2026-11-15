import { assertNever, isRecord, minorUnits } from "./narrow.js";

export interface CardPayment {
  method: "card";
  last4: string;
  brand: "visa" | "mastercard";
}

export interface CodPayment {
  method: "cod";
  collectOnDelivery: true;
}

export interface WalletPayment {
  method: "wallet";
  balanceMinor: number;
}

/** The method field is the discriminant. */
export type Payment = CardPayment | CodPayment | WalletPayment;

export function isWallet(payment: Payment): payment is WalletPayment {
  return payment.method === "wallet";
}

export function describePayment(payment: Payment): string {
  switch (payment.method) {
    case "card":
      return `card ${payment.brand} ${payment.last4}`;
    case "cod":
      return "cash on delivery";
    case "wallet":
      return `wallet ${payment.balanceMinor}`;
    default:
      return assertNever(payment);
  }
}

/**
 * Accepts untrusted input and returns a fresh object with the known fields.
 * Extra keys on the input are not copied.
 */
export function readPayment(value: unknown): Payment {
  if (!isRecord(value)) {
    throw new TypeError("payment must be an object");
  }

  const method = value.method;
  if (method === "card") {
    return readCard(value);
  }
  if (method === "cod") {
    return readCod(value);
  }
  if (method === "wallet") {
    return { method: "wallet", balanceMinor: minorUnits(value.balanceMinor) };
  }
  throw new TypeError("payment method is not supported");
}

function readCard(value: Record<string, unknown>): CardPayment {
  const last4 = value.last4;
  if (typeof last4 !== "string" || !/^\d{4}$/.test(last4)) {
    throw new TypeError("card last4 must be four digits");
  }

  const brand = value.brand;
  if (brand === "visa" || brand === "mastercard") {
    return { method: "card", last4, brand };
  }
  throw new TypeError("card brand must be visa or mastercard");
}

function readCod(value: Record<string, unknown>): CodPayment {
  if (value.collectOnDelivery !== true) {
    throw new TypeError("cod requires collectOnDelivery true");
  }
  return { method: "cod", collectOnDelivery: true };
}
