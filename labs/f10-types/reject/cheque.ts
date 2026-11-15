/**
 * This file is outside labs/f10-types/tsconfig.json.
 * Compiling it is expected to fail: "cheque" is not a payment method.
 */
import { describePayment } from "../payment.js";

describePayment({
  method: "cheque",
  last4: "4242",
});
