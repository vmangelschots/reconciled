import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as transactionsApi from "../api/transactions";
import { notifyDataChanged } from "../lib/dataChanged";
import { ReviewCountProvider, useReviewCount } from "./ReviewCountContext";

vi.mock("../api/transactions", () => ({ getReviewCount: vi.fn() }));

function Probe() {
  const { count } = useReviewCount();
  return <p>count {count}</p>;
}

async function renderProbe() {
  render(
    <ReviewCountProvider refreshKey="/">
      <Probe />
    </ReviewCountProvider>,
  );
  expect(await screen.findByText("count 12")).toBeInTheDocument();
}

beforeEach(() => {
  transactionsApi.getReviewCount.mockResolvedValue({ count: 12 });
});

describe("ReviewCountContext", () => {
  it("reloads after a save is announced", async () => {
    await renderProbe();
    transactionsApi.getReviewCount.mockResolvedValue({ count: 8 });
    await act(async () => notifyDataChanged());
    expect(screen.getByText("count 8")).toBeInTheDocument();
  });

  it("reloads when the tab is shown again", async () => {
    await renderProbe();
    transactionsApi.getReviewCount.mockResolvedValue({ count: 3 });
    await act(async () => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByText("count 3")).toBeInTheDocument();
  });

  it("keeps the count when a reload fails", async () => {
    await renderProbe();
    transactionsApi.getReviewCount.mockRejectedValue(new Error("offline"));
    await act(async () => notifyDataChanged());
    expect(screen.getByText("count 12")).toBeInTheDocument();
  });
});
