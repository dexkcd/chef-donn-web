import { describe, expect, it } from "vitest";
import { formatBp, formatPeso, formatPesoCompact, mulBp, parsePeso, ratioBp, roundToHundredPesos } from "./money";

describe("parsePeso", () => {
  it.each([
    ["1,234.50", 123450],
    ["₱1234.5", 123450],
    ["PHP 80", 8000],
    ["p 1,000", 100000],
    ["0.05", 5],
    [".5", 50],
    ["12.", 1200],
    ["  2,500,000.00 ", 250000000],
  ])("parses %s", (input, cents) => {
    expect(parsePeso(input)).toBe(cents);
  });

  it.each(["", "abc", "1,23.00", "1.234", "-5", "12,34", "₱", "."])("rejects %s", (input) => {
    expect(parsePeso(input)).toBeNull();
  });
});

describe("formatPeso", () => {
  it("formats centavos with thousands separators", () => {
    expect(formatPeso(123456)).toBe("₱1,234.56");
    expect(formatPeso(0)).toBe("₱0.00");
    expect(formatPeso(5)).toBe("₱0.05");
    expect(formatPeso(250000000)).toBe("₱2,500,000.00");
  });
  it("uses a true minus for negatives and optional plus", () => {
    expect(formatPeso(-150)).toBe("−₱1.50");
    expect(formatPeso(150, { signed: true })).toBe("+₱1.50");
  });
  it("drops centavos on request, rounding half-up", () => {
    expect(formatPeso(123450, { noCentavos: true })).toBe("₱1,235");
  });
  it("compacts for chart labels", () => {
    expect(formatPesoCompact(120000000)).toBe("₱1.2M");
    expect(formatPesoCompact(35000000)).toBe("₱350K");
    expect(formatPesoCompact(150000)).toBe("₱1.5K");
    expect(formatPesoCompact(90000)).toBe("₱900");
  });
});

describe("basis points", () => {
  it("multiplies with half-up rounding", () => {
    expect(mulBp(10000, 1200)).toBe(1200);
    expect(mulBp(1, 5000)).toBe(1); // 0.5 → 1
    expect(mulBp(-1, 5000)).toBe(-1);
    expect(mulBp(333, 1000)).toBe(33);
    expect(mulBp(250_000_000_00, 1500)).toBe(37_500_000_00);
  });
  it("computes ratios", () => {
    expect(ratioBp(25, 100)).toBe(2500);
    expect(ratioBp(1, 0)).toBeNull();
  });
  it("formats percentages", () => {
    expect(formatBp(1200)).toBe("12%");
    expect(formatBp(1250)).toBe("12.5%");
    expect(formatBp(1205)).toBe("12.05%");
  });
  it("rounds estimates to the nearest ₱100", () => {
    expect(roundToHundredPesos(1_234_500)).toBe(1_230_000);
    expect(roundToHundredPesos(1_235_000)).toBe(1_240_000);
  });
});
